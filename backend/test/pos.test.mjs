import assert from "node:assert/strict";
import test from "node:test";
import { createPosHandlers, normalizeScan, parseCheckoutInput, receiptNumber, sizeKeyFor } from "../pos.mjs";

const json = (body, status = 200) => ({ body, status });

test("sizeKeyFor maps storefront sizes to inventory keys", () => {
  assert.equal(sizeKeyFor("One Size"), "OS");
  assert.equal(sizeKeyFor("M"), "M");
  assert.equal(sizeKeyFor("XXL"), null);
  assert.equal(sizeKeyFor(undefined), null);
});

test("normalizeScan strips scanner whitespace and Enter characters", () => {
  assert.equal(normalizeScan("  SLWA17-ROSA-M\r\n"), "SLWA17-ROSA-M");
  assert.equal(normalizeScan(null), "");
  assert.equal(normalizeScan("x".repeat(200)).length, 80);
});

test("parseCheckoutInput validates items, payment method, prices and dates", () => {
  const base = { paymentMethod: "Efectivo", items: [{ variantId: "v1", quantity: 2 }] };
  const parsed = parseCheckoutInput(base);
  assert.equal(parsed.items[0].unitPriceCrc, null);
  assert.equal(parsed.items[0].discountCrc, 0);
  assert.throws(() => parseCheckoutInput({ ...base, items: [] }), /MISSING_ITEMS/);
  assert.throws(() => parseCheckoutInput({ ...base, paymentMethod: " " }), /INVALID_PAYMENT_METHOD/);
  assert.throws(() => parseCheckoutInput({ ...base, items: [{ variantId: "", quantity: 1 }] }), /MISSING_VARIANT/);
  assert.throws(() => parseCheckoutInput({ ...base, items: [{ variantId: "v", quantity: 0 }] }), /INVALID_QUANTITY/);
  assert.throws(() => parseCheckoutInput({ ...base, items: [{ variantId: "v", quantity: 1, unitPriceCrc: -1 }] }), /INVALID_NUMBER/);
  assert.throws(() => parseCheckoutInput({ ...base, soldAt: "2999-01-01" }), /INVALID_DATE/);
  assert.throws(() => parseCheckoutInput({ ...base, items: Array.from({ length: 51 }, () => ({ variantId: "v", quantity: 1 })) }), /INVALID_ITEMS/);
});

test("receiptNumber is date-based and stable", () => {
  assert.equal(receiptNumber("abcdef12-3456", new Date("2026-11-20T10:00:00Z")), "POS-20261120-ABCDEF");
});

// A tiny in-memory prisma double: one line, one variant, sales tracked in an array.
function fakePrisma({ stock = 5, variantOverrides = {}, line = {} } = {}) {
  const sales = [];
  const variant = { id: "var1", sku: "SLWA17-ROSA-M", color: "Rosa", size: "M", price: "19950", inventoryQuantity: stock, productId: "p1", title: "Rosa / M", product: { title: "Aura", handle: "aura-handle", images: [{ url: "https://img/1.webp" }] }, ...variantOverrides };
  const inventoryLine = { id: "line1", productHandle: "aura-handle", color: "Rosa", sizes: { M: stock }, ...line };
  const tx = {
    productVariant: {
      findUnique: async ({ where }) => (where.id === variant.id ? variant : null),
      findFirst: async ({ where }) => (where.sku && where.sku.equals.toLowerCase() === variant.sku.toLowerCase() ? variant : variant.color === where.color ? variant : null),
      update: async ({ data }) => { variant.inventoryQuantity = data.inventoryQuantity; },
      aggregate: async () => ({ _sum: { inventoryQuantity: variant.inventoryQuantity } }),
    },
    product: { update: async () => undefined },
    inventoryLine: { findFirst: async () => inventoryLine },
    inventorySale: {
      findMany: async () => sales.filter((sale) => !sale.voidedAt),
      create: async ({ data }) => { const sale = { id: `sale-${sales.length + 1}-xxxx`, restockedQuantity: 0, ...data }; sales.push(sale); return sale; },
    },
    layaway: { count: async () => 0 },
  };
  return { sales, variant, prisma: { ...tx, $transaction: async (callback) => callback(tx) } };
}

