import assert from "node:assert/strict";
import test from "node:test";
import { buildInventoryView } from "../inventory-admin.mjs";
import { createLayawayHandlers, deadlineFrom, depositFor, heldBySize, layawayPhase, worstPhase } from "../layaways.mjs";

const DAY = 86_400_000;
const NOW = new Date("2026-11-01T12:00:00Z");

test("depositFor is 20% rounded up to the next whole colon", () => {
  assert.equal(depositFor(15000), 3000);
  assert.equal(depositFor(15001), 3001);
  assert.equal(depositFor(12990), 2598);
  assert.equal(depositFor(12995), 2599);
  assert.equal(depositFor(1), 1);
});

test("layawayPhase flags the last 10 days and the expired layaways", () => {
  const start = new Date(NOW.getTime() - 20 * DAY);
  const active = (expiresAt) => ({ status: "ACTIVE", expiresAt });
  assert.equal(deadlineFrom(start).getTime() - start.getTime(), 45 * DAY);
  assert.equal(layawayPhase(active(new Date(NOW.getTime() + 25 * DAY + 1)), NOW), "OK");
  assert.equal(layawayPhase(active(new Date(NOW.getTime() + 10 * DAY)), NOW), "WARNING");
  assert.equal(layawayPhase(active(new Date(NOW.getTime() + 1000)), NOW), "WARNING");
  assert.equal(layawayPhase(active(NOW), NOW), "EXPIRED");
  assert.equal(layawayPhase({ status: "PENDING_PAYMENT", expiresAt: null }, NOW), null);
  assert.equal(layawayPhase({ status: "RELEASED", expiresAt: new Date(0) }, NOW), null);
  assert.equal(worstPhase(["OK", "WARNING", "EXPIRED"]), "EXPIRED");
  assert.equal(worstPhase(["OK", "WARNING"]), "WARNING");
  assert.equal(worstPhase(["OK"]), null);
});

test("heldBySize only counts layaways that still hold a piece", () => {
  const held = heldBySize([
    { lineId: "l1", size: "M", status: "ACTIVE" },
    { lineId: "l1", size: "M", status: "PENDING_PAYMENT" },
    { lineId: "l1", size: "S", status: "RELEASED" },
  ]);
  assert.deepEqual(held.get("l1"), { M: 2 });
});

test("buildInventoryView takes held pieces out of the remaining stock and exposes the row phase", () => {
  const layaway = (id, expiresAt) => ({ id, lineId: "l1", size: "M", status: "ACTIVE", unitPriceCrc: 20000, depositCrc: 4000, expiresAt });
  const view = buildInventoryView(
    { fxRate: 500, crShippingUsd: 0, nationalizationCrc: 0, otherImportCrc: 0 },
    [{ id: "l1", code: "A", productName: "Top", color: "Black", sizes: { S: 1, M: 3 }, piecesPerGarment: 1, unitPriceUsd: 10, salePriceCrc: 20000 }],
    [],
    [layaway("a", new Date(NOW.getTime() + 30 * DAY)), layaway("b", new Date(NOW.getTime() + 5 * DAY))],
    NOW,
  );
  const [line] = view.lines;
  assert.equal(line.remaining.M, 1);
  assert.equal(line.remainingQuantity, 2);
  assert.equal(line.layawayPhase, "WARNING");
  assert.equal(line.layaways.length, 2);
  const expired = buildInventoryView({}, [{ id: "l1", code: "A", productName: "Top", color: "Black", sizes: { M: 1 }, piecesPerGarment: 1, unitPriceUsd: 10 }], [], [layaway("c", new Date(NOW.getTime() - DAY))], NOW);
  assert.equal(expired.lines[0].layawayPhase, "EXPIRED");
  assert.equal(expired.lines[0].remaining.M, 0);
});

