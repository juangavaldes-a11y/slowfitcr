import { SIZE_KEYS } from "./inventory-costing.mjs";
import { syncStorefrontStock } from "./inventory-admin.mjs";
import { HOLDING_STATUSES } from "./layaways.mjs";

const MAX_CART_ITEMS = 50;
const MAX_ITEM_QUANTITY = 1000;
const VARIANT_SIZE_TO_KEY = { "One Size": "OS" };

// Storefront variants call the single size "One Size"; inventory lines call it "OS".
export function sizeKeyFor(variantSize) {
  const size = String(variantSize ?? "").trim();
  if (VARIANT_SIZE_TO_KEY[size]) return VARIANT_SIZE_TO_KEY[size];
  return SIZE_KEYS.includes(size) ? size : null;
}

// Hardware scanners type the code and press Enter; some add prefixes/suffixes or whitespace.
export function normalizeScan(raw) {
  return String(raw ?? "").replace(/[\r\n\t]/g, "").trim().slice(0, 80);
}

const nonNegative = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("INVALID_NUMBER");
  return number;
};

export function parseCheckoutInput(body, now = new Date()) {
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) throw new Error("MISSING_ITEMS");
  if (items.length > MAX_CART_ITEMS) throw new Error("INVALID_ITEMS");
  const paymentMethod = String(body.paymentMethod || "").trim();
  if (!paymentMethod || paymentMethod.length > 60) throw new Error("INVALID_PAYMENT_METHOD");
  const soldAt = body.soldAt ? new Date(body.soldAt) : now;
  if (Number.isNaN(soldAt.getTime()) || soldAt.getTime() > now.getTime() + 86_400_000) throw new Error("INVALID_DATE");
  const parsed = items.map((item) => {
    const variantId = String(item?.variantId || "").trim();
    if (!variantId) throw new Error("MISSING_VARIANT");
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) throw new Error("INVALID_QUANTITY");
    return {
      variantId,
      quantity,
      unitPriceCrc: nonNegative(item.unitPriceCrc, null),
      discountCrc: nonNegative(item.discountCrc, 0),
    };
  });
  return { items: parsed, paymentMethod, soldAt, note: String(body.note || "").slice(0, 500) };
}

export function receiptNumber(firstSaleId, soldAt) {
  const day = soldAt.toISOString().slice(0, 10).replaceAll("-", "");
  return `POS-${day}-${String(firstSaleId).replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

const lookupResult = (variant) => ({
  variantId: variant.id,
  sku: variant.sku,
  productTitle: variant.product?.title ?? "",
  title: variant.title,
  size: variant.size,
  color: variant.color,
  price: Number(variant.price),
  inventoryQuantity: variant.inventoryQuantity,
  image: variant.product?.images?.[0]?.url ?? null,
});

export function createPosHandlers({ prisma, jsonResponse, readJson = (request) => request.json(), isAuthorized, appendAudit, pushInventory = async () => undefined }) {
  const guard = (handler) => async (request, ...args) => {
    if (!(await isAuthorized(request))) return jsonResponse({ error: "Unauthorized" }, 401);
    try {
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof SyntaxError) return jsonResponse({ error: "Invalid JSON" }, 400);
      if (/^(INVALID|MISSING|NOT_FOUND)/.test(error?.message ?? "")) {
        return jsonResponse({ error: error.message }, error.message.startsWith("NOT_FOUND") ? 404 : 400);
      }
      throw error;
    }
  };

  // Resolve a scanned/typed barcode (the SKU printed on the labels) to a sellable variant.
  const lookup = guard(async (request) => {
    const code = normalizeScan(new URL(request.url).searchParams.get("code"));
    if (!code) throw new Error("MISSING_CODE");
    const variant = await prisma.productVariant.findFirst({
      where: { sku: { equals: code, mode: "insensitive" } },
      include: { product: { select: { title: true, handle: true, images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } } } },
    });
    if (!variant) throw new Error("NOT_FOUND");
    return jsonResponse(lookupResult(variant));
  });

  const checkout = guard(async (request) => {
    const input = parseCheckoutInput(await readJson(request));
    const changes = [];
    const receiptItems = [];
    const created = await prisma.$transaction(async (transaction) => {
      const sales = [];
      for (const item of input.items) {
        const variant = await transaction.productVariant.findUnique({ where: { id: item.variantId }, include: { product: { select: { title: true, handle: true } } } });
        if (!variant) throw new Error("NOT_FOUND_VARIANT");
        const size = sizeKeyFor(variant.size);
        if (!size) throw new Error("INVALID_SIZE");
        const line = await transaction.inventoryLine.findFirst({ where: { productHandle: variant.product.handle, color: variant.color } });
        if (!line) throw new Error("INVALID_UNTRACKED_VARIANT");
        const active = await transaction.inventorySale.findMany({ where: { lineId: line.id, size, voidedAt: null } });
        const held = await transaction.layaway.count({ where: { lineId: line.id, size, status: { in: HOLDING_STATUSES } } });
        const available = (line.sizes[size] ?? 0) - active.reduce((total, row) => total + row.quantity - row.restockedQuantity, 0) - held;
        if (item.quantity > available) throw new Error("INVALID_QUANTITY_EXCEEDS_STOCK");
        const unitPriceCrc = item.unitPriceCrc ?? Number(variant.price);
        if (item.discountCrc > unitPriceCrc * item.quantity) throw new Error("INVALID_DISCOUNT");
        const sale = await transaction.inventorySale.create({
          data: {
            lineId: line.id,
            size,
            quantity: item.quantity,
            unitPriceCrc,
            discountCrc: item.discountCrc,
            soldAt: input.soldAt,
            paymentMethod: input.paymentMethod,
            source: "POS",
            note: input.note,
          },
        });
        changes.push(await syncStorefrontStock(transaction, line, size, -item.quantity));
        sales.push(sale);
        receiptItems.push({
          saleId: sale.id,
          sku: variant.sku,
          name: variant.product.title,
          color: variant.color,
          size: variant.size,
          quantity: item.quantity,
          unitPriceCrc,
          discountCrc: item.discountCrc,
          lineTotalCrc: unitPriceCrc * item.quantity - item.discountCrc,
        });
      }
      return sales;
    });
    await pushInventory(changes.filter(Boolean));
    const number = receiptNumber(created[0].id, input.soldAt);
    const totalCrc = receiptItems.reduce((total, item) => total + item.lineTotalCrc, 0);
    await appendAudit("pos.checkout", { receipt: number, items: receiptItems.length, totalCrc, paymentMethod: input.paymentMethod }, "admin");
    return jsonResponse({ receipt: number, soldAt: input.soldAt.toISOString(), paymentMethod: input.paymentMethod, items: receiptItems, totalCrc }, 201);
  });

  return { lookup, checkout };
}
