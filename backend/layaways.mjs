import { randomUUID } from "node:crypto";
import { SIZE_KEYS } from "./inventory-costing.mjs";

export const LAYAWAY_DAYS = 45;
export const WARNING_DAYS = 10;
export const PENDING_HOLD_HOURS = 48;
export const DEPOSIT_PERCENT = 20;
export const SALE_SOURCE = "LAYAWAY";
export const HOLDING_STATUSES = ["PENDING_PAYMENT", "ACTIVE"];
const MAX_PENDING_PER_CUSTOMER = 3;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// The deposit is 20% of the price rounded up to the next whole colon.
export const depositFor = (price) => Math.ceil(Number((Number(price) * DEPOSIT_PERCENT / 100).toFixed(6)));

export const deadlineFrom = (start) => new Date(start.getTime() + LAYAWAY_DAYS * DAY_MS);

// Phase of an active layaway: OK, WARNING (10 days or less left) or EXPIRED (past the deadline).
export function layawayPhase(layaway, now = new Date()) {
  if (layaway.status !== "ACTIVE" || !layaway.expiresAt) return null;
  const left = new Date(layaway.expiresAt).getTime() - now.getTime();
  if (left <= 0) return "EXPIRED";
  return left <= WARNING_DAYS * DAY_MS ? "WARNING" : "OK";
}

export function worstPhase(phases) {
  if (phases.includes("EXPIRED")) return "EXPIRED";
  return phases.includes("WARNING") ? "WARNING" : null;
}

// lineId -> { size: held units } for layaways that still keep a piece out of the inventory.
export function heldBySize(layaways) {
  const map = new Map();
  for (const layaway of layaways) {
    if (!HOLDING_STATUSES.includes(layaway.status)) continue;
    const entry = map.get(layaway.lineId) ?? {};
    entry[layaway.size] = (entry[layaway.size] ?? 0) + 1;
    map.set(layaway.lineId, entry);
  }
  return map;
}

export function serializeLayaway(layaway, now = new Date()) {
  return {
    id: layaway.id,
    lineId: layaway.lineId,
    size: layaway.size,
    status: layaway.status,
    phase: layawayPhase(layaway, now),
    source: layaway.source,
    unitPriceCrc: Number(layaway.unitPriceCrc),
    depositCrc: Number(layaway.depositCrc),
    customerName: layaway.customerName,
    customerEmail: layaway.customerEmail,
    note: layaway.note,
    holdExpiresAt: layaway.holdExpiresAt,
    startedAt: layaway.startedAt,
    expiresAt: layaway.expiresAt,
    createdAt: layaway.createdAt,
    ...(layaway.line ? { line: { code: layaway.line.code, productName: layaway.line.productName, color: layaway.line.color } } : {}),
  };
}

const notificationParams = (layaway) => ({
  layawayId: layaway.id,
  code: layaway.line?.code ?? null,
  productName: layaway.line?.productName ?? null,
  color: layaway.line?.color ?? null,
  size: layaway.size,
  customerName: layaway.customerName,
  expiresAt: layaway.expiresAt,
});

const ERROR_STATUS = { NOT_FOUND: 404, UNAVAILABLE: 409, NOT_LAYAWAY_ELIGIBLE: 409, LIMIT_REACHED: 409, PAYMENT_NOT_CONFIGURED: 503, PAYMENT_PROVIDER_ERROR: 502 };

