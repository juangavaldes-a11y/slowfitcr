import assert from "node:assert/strict";
import test from "node:test";
import { buildRestockPlan, createOrderAdminHandlers, parseCancellationInput } from "../order-admin.mjs";

const jsonResponse = (body, status = 200) => ({ body, status });

function baseState(overrides = {}) {
  return {
    order: {
      id: "o1",
      externalPaymentId: "pay1",
      orderNumber: "1001",
      name: "Ana",
      email: "ana@example.com",
      financialStatus: "paid",
      fulfillmentStatus: "unfulfilled",
      total: "20000",
      currency: "CRC",
      items: [{ variantId: "v1", sku: "SKU-1", quantity: 2, preorder: false }],
      preorderStatus: null,
      inventoryAdjustedAt: new Date("2026-10-01T00:00:00Z"),
      paymentCreatedAt: new Date("2026-10-01T00:00:00Z"),
      cancelledAt: null,
      cancellationReason: null,
      cancelledBy: null,
      updatedAt: new Date("2026-10-01T00:00:00Z"),
      delivery: null,
    },
    reservation: { id: "r1", reference: "pay1", status: "COMMITTED", lines: [{ variantId: "v1", quantity: 2 }] },
    variants: { v1: { productId: "p1", sku: "SKU-1", price: "10000", inventoryQuantity: 3 } },
    products: { p1: 7 },
    metrics: { p1: { unitsSold: 5, revenue: 50000 } },
    ...overrides,
  };
}