function handlersFor(fake, { authorized = true } = {}) {
  const audits = [];
  const pushed = [];
  const handlers = createPosHandlers({
    prisma: fake.prisma,
    jsonResponse: json,
    readJson: async (request) => request.body,
    isAuthorized: async () => authorized,
    appendAudit: async (...args) => { audits.push(args); },
    pushInventory: async (changes) => { pushed.push(changes); },
  });
  return { handlers, audits, pushed };
}

test("POS endpoints require admin authorization", async () => {
  const { handlers } = handlersFor(fakePrisma(), { authorized: false });
  assert.equal((await handlers.lookup({ url: "http://x/api/admin/pos/lookup?code=A" })).status, 401);
  assert.equal((await handlers.checkout({ body: {} })).status, 401);
});

test("lookup finds a variant by scanned SKU, ignoring case and scanner whitespace", async () => {
  const { handlers } = handlersFor(fakePrisma());
  const response = await handlers.lookup({ url: "http://x/api/admin/pos/lookup?code=%20slwa17-rosa-m%0D%0A" });
  assert.equal(response.status, 200);
  assert.equal(response.body.sku, "SLWA17-ROSA-M");
  assert.equal(response.body.price, 19950);
  assert.equal(response.body.image, "https://img/1.webp");
});

test("lookup reports missing and unknown codes", async () => {
  const { handlers } = handlersFor(fakePrisma());
  assert.equal((await handlers.lookup({ url: "http://x/api/admin/pos/lookup" })).status, 400);
  assert.equal((await handlers.lookup({ url: "http://x/api/admin/pos/lookup?code=NOPE" })).status, 404);
});

test("checkout records POS sales, decrements storefront stock and returns a receipt", async () => {
  const fake = fakePrisma({ stock: 5 });
  const { handlers, audits, pushed } = handlersFor(fake);
  const response = await handlers.checkout({ body: { paymentMethod: "Efectivo", items: [{ variantId: "var1", quantity: 2, discountCrc: 1000 }] } });
  assert.equal(response.status, 201);
  assert.equal(response.body.totalCrc, 2 * 19950 - 1000);
  assert.match(response.body.receipt, /^POS-\d{8}-[A-Z0-9]{6}$/);
  assert.equal(fake.sales.length, 1);
  assert.equal(fake.sales[0].source, "POS");
  assert.equal(fake.variant.inventoryQuantity, 3);
  assert.equal(pushed[0][0].delta, -2);
  assert.equal(audits[0][0], "pos.checkout");
});

test("checkout refuses to oversell, including repeated lines in the same cart", async () => {
  const fake = fakePrisma({ stock: 2 });
  const { handlers } = handlersFor(fake);
  const tooMany = await handlers.checkout({ body: { paymentMethod: "Efectivo", items: [{ variantId: "var1", quantity: 3 }] } });
  assert.equal(tooMany.status, 400);
  assert.equal(tooMany.body.error, "INVALID_QUANTITY_EXCEEDS_STOCK");
  const split = await handlers.checkout({ body: { paymentMethod: "Efectivo", items: [{ variantId: "var1", quantity: 2 }, { variantId: "var1", quantity: 1 }] } });
  assert.equal(split.status, 400);
});

test("checkout rejects unknown variants, untracked variants and bad discounts", async () => {
  const { handlers } = handlersFor(fakePrisma());
  assert.equal((await handlers.checkout({ body: { paymentMethod: "Efectivo", items: [{ variantId: "nope", quantity: 1 }] } })).status, 404);
  const discount = await handlers.checkout({ body: { paymentMethod: "Efectivo", items: [{ variantId: "var1", quantity: 1, discountCrc: 999999 }] } });
  assert.equal(discount.body.error, "INVALID_DISCOUNT");
  const odd = handlersFor(fakePrisma({ variantOverrides: { size: "XXL" } }));
  assert.equal((await odd.handlers.checkout({ body: { paymentMethod: "Efectivo", items: [{ variantId: "var1", quantity: 1 }] } })).body.error, "INVALID_SIZE");
});