export function createLayawayHandlers({
  prisma, jsonResponse, readJson, isAdmin, getCustomerSession, appendAudit, syncStorefrontStock,
  pushInventory = async () => undefined, loadInventoryView, createCheckout, now = () => new Date(),
}) {
  const fail = (handler) => async (request, ...args) => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof SyntaxError) return jsonResponse({ error: "Invalid JSON" }, 400);
      const message = error?.message ?? "";
      if (ERROR_STATUS[message]) return jsonResponse({ error: message }, ERROR_STATUS[message]);
      if (/^(INVALID|MISSING|ALREADY)/.test(message)) return jsonResponse({ error: message }, 400);
      throw error;
    }
  };
  const adminOnly = (handler) => fail(async (request, ...args) => {
    if (!(await isAdmin(request))) return jsonResponse({ error: "Unauthorized" }, 401);
    return handler(request, ...args);
  });
  const customerOnly = (handler) => fail(async (request, ...args) => {
    const session = getCustomerSession(request);
    if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
    return handler(request, session, ...args);
  });

  const availableUnits = async (transaction, line, size) => {
    const [sales, held] = await Promise.all([
      transaction.inventorySale.findMany({ where: { lineId: line.id, size, voidedAt: null } }),
      transaction.layaway.count({ where: { lineId: line.id, size, status: { in: HOLDING_STATUSES } } }),
    ]);
    return (line.sizes[size] ?? 0) - sales.reduce((total, sale) => total + sale.quantity - sale.restockedQuantity, 0) - held;
  };

  // Takes one piece out of the inventory (and the storefront stock) by creating the layaway row in one transaction.
  const holdPiece = async (data) => {
    const changes = [];
    const layaway = await prisma.$transaction(async (transaction) => {
      const line = await transaction.inventoryLine.findUnique({ where: { id: data.lineId } });
      if (!line) throw new Error("NOT_FOUND");
      if ((await availableUnits(transaction, line, data.size)) < 1) throw new Error("UNAVAILABLE");
      const created = await transaction.layaway.create({ data, include: { line: true } });
      changes.push(await syncStorefrontStock(transaction, line, data.size, -1));
      return created;
    }, { isolationLevel: "Serializable" });
    await pushInventory(changes.filter(Boolean));
    return layaway;
  };

  const releasePiece = async (layawayId) => {
    const changes = [];
    const released = await prisma.$transaction(async (transaction) => {
      const claimed = await transaction.layaway.updateMany({
        where: { id: layawayId, status: { in: HOLDING_STATUSES } },
        data: { status: "RELEASED", releasedAt: now() },
      });
      if (claimed.count !== 1) return false;
      const layaway = await transaction.layaway.findUnique({ where: { id: layawayId }, include: { line: true } });
      changes.push(await syncStorefrontStock(transaction, layaway.line, layaway.size, 1));
      return true;
    });
    await pushInventory(changes.filter(Boolean));
    return released;
  };

  const reclaimPiece = async (layaway) => {
    const changes = [];
    const reclaimed = await prisma.$transaction(async (transaction) => {
      const line = await transaction.inventoryLine.findUnique({ where: { id: layaway.lineId } });
      if ((await availableUnits(transaction, line, layaway.size)) < 1) return false;
      const at = now();
      await transaction.layaway.update({
        where: { id: layaway.id },
        data: { status: "ACTIVE", startedAt: at, expiresAt: deadlineFrom(at), holdExpiresAt: null, releasedAt: null },
      });
      changes.push(await syncStorefrontStock(transaction, line, layaway.size, -1));
      return true;
    }, { isolationLevel: "Serializable" });
    await pushInventory(changes.filter(Boolean));
    return reclaimed;
  };

  const activate = (layawayId, at) => prisma.layaway.updateMany({
    where: { id: layawayId, status: "PENDING_PAYMENT" },
    data: { status: "ACTIVE", startedAt: at, expiresAt: deadlineFrom(at), holdExpiresAt: null },
  });

  const notify = (rows) => rows.length ? prisma.notification.createMany({ data: rows, skipDuplicates: true }) : null;

  // Frees pieces held for a deposit that never arrived (48 hours). Cheap, so it runs more often than the daily deadline check.
  const releaseStaleHolds = async () => {
    const stale = await prisma.layaway.findMany({ where: { status: "PENDING_PAYMENT", holdExpiresAt: { lte: now() } }, select: { id: true }, take: 100 });
    let released = 0;
    for (const row of stale) if (await releasePiece(row.id)) released += 1;
    return released;
  };

  // Daily check of the 45-day deadlines. Idempotent: the claim on warnedAt/expiredNotifiedAt and the unique notification key both stop duplicates.
  const processDeadlines = async () => {
    const at = now();
    const result = { warned: 0, expired: 0 };

    const due = await prisma.layaway.findMany({
      where: { status: "ACTIVE", expiresAt: { lte: new Date(at.getTime() + WARNING_DAYS * DAY_MS) } },
      include: { line: true },
      take: 200,
    });
    for (const layaway of due) {
      const expired = layaway.expiresAt <= at;
      const marker = expired ? "expiredNotifiedAt" : "warnedAt";
      if (layaway[marker]) continue;
      const claimed = await prisma.layaway.updateMany({ where: { id: layaway.id, [marker]: null }, data: { [marker]: at } });
      if (claimed.count !== 1) continue;
      const kind = expired ? "LAYAWAY_EXPIRED" : "LAYAWAY_WARNING";
      const params = notificationParams(layaway);
      await notify([
        { audience: "ADMIN", kind, layawayId: layaway.id, params },
        ...(layaway.customerId ? [{ audience: "CUSTOMER", customerId: layaway.customerId, kind, layawayId: layaway.id, params }] : []),
      ]);
      result[expired ? "expired" : "warned"] += 1;
    }
    return result;
  };

  const customerIdByEmail = async (email) => email
    ? (await prisma.customer.findUnique({ where: { email }, select: { id: true } }))?.id ?? null
    : null;

  const createAdminLayaway = adminOnly(async (request) => {
    const body = await readJson(request);
    const size = String(body.size || "").trim();
    if (!SIZE_KEYS.includes(size)) throw new Error("INVALID_SIZE");
    const customerName = String(body.customerName || "").trim().slice(0, 160);
    if (!customerName) throw new Error("INVALID_TEXT");
    const customerEmail = String(body.customerEmail || "").trim().toLowerCase().slice(0, 254) || null;
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("INVALID_EMAIL");
    const line = await prisma.inventoryLine.findUnique({ where: { id: String(body.lineId || "") } });
    if (!line) throw new Error("NOT_FOUND");
    const unitPriceCrc = Number(body.unitPriceCrc ?? line.salePriceCrc);
    if (!Number.isFinite(unitPriceCrc) || unitPriceCrc <= 0) throw new Error("INVALID_PRICE");
    const startedAt = now();
    const layaway = await holdPiece({
      lineId: line.id, size, unitPriceCrc, depositCrc: depositFor(unitPriceCrc), status: "ACTIVE", source: "ADMIN",
      customerName, customerEmail, customerId: await customerIdByEmail(customerEmail),
      note: String(body.note || "").slice(0, 500), startedAt, expiresAt: deadlineFrom(startedAt),
    });
    await appendAudit("layaway.created", { layawayId: layaway.id, lineId: line.id, size, depositCrc: Number(layaway.depositCrc) }, "admin");
    return jsonResponse(await loadInventoryView(), 201);
  });

  const listAdminLayaways = adminOnly(async () => {
    const layaways = await prisma.layaway.findMany({ include: { line: true }, orderBy: { createdAt: "desc" }, take: 300 });
    return jsonResponse({ layaways: layaways.map((layaway) => serializeLayaway(layaway, now())) });
  });

  const confirmDeposit = adminOnly(async (request, layawayId) => {
    const layaway = await prisma.layaway.findUnique({ where: { id: layawayId } });
    if (!layaway) throw new Error("NOT_FOUND");
    if (layaway.status === "ACTIVE") throw new Error("ALREADY_ACTIVE");
    if (layaway.status === "RELEASED") throw new Error("ALREADY_RELEASED");
    await activate(layawayId, now());
    await appendAudit("layaway.deposit_confirmed", { layawayId }, "admin");
    return jsonResponse(await loadInventoryView());
  });

  const releaseLayaway = adminOnly(async (request, layawayId) => {
    if (!(await prisma.layaway.findUnique({ where: { id: layawayId }, select: { id: true } }))) throw new Error("NOT_FOUND");
    if (!(await releasePiece(layawayId))) throw new Error("ALREADY_RELEASED");
    await appendAudit("layaway.released", { layawayId }, "admin");
    return jsonResponse(await loadInventoryView());
  });

  // The customer picked the piece up and paid the rest: the layaway becomes a regular sale at the full price.
  // Storefront stock was already reduced when the piece was held, so nothing is synced here.
  const completeLayaway = adminOnly(async (request, layawayId) => {
    const body = await readJson(request);
    const paymentMethod = String(body.paymentMethod || "").trim();
    if (!paymentMethod || paymentMethod.length > 60) throw new Error("INVALID_PAYMENT_METHOD");
    await prisma.$transaction(async (transaction) => {
      const layaway = await transaction.layaway.findUnique({ where: { id: layawayId } });
      if (!layaway) throw new Error("NOT_FOUND");
      if (layaway.status === "COMPLETED") throw new Error("ALREADY_COMPLETED");
      if (layaway.status !== "ACTIVE") throw new Error("INVALID_STATUS");
      const sale = await transaction.inventorySale.create({
        data: {
          lineId: layaway.lineId, size: layaway.size, quantity: 1, unitPriceCrc: layaway.unitPriceCrc, discountCrc: 0,
          soldAt: now(), paymentMethod, source: SALE_SOURCE,
          note: [`Apartado de ${layaway.customerName || "cliente"} (deposito ${Number(layaway.depositCrc)} CRC)`, layaway.note].filter(Boolean).join(" | ").slice(0, 500),
        },
      });
      await transaction.layaway.update({ where: { id: layawayId }, data: { status: "COMPLETED", completedAt: now(), saleId: sale.id } });
    });
    await appendAudit("layaway.completed", { layawayId, paymentMethod }, "admin");
    return jsonResponse(await loadInventoryView());
  });

  const createCustomerLayaway = customerOnly(async (request, session) => {
    const body = await readJson(request);
    const online = body.mode === "online";
    if (!online && body.mode !== "request") throw new Error("INVALID_MODE");
    const customer = await prisma.customer.findUnique({ where: { id: session.customerId } });
    if (!customer) throw new Error("NOT_FOUND");
    const variant = await prisma.productVariant.findUnique({
      where: { id: String(body.variantId || "") },
      include: { product: { select: { handle: true, status: true, published: true } } },
    });
    if (!variant || variant.product.status !== "ACTIVE" || !variant.product.published) throw new Error("NOT_FOUND");
    const size = variant.size === "One Size" ? "OS" : variant.size;
    const line = SIZE_KEYS.includes(size) && variant.color
      ? await prisma.inventoryLine.findFirst({ where: { productHandle: variant.product.handle, color: variant.color } })
      : null;
    if (!line) throw new Error("NOT_LAYAWAY_ELIGIBLE");
    const pending = await prisma.layaway.count({ where: { customerId: customer.id, status: "PENDING_PAYMENT" } });
    if (pending >= MAX_PENDING_PER_CUSTOMER) throw new Error("LIMIT_REACHED");

    const unitPriceCrc = Number(variant.price);
    const layaway = await holdPiece({
      lineId: line.id, size, unitPriceCrc, depositCrc: depositFor(unitPriceCrc), status: "PENDING_PAYMENT",
      source: online ? "CUSTOMER_ONLINE" : "CUSTOMER_REQUEST", customerId: customer.id, customerEmail: customer.email,
      customerName: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
      holdExpiresAt: new Date(now().getTime() + PENDING_HOLD_HOURS * HOUR_MS),
      ...(online ? { paymentReference: randomUUID() } : {}),
    });
    let checkoutUrl = null;
    if (online) {
      try {
        checkoutUrl = await createCheckout({ layaway, variant, customer, locale: body.locale });
      } catch (error) {
        await releasePiece(layaway.id);
        throw error;
      }
    } else {
      await notify([{ audience: "ADMIN", kind: "LAYAWAY_REQUESTED", layawayId: layaway.id, params: notificationParams(layaway) }]);
    }
    await appendAudit("layaway.requested", { layawayId: layaway.id, mode: body.mode, depositCrc: Number(layaway.depositCrc) }, "customer");
    return jsonResponse({ layaway: serializeLayaway(layaway, now()), checkoutUrl }, 201);
  });

  const listCustomerLayaways = customerOnly(async (request, session) => {
    const layaways = await prisma.layaway.findMany({ where: { customerId: session.customerId }, include: { line: true }, orderBy: { createdAt: "desc" }, take: 100 });
    return jsonResponse({ layaways: layaways.map((layaway) => serializeLayaway(layaway, now())) });
  });

  // Payment provider webhook for deposits created by createCustomerLayaway (orderType LAYAWAY_DEPOSIT).
  const handlePaymentEvent = async (topic, reference) => {
    const layaway = await prisma.layaway.findUnique({ where: { paymentReference: reference }, include: { line: true } });
    if (!layaway) return;
    if (topic === "payment.failed") {
      await releasePiece(layaway.id);
      return;
    }
    if (topic !== "payment.paid") return;
    if (layaway.status === "RELEASED") {
      // The hold lapsed before the payment arrived: take the piece again if it is still free, otherwise ask for a manual refund.
      if (!(await reclaimPiece(layaway))) {
        await notify([{ audience: "ADMIN", kind: "LAYAWAY_PAYMENT_CONFLICT", layawayId: layaway.id, params: notificationParams(layaway) }]);
        return;
      }
    } else {
      await activate(layaway.id, now());
    }
    await notify([{ audience: "ADMIN", kind: "LAYAWAY_PAID", layawayId: layaway.id, params: notificationParams(layaway) }]);
  };

  const listNotifications = (audience) => async (request) => {
    let where;
    if (audience === "ADMIN") {
      if (!(await isAdmin(request))) return jsonResponse({ error: "Unauthorized" }, 401);
      where = { audience };
    } else {
      const session = getCustomerSession(request);
      if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
      where = { audience, customerId: session.customerId };
    }
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return jsonResponse({ notifications, unread });
  };

  const markNotificationsRead = (audience) => fail(async (request) => {
    let where;
    if (audience === "ADMIN") {
      if (!(await isAdmin(request))) return jsonResponse({ error: "Unauthorized" }, 401);
      where = { audience };
    } else {
      const session = getCustomerSession(request);
      if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
      where = { audience, customerId: session.customerId };
    }
    const body = await readJson(request);
    const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 100) : null;
    if (!ids && body.all !== true) throw new Error("INVALID_REQUEST");
    await prisma.notification.updateMany({ where: { ...where, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: now() } });
    return jsonResponse({ ok: true });
  });

  return {
    processDeadlines, releaseStaleHolds, completeLayaway, handlePaymentEvent, createAdminLayaway, listAdminLayaways, confirmDeposit, releaseLayaway,
    createCustomerLayaway, listCustomerLayaways,
    listAdminNotifications: listNotifications("ADMIN"), listCustomerNotifications: listNotifications("CUSTOMER"),
    markAdminNotificationsRead: markNotificationsRead("ADMIN"), markCustomerNotificationsRead: markNotificationsRead("CUSTOMER"),
  };
}