function makeHandlers(state, overrides = {}) {
  const model = {
    order: {
      findUnique: async ({ where }) => (state.order && state.order.id === where.id ? state.order : null),
      findMany: async () => [state.order].filter(Boolean),
      count: async ({ where }) => {
        state.lastWhere = where;
        return state.order ? 1 : 0;
      },
      update: async ({ data }) => {
        state.order = { ...state.order, ...data };
        return state.order;
      },
    },
    inventoryReservation: {
      findUnique: async ({ where }) => (state.reservation && state.reservation.reference === where.reference ? state.reservation : null),
      update: async ({ data }) => {
        state.reservation = { ...state.reservation, ...data };
        return state.reservation;
      },
    },
    productVariant: {
      findUnique: async ({ where }) => state.variants[where.id] || null,
      update: async ({ where, data }) => {
        state.variants[where.id].inventoryQuantity += data.inventoryQuantity.increment;
      },
    },
    product: {
      update: async ({ where, data }) => {
        state.products[where.id] = (state.products[where.id] || 0) + data.inventoryTotal.increment;
      },
    },
    productMetric: {
      updateMany: async ({ where, data }) => {
        const metric = state.metrics[where.productId];
        if (metric && metric.unitsSold >= data.unitsSold.decrement) {
          metric.unitsSold -= data.unitsSold.decrement;
          metric.revenue -= data.revenue.decrement;
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
  };
  const prisma = { ...model, $transaction: overrides.transaction ?? (async (fn) => fn(model)) };
  const audits = [];
  const pushed = [];
  const handlers = createOrderAdminHandlers({
    prisma,
    jsonResponse,
    readJson: async (request) => request.body ?? {},
    isAuthorized: async () => true,
    appendAudit: async (action, details) => {
      audits.push({ action, details });
    },
    pushInventory: async (changes) => {
      pushed.push(...changes);
    },
    ...overrides,
  });
  return { handlers, audits, pushed, model };
}

test("parseCancellationInput trims, defaults and rejects invalid reasons", () => {
  assert.deepEqual(parseCancellationInput({}), { reason: null });
  assert.deepEqual(parseCancellationInput({ reason: "  duplicado  " }), { reason: "duplicado" });
  assert.deepEqual(parseCancellationInput({ reason: "   " }), { reason: null });
  assert.throws(() => parseCancellationInput({ reason: 5 }), /INVALID_REASON/);
  assert.throws(() => parseCancellationInput({ reason: "x".repeat(281) }), /INVALID_REASON/);
  assert.throws(() => parseCancellationInput("nope"), /INVALID_PAYLOAD/);
});

test("buildRestockPlan restores reserved lines and mirrors the metric flag", () => {
  const activeOrder = { inventoryAdjustedAt: null, items: [{ variantId: "v1", quantity: 2 }] };
  const active = buildRestockPlan(activeOrder, { status: "ACTIVE", lines: [{ variantId: "v1", quantity: 2 }, { variantId: "v2", quantity: 1 }] });
  assert.deepEqual(active.restock, [{ variantId: "v1", quantity: 2 }, { variantId: "v2", quantity: 1 }]);
  assert.equal(active.releaseReservation, true);
  assert.equal(active.adjustMetric, false);

  const committed = buildRestockPlan({ inventoryAdjustedAt: new Date(), items: [] }, { status: "COMMITTED", lines: [{ variantId: "v1", quantity: 3 }] });
  assert.equal(committed.adjustMetric, true);

  const legacy = buildRestockPlan(
    { inventoryAdjustedAt: new Date(), items: [
      { variantId: "v1", quantity: 1 },
      { variantId: "v1", quantity: 2 },
      { variantId: "v2", quantity: 1, preorder: true },
      { variantId: "", quantity: 4 },
    ] },
    null,
  );
  assert.deepEqual(legacy.restock, [{ variantId: "v1", quantity: 3 }]);
  assert.equal(legacy.releaseReservation, false);
  assert.equal(legacy.adjustMetric, true);
});

test("order handlers reject unauthorized requests", async () => {
  const { handlers } = makeHandlers(baseState(), { isAuthorized: async () => false });
  assert.equal((await handlers.listOrders({ url: "http://x/api/admin/orders" })).status, 401);
  assert.equal((await handlers.cancelOrder({ url: "http://x", body: {} }, "o1")).status, 401);
});

test("listOrders builds the status and search filters", async () => {
  const state = baseState();
  const { handlers } = makeHandlers(state);
  const cancelled = await handlers.listOrders({ url: "http://x/api/admin/orders?status=cancelled&search=ana" });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.total, 1);
  assert.deepEqual(state.lastWhere.cancelledAt, { not: null });
  assert.equal(state.lastWhere.OR.length, 3);

  await handlers.listOrders({ url: "http://x/api/admin/orders?status=active" });
  assert.equal(state.lastWhere.cancelledAt, null);

  await handlers.listOrders({ url: "http://x/api/admin/orders" });
  assert.equal("cancelledAt" in state.lastWhere, false);
  assert.equal("OR" in state.lastWhere, false);

  const paged = await handlers.listOrders({ url: "http://x/api/admin/orders?page=2&pageSize=5" });
  assert.equal(paged.status, 200);
});

test("cancelling a committed order restores stock, releases the reservation and reverts the metric", async () => {
  const state = baseState();
  const { handlers, audits, pushed } = makeHandlers(state);
  const response = await handlers.cancelOrder({ url: "http://x", body: { reason: "cliente cancelo" } }, "o1");

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(state.variants.v1.inventoryQuantity, 5);
  assert.equal(state.products.p1, 9);
  assert.equal(state.metrics.p1.unitsSold, 3);
  assert.equal(state.metrics.p1.revenue, 30000);
  assert.equal(state.reservation.status, "RELEASED");
  assert.ok(state.reservation.releasedAt instanceof Date);
  assert.ok(state.order.cancelledAt instanceof Date);
  assert.equal(state.order.cancellationReason, "cliente cancelo");
  assert.equal(state.order.cancelledBy, "moderator");
  assert.deepEqual(pushed, [{ sku: "SKU-1", delta: 2 }]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "order.cancelled");
  assert.deepEqual(audits[0].details.deltas, [{ sku: "SKU-1", delta: 2 }]);
});

test("cancelling an active reservation restores stock without touching the metric", async () => {
  const state = baseState({
    order: { ...baseState().order, inventoryAdjustedAt: null },
    reservation: { id: "r1", reference: "pay1", status: "ACTIVE", lines: [{ variantId: "v1", quantity: 2 }] },
  });
  const { handlers } = makeHandlers(state);
  const response = await handlers.cancelOrder({ url: "http://x", body: {} }, "o1");

  assert.equal(response.status, 200);
  assert.equal(state.variants.v1.inventoryQuantity, 5);
  assert.equal(state.metrics.p1.unitsSold, 5);
  assert.equal(state.reservation.status, "RELEASED");
  assert.equal(state.order.cancellationReason, null);
});

test("cancelling an order without a reservation uses the order lines", async () => {
  const state = baseState({
    reservation: null,
    order: {
      ...baseState().order,
      externalPaymentId: null,
      items: [
        { variantId: "v1", sku: "SKU-1", quantity: 1, preorder: false },
        { variantId: "v2", sku: "SKU-2", quantity: 1, preorder: true },
      ],
    },
    variants: {
      v1: { productId: "p1", sku: "SKU-1", price: "10000", inventoryQuantity: 3 },
      v2: { productId: "p2", sku: "SKU-2", price: "5000", inventoryQuantity: 0 },
    },
    products: { p1: 7, p2: 0 },
    metrics: { p1: { unitsSold: 5, revenue: 50000 } },
  });
  const { handlers, pushed } = makeHandlers(state);
  const response = await handlers.cancelOrder({ url: "http://x", body: {} }, "o1");

  assert.equal(response.status, 200);
  assert.equal(state.variants.v1.inventoryQuantity, 4);
  assert.equal(state.variants.v2.inventoryQuantity, 0);
  assert.equal(state.products.p1, 8);
  assert.equal(state.metrics.p1.unitsSold, 4);
  assert.deepEqual(pushed, [{ sku: "SKU-1", delta: 1 }]);
});

test("cancelling reports missing, already-cancelled and invalid requests", async () => {
  const missing = makeHandlers(baseState({ order: null }));
  assert.equal((await missing.handlers.cancelOrder({ url: "http://x", body: {} }, "o1")).status, 404);

  const already = makeHandlers(baseState({ order: { ...baseState().order, cancelledAt: new Date() } }));
  assert.equal((await already.handlers.cancelOrder({ url: "http://x", body: {} }, "o1")).status, 409);
  assert.deepEqual(already.pushed, []);

  const invalid = makeHandlers(baseState());
  assert.equal((await invalid.handlers.cancelOrder({ url: "http://x", body: { reason: "x".repeat(281) } }, "o1")).status, 400);
});

test("cancelOrder retries serialization conflicts then succeeds", async () => {
  const state = baseState();
  let attempts = 0;
  let model;
  const { handlers, model: built } = makeHandlers(state, {
    transaction: async (fn) => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("serialization"), { code: "P2034" });
      return fn(model);
    },
  });
  model = built;

  const response = await handlers.cancelOrder({ url: "http://x", body: {} }, "o1");
  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
  assert.equal(state.variants.v1.inventoryQuantity, 5);
});
