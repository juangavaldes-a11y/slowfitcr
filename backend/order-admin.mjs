const ACTOR = "moderator";
const MAX_REASON_LENGTH = 280;
const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 100;
const MAX_TRANSACTION_ATTEMPTS = 3;

const ORDER_SELECT = {
  id: true,
  externalPaymentId: true,
  orderNumber: true,
  name: true,
  email: true,
  financialStatus: true,
  fulfillmentStatus: true,
  total: true,
  currency: true,
  items: true,
  preorderStatus: true,
  inventoryAdjustedAt: true,
  paymentCreatedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  cancelledBy: true,
  updatedAt: true,
  delivery: { select: { id: true, status: true, provider: true } },
};

export function parseCancellationInput(payload) {
  if (payload !== undefined && payload !== null && typeof payload !== "object") {
    throw new Error("INVALID_PAYLOAD");
  }
  const raw = payload?.reason;
  if (raw !== undefined && typeof raw !== "string") {
    throw new Error("INVALID_REASON");
  }
  const reason = (raw || "").trim();
  if (reason.length > MAX_REASON_LENGTH) {
    throw new Error("INVALID_REASON");
  }
  return { reason: reason || null };
}

// Mirrors the payment commit path in reverse. An ACTIVE or COMMITTED reservation holds the
// already-decremented stock, so releasing it restores inventory. Orders that never created a
// reservation (for example preorder final payments) had their stock taken directly from the
// order lines at payment time, so those non-preorder lines are the source of the restock.
export function buildRestockPlan(order, reservation) {
  if (reservation && (reservation.status === "ACTIVE" || reservation.status === "COMMITTED")) {
    const restock = (Array.isArray(reservation.lines) ? reservation.lines : [])
      .map((line) => ({ variantId: String(line?.variantId || "").trim(), quantity: Number(line?.quantity) }))
      .filter((line) => line.variantId && Number.isInteger(line.quantity) && line.quantity > 0);
    return { restock, releaseReservation: true, adjustMetric: Boolean(order?.inventoryAdjustedAt) };
  }

  const totals = new Map();
  for (const item of Array.isArray(order?.items) ? order.items : []) {
    const variantId = String(item?.variantId || "").trim();
    const quantity = Number(item?.quantity);
    if (!variantId || !Number.isInteger(quantity) || quantity < 1 || item?.preorder === true) continue;
    totals.set(variantId, (totals.get(variantId) || 0) + quantity);
  }
  const restock = [...totals].map(([variantId, quantity]) => ({ variantId, quantity }));
  return { restock, releaseReservation: false, adjustMetric: Boolean(order?.inventoryAdjustedAt) };
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, parsed));
}

export function createOrderAdminHandlers({ prisma, jsonResponse, readJson, isAuthorized, appendAudit, pushInventory }) {
  async function listOrders(request) {
    if (!(await isAuthorized(request))) return jsonResponse({ error: "Unauthorized" }, 401);

    const url = new URL(request.url, "http://localhost");
    const page = parsePositiveInt(url.searchParams.get("page"), 1, 1_000_000);
    const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const status = (url.searchParams.get("status") || "all").trim();
    const search = (url.searchParams.get("search") || "").trim().slice(0, 120);

    const where = {};
    if (status === "cancelled") where.cancelledAt = { not: null };
    else if (status === "active") where.cancelledAt = null;
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: ORDER_SELECT,
      }),
    ]);
    return jsonResponse({ total, orders });
  }

  async function cancelOrder(request, orderId) {
    if (!(await isAuthorized(request))) return jsonResponse({ error: "Unauthorized" }, 401);
    if (!orderId) return jsonResponse({ error: "Not found" }, 404);

    let input;
    try {
      input = parseCancellationInput(await readJson(request));
    } catch {
      return jsonResponse({ error: "Invalid cancellation request" }, 400);
    }

    let outcome;
    for (let attempt = 1; ; attempt += 1) {
      try {
        outcome = await prisma.$transaction(async (transaction) => {
          const order = await transaction.order.findUnique({ where: { id: orderId }, select: ORDER_SELECT });
          if (!order) return { status: 404 };
          if (order.cancelledAt) return { status: 409, order };

          const reservation = order.externalPaymentId
            ? await transaction.inventoryReservation.findUnique({ where: { reference: order.externalPaymentId } })
            : null;
          const { restock, releaseReservation, adjustMetric } = buildRestockPlan(order, reservation);

          const deltas = [];
          const metricByProduct = new Map();
          for (const line of restock) {
            const variant = await transaction.productVariant.findUnique({
              where: { id: line.variantId },
              select: { productId: true, sku: true, price: true },
            });
            if (!variant) continue;
            await transaction.productVariant.update({
              where: { id: line.variantId },
              data: { inventoryQuantity: { increment: line.quantity } },
            });
            await transaction.product.update({
              where: { id: variant.productId },
              data: { inventoryTotal: { increment: line.quantity } },
            });
            if (variant.sku) deltas.push({ sku: variant.sku, delta: line.quantity });
            if (adjustMetric) {
              const entry = metricByProduct.get(variant.productId) || { units: 0, revenue: 0 };
              entry.units += line.quantity;
              entry.revenue += Number(variant.price) * line.quantity;
              metricByProduct.set(variant.productId, entry);
            }
          }

          if (adjustMetric) {
            for (const [productId, entry] of metricByProduct) {
              await transaction.productMetric.updateMany({
                where: { productId, unitsSold: { gte: entry.units } },
                data: { unitsSold: { decrement: entry.units }, revenue: { decrement: entry.revenue } },
              });
            }
          }

          if (releaseReservation && reservation) {
            await transaction.inventoryReservation.update({
              where: { id: reservation.id },
              data: { status: "RELEASED", releasedAt: new Date() },
            });
          }

          const updated = await transaction.order.update({
            where: { id: order.id },
            data: {
              cancelledAt: new Date(),
              cancellationReason: input.reason,
              cancelledBy: ACTOR,
            },
            select: ORDER_SELECT,
          });
          return { status: 200, order: updated, deltas };
        }, { isolationLevel: "Serializable" });
        break;
      } catch (error) {
        if (error?.code !== "P2034" || attempt >= MAX_TRANSACTION_ATTEMPTS) throw error;
      }
    }

    if (outcome.status === 404) return jsonResponse({ error: "Not found" }, 404);
    if (outcome.status === 409) return jsonResponse({ error: "Order is already cancelled" }, 409);

    await appendAudit("order.cancelled", {
      orderId: outcome.order.id,
      orderNumber: outcome.order.orderNumber,
      reason: input.reason,
      deltas: outcome.deltas,
    }, ACTOR);
    if (typeof pushInventory === "function") {
      await pushInventory(outcome.deltas);
    }
    return jsonResponse({ ok: true, order: outcome.order });
  }

  return { listOrders, cancelOrder };
}