// Minimal in-memory prisma covering what the layaway handlers use.
function fakePrisma({ lines = [], customers = [], variants = [] } = {}) {
  const db = { layaways: [], notifications: [], sales: [], stock: [] };
  let sequence = 0;
  const matches = (row, where = {}) => Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("in" in condition) return condition.in.includes(row[key]);
      if ("lte" in condition) return row[key] != null && row[key] <= condition.lte;
    }
    return row[key] === condition || (condition === null && row[key] == null);
  });
  const layaway = {
    findMany: async ({ where } = {}) => db.layaways.filter((row) => matches(row, where)).map((row) => ({ ...row, line: lines.find((l) => l.id === row.lineId) })),
    findUnique: async ({ where }) => {
      const row = db.layaways.find((item) => matches(item, where));
      return row ? { ...row, line: lines.find((l) => l.id === row.lineId) } : null;
    },
    count: async ({ where }) => db.layaways.filter((row) => matches(row, where)).length,
    create: async ({ data }) => {
      const row = { id: `lay${++sequence}`, createdAt: NOW, warnedAt: null, expiredNotifiedAt: null, holdExpiresAt: null, startedAt: null, expiresAt: null, note: "", ...data };
      db.layaways.push(row);
      return { ...row, line: lines.find((l) => l.id === row.lineId) };
    },
    update: async ({ where, data }) => Object.assign(db.layaways.find((row) => row.id === where.id), data),
    updateMany: async ({ where, data }) => {
      const rows = db.layaways.filter((row) => matches(row, where));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    },
  };
  const prisma = {
    layaway,
    inventoryLine: { findUnique: async ({ where }) => lines.find((l) => l.id === where.id) ?? null, findFirst: async ({ where }) => lines.find((l) => l.productHandle === where.productHandle && l.color === where.color) ?? null },
    inventorySale: {
      findMany: async () => db.sales,
      create: async ({ data }) => { const row = { id: `sale${++sequence}`, ...data }; db.sales.push(row); return row; },
    },
    customer: {
      findUnique: async ({ where }) => customers.find((c) => c.id === where.id || c.email === where.email) ?? null,
    },
    productVariant: { findUnique: async ({ where }) => variants.find((v) => v.id === where.id) ?? null },
    notification: {
      createMany: async ({ data }) => {
        for (const row of data) {
          if (db.notifications.some((n) => n.layawayId === row.layawayId && n.kind === row.kind && n.audience === row.audience)) continue;
          db.notifications.push({ id: `n${++sequence}`, readAt: null, createdAt: NOW, ...row });
        }
      },
      findMany: async ({ where }) => db.notifications.filter((row) => matches(row, where)),
      count: async ({ where }) => db.notifications.filter((row) => matches(row, where)).length,
      updateMany: async ({ where, data }) => {
        const { id, ...rest } = where;
        const rows = db.notifications.filter((row) => matches(row, rest) && (!id || id.in.includes(row.id)));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    },
    $transaction: async (fn) => fn(prisma),
  };
  return { prisma, db };
}

const response = (body, status = 200) => ({ body, status });
const line = { id: "l1", code: "A1", productName: "Top", color: "Black", productHandle: "top", sizes: { S: 0, M: 1, L: 0, XL: 0, OS: 0 }, salePriceCrc: 15001 };

function setup(overrides = {}) {
  const { prisma, db } = fakePrisma({ lines: [line], customers: [{ id: "c1", email: "ana@example.com", firstName: "Ana", lastName: "Mora" }], ...overrides });
  const synced = [];
  const state = { admin: true, session: { customerId: "c1" }, body: {}, clock: NOW };
  const handlers = createLayawayHandlers({
    prisma,
    jsonResponse: response,
    readJson: async () => state.body,
    isAdmin: async () => state.admin,
    getCustomerSession: () => state.session,
    appendAudit: async () => undefined,
    syncStorefrontStock: async (_tx, target, size, delta) => { synced.push([target.id, size, delta]); return null; },
    loadInventoryView: async () => ({ lines: [] }),
    createCheckout: async () => "https://pay.test/checkout",
    now: () => state.clock,
  });
  return { handlers, db, synced, state };
}

test("admin layaway holds the piece for 45 days with a rounded-up 20% deposit", async () => {
  const { handlers, db, synced, state } = setup();
  state.body = { lineId: "l1", size: "M", customerName: "Ana Mora", customerEmail: "ana@example.com" };
  assert.equal((await handlers.createAdminLayaway({})).status, 201);
  const [created] = db.layaways;
  assert.equal(created.status, "ACTIVE");
  assert.equal(created.depositCrc, 3001);
  assert.equal(created.customerId, "c1");
  assert.equal(created.expiresAt.getTime() - NOW.getTime(), 45 * DAY);
  assert.deepEqual(synced, [["l1", "M", -1]]);
  // The only piece is held now, so a second layaway cannot be created.
  assert.equal((await handlers.createAdminLayaway({})).status, 409);
  state.admin = false;
  assert.equal((await handlers.createAdminLayaway({})).status, 401);
});

test("release puts the piece back and cannot run twice", async () => {
  const { handlers, db, synced, state } = setup();
  state.body = { lineId: "l1", size: "M", customerName: "Walk-in" };
  await handlers.createAdminLayaway({});
  const [{ id }] = db.layaways;
  assert.equal((await handlers.releaseLayaway({}, id)).status, 200);
  assert.equal(db.layaways[0].status, "RELEASED");
  assert.deepEqual(synced.at(-1), ["l1", "M", 1]);
  assert.equal((await handlers.releaseLayaway({}, id)).status, 400);
  assert.equal((await handlers.releaseLayaway({}, "missing")).status, 404);
});

test("processDeadlines warns at 10 days and again when expired, once per audience", async () => {
  const { handlers, db, state } = setup();
  state.body = { lineId: "l1", size: "M", customerName: "Ana Mora", customerEmail: "ana@example.com" };
  await handlers.createAdminLayaway({});
  const kinds = () => db.notifications.map((n) => `${n.audience}:${n.kind}`).sort();

  state.clock = new Date(NOW.getTime() + 34 * DAY);
  assert.deepEqual(await handlers.processDeadlines(), { warned: 0, expired: 0 });
  state.clock = new Date(NOW.getTime() + 35 * DAY);
  assert.equal((await handlers.processDeadlines()).warned, 1);
  assert.equal((await handlers.processDeadlines()).warned, 0);
  assert.deepEqual(kinds(), ["ADMIN:LAYAWAY_WARNING", "CUSTOMER:LAYAWAY_WARNING"]);

  state.clock = new Date(NOW.getTime() + 45 * DAY);
  assert.equal((await handlers.processDeadlines()).expired, 1);
  assert.equal((await handlers.processDeadlines()).expired, 0);
  assert.equal(db.notifications.length, 4);
  assert.equal(db.layaways[0].status, "ACTIVE");
});

test("layaways without a site account only notify the administrator", async () => {
  const { handlers, db, state } = setup();
  state.body = { lineId: "l1", size: "M", customerName: "Walk-in" };
  await handlers.createAdminLayaway({});
  state.clock = new Date(NOW.getTime() + 46 * DAY);
  await handlers.processDeadlines();
  assert.deepEqual(db.notifications.map((n) => n.audience), ["ADMIN"]);
});

test("customer request holds the piece pending the deposit and notifies the admin", async () => {
  const variant = { id: "v1", size: "M", color: "Black", price: 15001, sku: "S1", title: "M / Black", product: { handle: "top", status: "ACTIVE", published: true } };
  const { handlers, db, state } = setup({ variants: [variant] });
  state.body = { variantId: "v1", mode: "request" };
  const created = await handlers.createCustomerLayaway({});
  assert.equal(created.status, 201);
  assert.equal(created.body.layaway.status, "PENDING_PAYMENT");
  assert.equal(created.body.checkoutUrl, null);
  assert.equal(db.layaways[0].depositCrc, 3001);
  assert.deepEqual(db.notifications.map((n) => [n.audience, n.kind]), [["ADMIN", "LAYAWAY_REQUESTED"]]);

  assert.equal((await handlers.confirmDeposit({}, db.layaways[0].id)).status, 200);
  assert.equal(db.layaways[0].status, "ACTIVE");
  assert.equal(db.layaways[0].expiresAt.getTime() - NOW.getTime(), 45 * DAY);
  assert.equal((await handlers.confirmDeposit({}, db.layaways[0].id)).status, 400);
  assert.equal((await handlers.listCustomerLayaways({})).body.layaways.length, 1);
});

test("unpaid customer holds are released after 48 hours", async () => {
  const variant = { id: "v1", size: "M", color: "Black", price: 15001, product: { handle: "top", status: "ACTIVE", published: true } };
  const { handlers, db, synced, state } = setup({ variants: [variant] });
  state.body = { variantId: "v1", mode: "request" };
  await handlers.createCustomerLayaway({});
  state.clock = new Date(NOW.getTime() + 49 * 3_600_000);
  assert.equal(await handlers.releaseStaleHolds(), 1);
  assert.equal(await handlers.releaseStaleHolds(), 0);
  assert.equal(db.layaways[0].status, "RELEASED");
  assert.deepEqual(synced.at(-1), ["l1", "M", 1]);
});

test("online layaway returns the checkout and the payment webhook activates it", async () => {
  const variant = { id: "v1", size: "M", color: "Black", price: 15001, sku: "S1", title: "M / Black", product: { handle: "top", status: "ACTIVE", published: true } };
  const { handlers, db, state } = setup({ variants: [variant] });
  state.body = { variantId: "v1", mode: "online" };
  const created = await handlers.createCustomerLayaway({});
  assert.equal(created.body.checkoutUrl, "https://pay.test/checkout");
  const reference = db.layaways[0].paymentReference;
  assert.ok(reference);
  await handlers.handlePaymentEvent("payment.paid", reference);
  assert.equal(db.layaways[0].status, "ACTIVE");
  assert.deepEqual(db.notifications.map((n) => n.kind), ["LAYAWAY_PAID"]);
});

test("a payment that arrives after the hold lapsed re-holds the piece or flags a conflict", async () => {
  const variant = { id: "v1", size: "M", color: "Black", price: 15001, sku: "S1", title: "M / Black", product: { handle: "top", status: "ACTIVE", published: true } };
  const { handlers, db, state } = setup({ variants: [variant] });
  state.body = { variantId: "v1", mode: "online" };
  await handlers.createCustomerLayaway({});
  const [first] = db.layaways;
  await handlers.releaseLayaway({}, first.id);
  await handlers.handlePaymentEvent("payment.paid", first.paymentReference);
  assert.equal(first.status, "ACTIVE");

  // Release again and let someone else take the only piece: the late payment is flagged for a manual refund.
  await handlers.releaseLayaway({}, first.id);
  state.body = { lineId: "l1", size: "M", customerName: "Someone else" };
  await handlers.createAdminLayaway({});
  await handlers.handlePaymentEvent("payment.paid", first.paymentReference);
  assert.equal(first.status, "RELEASED");
  assert.ok(db.notifications.some((n) => n.kind === "LAYAWAY_PAYMENT_CONFLICT"));
});

test("a failed online payment gives the piece back and checkout errors release the hold", async () => {
  const variant = { id: "v1", size: "M", color: "Black", price: 15001, product: { handle: "top", status: "ACTIVE", published: true } };
  const { handlers, db, state } = setup({ variants: [variant] });
  state.body = { variantId: "v1", mode: "online" };
  await handlers.createCustomerLayaway({});
  await handlers.handlePaymentEvent("payment.failed", db.layaways[0].paymentReference);
  assert.equal(db.layaways[0].status, "RELEASED");
  await handlers.handlePaymentEvent("payment.paid", "unknown-reference");
});

test("converting a layaway records a full-price sale without touching storefront stock", async () => {
  const { handlers, db, synced, state } = setup();
  state.body = { lineId: "l1", size: "M", customerName: "Ana Mora", unitPriceCrc: 15000 };
  await handlers.createAdminLayaway({});
  const [{ id }] = db.layaways;
  const syncedBefore = synced.length;

  state.body = {};
  assert.equal((await handlers.completeLayaway({}, id)).status, 400);
  state.body = { paymentMethod: "SINPE" };
  assert.equal((await handlers.completeLayaway({}, id)).status, 200);
  assert.equal(db.layaways[0].status, "COMPLETED");
  assert.equal(db.layaways[0].saleId, db.sales[0].id);
  assert.deepEqual([db.sales[0].size, db.sales[0].quantity, db.sales[0].unitPriceCrc, db.sales[0].source], ["M", 1, 15000, "LAYAWAY"]);
  assert.equal(synced.length, syncedBefore);
  assert.equal((await handlers.completeLayaway({}, id)).status, 400);
  assert.equal((await handlers.completeLayaway({}, "missing")).status, 404);
  assert.equal((await handlers.releaseLayaway({}, id)).status, 400);
  state.admin = false;
  assert.equal((await handlers.completeLayaway({}, id)).status, 401);
});

test("customers cannot layaway items that are not in the inventory and must be signed in", async () => {
  const stray = { id: "v2", size: "M", color: "Red", price: 9000, product: { handle: "other", status: "ACTIVE", published: true } };
  const { handlers, state } = setup({ variants: [stray] });
  state.body = { variantId: "v2", mode: "request" };
  assert.equal((await handlers.createCustomerLayaway({})).status, 409);
  state.body = { variantId: "v2", mode: "nope" };
  assert.equal((await handlers.createCustomerLayaway({})).status, 400);
  state.session = null;
  assert.equal((await handlers.createCustomerLayaway({})).status, 401);
  assert.equal((await handlers.listCustomerNotifications({})).status, 401);
});

test("notification feeds are scoped by audience and can be marked as read", async () => {
  const { handlers, db, state } = setup();
  state.body = { lineId: "l1", size: "M", customerName: "Ana Mora", customerEmail: "ana@example.com" };
  await handlers.createAdminLayaway({});
  state.clock = new Date(NOW.getTime() + 36 * DAY);
  await handlers.processDeadlines();
  const admin = await handlers.listAdminNotifications({});
  assert.equal(admin.body.unread, 1);
  const customer = await handlers.listCustomerNotifications({});
  assert.equal(customer.body.notifications.length, 1);
  state.body = { ids: [admin.body.notifications[0].id] };
  await handlers.markAdminNotificationsRead({});
  assert.equal((await handlers.listAdminNotifications({})).body.unread, 0);
  assert.equal(db.notifications.find((n) => n.audience === "CUSTOMER").readAt, null);
  state.body = { all: true };
  await handlers.markCustomerNotificationsRead({});
  assert.equal((await handlers.listCustomerNotifications({})).body.unread, 0);
  state.body = {};
  assert.equal((await handlers.markAdminNotificationsRead({})).status, 400);
  state.admin = false;
  assert.equal((await handlers.listAdminNotifications({})).status, 401);
});
