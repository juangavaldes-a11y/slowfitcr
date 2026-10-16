import assert from "node:assert/strict";
import test from "node:test";
import { buildInventoryView, createInventoryHandlers, parseLineInput, parseSaleInput, parseSettingsInput } from "../inventory-admin.mjs";

test("parseLineInput validates required fields, sizes and prices", () => {
  const line = parseLineInput({ code: "A1", productName: "Top", color: "Black", sizes: { S: 1, M: 2 }, unitPriceUsd: "9.5" });
  assert.deepEqual(line.sizes, { S: 1, M: 2, L: 0, XL: 0, OS: 0 });
  assert.throws(() => parseLineInput({ code: "A1" }), /MISSING_FIELD/);
  assert.throws(() => parseLineInput({ sizes: { S: -1 } }, { partial: true }), /INVALID_SIZES/);
  assert.throws(() => parseLineInput({ unitPriceUsd: -3 }, { partial: true }), /INVALID_NUMBER/);
  assert.equal(parseLineInput({ salePriceCrc: "" }, { partial: true }).salePriceCrc, null);
});

test("parseSettingsInput keeps nullable import assumptions", () => {
  assert.deepEqual(parseSettingsInput({ fxRate: null, hkShippingUsd: 5 }), { fxRate: null, hkShippingUsd: 5 });
  assert.throws(() => parseSettingsInput({ extraUnitCrc: "abc" }), /INVALID_NUMBER/);
});

test("parseSaleInput rejects bad quantity, size, discount and future dates", () => {
  const base = { lineId: "l", size: "M", quantity: 1, unitPriceCrc: 1000, paymentMethod: "Cash" };
  assert.equal(parseSaleInput(base).discountCrc, 0);
  assert.throws(() => parseSaleInput({ ...base, quantity: 0 }), /INVALID_QUANTITY/);
  assert.throws(() => parseSaleInput({ ...base, size: "XXL" }), /INVALID_SIZE/);
  assert.throws(() => parseSaleInput({ ...base, discountCrc: 5000 }), /INVALID_DISCOUNT/);
  assert.throws(() => parseSaleInput({ ...base, soldAt: "2999-01-01" }), /INVALID_DATE/);
  assert.throws(() => parseSaleInput({ ...base, paymentMethod: "" }), /INVALID_PAYMENT_METHOD/);
});

test("buildInventoryView subtracts non-voided sales from stock", () => {
  const view = buildInventoryView(
    { fxRate: 500, crShippingUsd: 0, nationalizationCrc: 0, otherImportCrc: 0 },
    [{ id: "l1", code: "A", productName: "Top", color: "Black", sizes: { S: 2, M: 1 }, piecesPerGarment: 1, unitPriceUsd: 10, salePriceCrc: 20000 }],
    [{ lineId: "l1", size: "S", quantity: 1 }, { lineId: "l1", size: "S", quantity: 1, voidedAt: new Date() }],
  );
  assert.equal(view.lines[0].remaining.S, 1);
  assert.equal(view.lines[0].soldQuantity, 1);
  assert.equal(view.totals.quantity, 3);
});

test("handlers reject unauthorized requests", async () => {
  const handlers = createInventoryHandlers({
    prisma: {},
    jsonResponse: (body, status = 200) => ({ body, status }),
    readJson: async () => ({}),
    isAuthorized: async () => false,
    appendAudit: async () => undefined,
  });
  assert.equal((await handlers.getInventory({})).status, 401);
  assert.equal((await handlers.syncCatalogToLoyverse({})).status, 401);
});

test("diffImport classifies created, updated, unchanged, missing and invalid rows", async () => {
  const { diffImport } = await import("../inventory-admin.mjs");
  const existing = [
    { id: "1", code: "A", color: "Black", productName: "Top", sizes: { S: 1, M: 1, L: 0, XL: 0, OS: 0 }, piecesPerGarment: 1, unitPriceUsd: "10", salePriceCrc: "15000", supplierEquivalence: null },
    { id: "2", code: "B", color: "Red", productName: "Pants", sizes: { S: 2 }, piecesPerGarment: 1, unitPriceUsd: "5", salePriceCrc: null, supplierEquivalence: null },
    { id: "3", code: "C", color: "Navy", productName: "Bra", sizes: { S: 1 }, piecesPerGarment: 1, unitPriceUsd: "5", salePriceCrc: null, supplierEquivalence: null },
  ];
  const row = (extra) => ({ code: "A", productName: "Top", color: "Black", sizes: { S: 1, M: 1 }, piecesPerGarment: 1, unitPriceUsd: 10, salePriceCrc: 15000, ...extra });
  const diff = diffImport(existing, [
    row({}),
    row({ code: "B", color: "Red", productName: "Pants", salePriceCrc: 9000, sizes: { S: 2 }, unitPriceUsd: 5 }),
    row({ code: "N", color: "New" }),
    row({ code: "B", color: "Red", sizes: { S: 1 } }),
    row({ code: "", color: "X" }),
  ]);
  assert.equal(diff.unchanged.length, 1);
  assert.equal(diff.updated.length, 1);
  assert.deepEqual(diff.updated[0].changes, { salePriceCrc: 9000 });
  assert.equal(diff.created.length, 1);
  assert.deepEqual(diff.missing, [{ code: "C", color: "Navy" }]);
  assert.deepEqual(diff.errors.map((entry) => entry.error).sort(), ["INVALID_DUPLICATE_ROW", "INVALID_TEXT"]);

  const replaced = diffImport(existing, [row({ sizes: { S: 0, M: 0 } })], "replace");
  assert.deepEqual(replaced.errors, []);
  assert.deepEqual(replaced.updated[0].changes.sizes, { S: 0, M: 0, L: 0, XL: 0, OS: 0 });
  const added = diffImport(existing, [row({ sizes: { S: 3, L: 2 } })], "add");
  assert.deepEqual(added.updated[0].changes.sizes, { S: 4, M: 1, L: 2, XL: 0, OS: 0 });
});

test("exchange rate falls back to the cached rate when the provider fails", async () => {
  const cached = { date: new Date("2020-01-01"), buyRate: "450", sellRate: "460", source: "BCCR" };
  const make = (fetchRate, rate) => createInventoryHandlers({
    prisma: { exchangeRate: { findFirst: async () => rate, upsert: async ({ create }) => ({ ...create, source: "BCCR" }) } },
    jsonResponse: (body, status = 200) => ({ body, status }),
    readJson: async () => ({}),
    isAuthorized: async () => true,
    appendAudit: async () => undefined,
    fetchRate,
  });
  const fallback = await make(async () => { throw new Error("down"); }, cached).getExchangeRate({});
  assert.equal(fallback.body.stale, true);
  assert.equal(fallback.body.sellRate, 460);
  assert.equal((await make(async () => { throw new Error("down"); }, null).getExchangeRate({})).status, 502);
  const fresh = await make(async () => ({ date: "2026-10-02", buyRate: 456.56, sellRate: 462.29 }), cached).getExchangeRate({});
  assert.equal(fresh.body.sellRate, 462.29);
  assert.equal(fresh.body.stale, false);
});

test("fetchBccrRate validates the provider payload", async () => {
  const { fetchBccrRate } = await import("../inventory-fx.mjs");
  const ok = await fetchBccrRate(async () => ({ ok: true, json: async () => ({ dolar: { venta: { fecha: "2026-10-02", valor: 462.29 }, compra: { valor: 456.56 } } }) }));
  assert.deepEqual(ok, { date: "2026-10-02", buyRate: 456.56, sellRate: 462.29 });
  await assert.rejects(fetchBccrRate(async () => ({ ok: true, json: async () => ({}) })), /FX_INVALID_PAYLOAD/);
  await assert.rejects(fetchBccrRate(async () => ({ ok: false, status: 500 })), /FX_HTTP_500/);
});

test("planWebsiteSales groups items per order, line and size and counts unmatched items", async () => {
  const { planWebsiteSales } = await import("../inventory-admin.mjs");
  const variants = new Map([
    ["v1", { size: "M", color: "Black", price: "20000", productHandle: "jacket" }],
    ["v2", { size: "One Size", color: "Black", price: "9000", productHandle: "jacket" }],
    ["v3", { size: "M", color: "Pink", price: "1", productHandle: "other" }],
  ]);
  const lines = [{ id: "L1", productHandle: "jacket", color: "Black" }, { id: "L2", productHandle: null, color: "Pink" }];
  const when = new Date("2026-10-01T00:00:00Z");
  const orders = [{ id: "o1", name: "#1", paymentCreatedAt: when, updatedAt: when, items: [
    { variantId: "v1", quantity: 1, unitPrice: 19000 }, { variantId: "v1", quantity: 2, unitPrice: 19000 },
    { variantId: "v2", quantity: 1 }, { variantId: "v3", quantity: 1 }, { variantId: "gone", quantity: 1 },
  ] }];
  const { sales, unmatched } = planWebsiteSales(orders, variants, lines);
  assert.equal(unmatched, 2);
  assert.equal(sales.length, 2);
  assert.deepEqual(sales.map((sale) => [sale.size, sale.quantity, sale.unitPriceCrc]).sort(), [["M", 3, 19000], ["OS", 1, 9000]]);
  assert.equal(sales[0].source, "WEBSITE");
});

function makeLedger() {
  const state = {
    line: { id: "L1", productHandle: "jacket", color: "Black", sizes: { S: 0, M: 3, L: 0, XL: 0, OS: 0 } },
    sales: [], variant: { id: "v1", productId: "p1", sku: "SKU-M", inventoryQuantity: 5 }, audits: [], pushed: [],
  };
  const model = {
    inventoryLine: { findUnique: async () => state.line, findMany: async () => [state.line] },
    inventorySale: {
      findMany: async () => state.sales.filter((row) => !row.voidedAt),
      findUnique: async ({ where }) => { const row = state.sales.find((entry) => entry.id === where.id); return row && { ...row, line: state.line }; },
      create: async ({ data }) => { const row = { id: `s${state.sales.length + 1}`, voidedAt: null, refundedQuantity: 0, restockedQuantity: 0, source: "MANUAL", ...data }; state.sales.push(row); return row; },
      update: async ({ where, data }) => {
        const row = state.sales.find((entry) => entry.id === where.id);
        for (const [key, value] of Object.entries(data)) row[key] = value?.increment !== undefined ? row[key] + value.increment : value;
        return row;
      },
    },
    productVariant: {
      findFirst: async () => state.variant,
      update: async ({ data }) => { state.variant.inventoryQuantity = data.inventoryQuantity; },
      aggregate: async () => ({ _sum: { inventoryQuantity: state.variant.inventoryQuantity } }),
    },
    product: { update: async () => undefined },
    inventorySettings: { findUnique: async () => null },
    paymentMethod: { findMany: async () => [] },
    order: { findMany: async () => [] },
  };
  const prisma = { ...model, $transaction: async (fn) => fn(model) };
  const handlers = createInventoryHandlers({
    prisma,
    jsonResponse: (body, status = 200) => ({ body, status }),
    readJson: async (request) => request.body,
    isAuthorized: async () => true,
    appendAudit: async (action) => { state.audits.push(action); },
    pushInventory: async (changes) => { state.pushed.push(...changes); },
  });
  return { state, handlers };
}

test("sale, refund (with and without restock) and void keep stock and storefront in sync", async () => {
  const { state, handlers } = makeLedger();
  const sale = { lineId: "L1", size: "M", quantity: 2, unitPriceCrc: 10000, paymentMethod: "Cash" };
  assert.equal((await handlers.createSale({ body: sale })).status, 201);
  assert.equal(state.variant.inventoryQuantity, 3);
  assert.equal((await handlers.createSale({ body: { ...sale, quantity: 5 } })).status, 400);

  assert.equal((await handlers.refundSale({ body: { quantity: 1, restock: true } }, "s1")).status, 200);
  assert.equal(state.variant.inventoryQuantity, 4);
  assert.equal(state.sales[0].refundedQuantity, 1);
  assert.equal((await handlers.refundSale({ body: { quantity: 1, restock: false, note: "damaged" } }, "s1")).status, 200);
  assert.equal(state.variant.inventoryQuantity, 4);
  assert.equal((await handlers.refundSale({ body: { quantity: 1 } }, "s1")).status, 400);
  assert.equal((await handlers.refundSale({ body: { quantity: 1 } }, "missing")).status, 404);

  assert.equal((await handlers.voidSale({}, "s1")).status, 200);
  assert.equal(state.variant.inventoryQuantity, 5);
  assert.equal((await handlers.voidSale({}, "s1")).status, 400);
  assert.deepEqual(state.audits.filter((action) => action.includes("refunded")).length, 2);
  assert.deepEqual(state.pushed, [
    { sku: "SKU-M", delta: -2 },
    { sku: "SKU-M", delta: 1 },
    { sku: "SKU-M", delta: 1 },
  ]);
});

test("voiding a website sale leaves storefront stock untouched", async () => {
  const { state, handlers } = makeLedger();
  state.sales.push({ id: "w1", lineId: "L1", size: "M", quantity: 1, source: "WEBSITE", refundedQuantity: 0, restockedQuantity: 0, voidedAt: null });
  await handlers.voidSale({}, "w1");
  assert.equal(state.variant.inventoryQuantity, 5);
  await handlers.refundSale({ body: { quantity: 1, restock: true } }, "missing").catch(() => undefined);
});

function makeImportLedger() {
  const state = {
    lines: [{ id: "L1", code: "A", color: "Black", productName: "Top", productHandle: "jacket", sizes: { S: 2, M: 1, L: 0, XL: 0, OS: 0 }, piecesPerGarment: 1, unitPriceUsd: "10", salePriceCrc: null, supplierEquivalence: null }],
    sales: [{ id: "s1", lineId: "L1", size: "S", quantity: 2, voidedAt: null, refundedQuantity: 0, restockedQuantity: 0, soldAt: new Date("2026-09-01"), unitPriceCrc: 10000, discountCrc: 0, paymentMethod: "Cash" }],
    variant: { id: "v1", productId: "p1", sku: "SKU-S", inventoryQuantity: 4 },
    audits: [],
    pushed: [],
  };
  const model = {
    inventoryLine: {
      findMany: async () => state.lines,
      create: async ({ data }) => { const line = { id: `L${state.lines.length + 1}`, ...data }; state.lines.push(line); return line; },
      update: async ({ where, data }) => {
        const line = state.lines.find((entry) => entry.id === where.id);
        if (!line) throw Object.assign(new Error("missing"), { code: "P2025" });
        Object.assign(line, data);
        return line;
      },
    },
    inventorySale: { findMany: async ({ where } = {}) => state.sales.filter((sale) => !where?.lineId || sale.lineId === where.lineId) },
    productVariant: {
      findFirst: async () => state.variant,
      update: async ({ data }) => { state.variant.inventoryQuantity = data.inventoryQuantity; },
      aggregate: async () => ({ _sum: { inventoryQuantity: state.variant.inventoryQuantity } }),
    },
    product: { update: async () => undefined },
    inventorySettings: { findUnique: async () => null, upsert: async () => undefined },
    paymentMethod: { findMany: async () => [] },
    order: { findMany: async () => [] },
  };
  const handlers = createInventoryHandlers({
    prisma: { ...model, $transaction: async (fn) => fn(model) },
    jsonResponse: (body, status = 200) => ({ body, status }),
    readJson: async (request) => request.body,
    isAuthorized: async () => true,
    appendAudit: async (action, details) => { state.audits.push({ action, details }); },
    pushInventory: async (changes) => { state.pushed.push(...changes); },
  });
  return { state, handlers };
}

const importRow = (extra) => ({ code: "A", productName: "Top", color: "Black", sizes: { S: 5, M: 0 }, piecesPerGarment: 1, unitPriceUsd: 10, ...extra });

test("import preview does not write; add mode sums stock and replace mode overwrites it", async () => {
  const { state, handlers } = makeImportLedger();
  const preview = await handlers.importLines({ body: { lines: [importRow({})], mode: "add" } });
  assert.equal(preview.body.applied, false);
  assert.equal(preview.body.summary.updated, 1);
  assert.equal(state.lines[0].sizes.S, 2);

  const added = await handlers.importLines({ body: { lines: [importRow({})], mode: "add", apply: true } });
  assert.equal(added.body.applied, true);
  assert.deepEqual(state.lines[0].sizes, { S: 7, M: 1, L: 0, XL: 0, OS: 0 });
  assert.equal(added.body.lines[0].soldQuantity, 2);
  assert.equal(added.body.lines[0].remaining.S, 5);

  await handlers.importLines({ body: { lines: [importRow({ sizes: { S: 1 } })], apply: true } });
  assert.deepEqual(state.lines[0].sizes, { S: 1, M: 0, L: 0, XL: 0, OS: 0 });
  assert.equal((await handlers.getInventory({})).body.lines[0].remaining.S, -1);
  assert.equal(state.audits.at(-1).details.mode, "replace");
  assert.deepEqual(state.pushed, [
    { sku: "SKU-S", delta: 5 },
    { sku: "SKU-S", delta: -6 },
    { sku: "SKU-S", delta: -1 },
  ]);
});

test("import creates new lines and rejects invalid payloads or rows", async () => {
  const { state, handlers } = makeImportLedger();
  const created = await handlers.importLines({ body: { lines: [importRow({ code: "N", color: "Red" })], apply: true } });
  assert.equal(created.body.summary.created, 1);
  assert.equal(state.lines.length, 2);
  assert.deepEqual(state.pushed, []);
  assert.equal((await handlers.importLines({ body: { lines: [] } })).status, 400);
  assert.equal((await handlers.importLines({ body: {} })).status, 400);
  const bad = await handlers.importLines({ body: { lines: [importRow({ code: "" })], apply: true } });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error, "IMPORT_HAS_ERRORS");
});

test("line and settings handlers create, update and report missing lines", async () => {
  const { state, handlers } = makeImportLedger();
  assert.equal((await handlers.createLine({ body: importRow({ code: "Z", color: "Blue" }) })).status, 201);
  assert.equal((await handlers.updateLine({ body: { salePriceCrc: 9000 } }, "L1")).status, 200);
  assert.equal(state.lines[0].salePriceCrc, 9000);
  assert.equal((await handlers.updateLine({ body: { sizes: { S: 1 } } }, "L1")).status, 400);
  assert.equal((await handlers.updateLine({ body: { salePriceCrc: 1 } }, "nope")).status, 404);
  assert.equal((await handlers.updateSettings({ body: { fxRate: 500 } })).status, 200);
  assert.equal((await handlers.updateSettings({ body: { fxRate: "x" } })).status, 400);
});

test("analytics returns restock recommendations using query params and listSales filters by line", async () => {
  const { state, handlers } = makeImportLedger();
  const analytics = await handlers.getAnalytics({ url: "http://x/api/admin/inventory/analytics?leadTimeDays=10&coverageDays=20" });
  assert.equal(analytics.body.restock.params.leadTimeDays, 10);
  assert.equal(analytics.body.restock.params.coverageDays, 20);
  assert.ok(Array.isArray(analytics.body.restock.nextOrder.lines));
  state.sales[0].line = { code: "A" };
  assert.equal((await handlers.listSales({ url: "http://x/api/admin/inventory/sales?lineId=L1" })).body.sales.length, 1);
});

test("syncCatalogToLoyverse sends active products with prices, colors, sizes and stock", async () => {
  const catalog = [];
  const audits = [];
  const products = [
    { handle: "tee", title: "Tee", variants: [
      { sku: "T-1", color: "Red", size: "S", price: "19.5", inventoryQuantity: 4 },
      { sku: "T-2", color: "Red", size: "M", price: "19.5", inventoryQuantity: 0 },
      { sku: null, color: "Red", size: "L", price: "19.5", inventoryQuantity: 2 },
    ] },
    { handle: "nosku", title: "No SKU", variants: [{ sku: null, color: "Blue", size: "S", price: "5", inventoryQuantity: 1 }] },
  ];
  const handlers = createInventoryHandlers({
    prisma: { product: { findMany: async (args) => { assert.equal(args.where.status, "ACTIVE"); return products; } } },
    jsonResponse: (body, status = 200) => ({ body, status }),
    readJson: async () => ({}),
    isAuthorized: async () => true,
    appendAudit: async (action, details) => { audits.push({ action, details }); },
    pushCatalog: async (payload) => {
      catalog.push(payload);
      return { queued: true, products: payload.length, variants: payload.reduce((total, product) => total + product.variants.length, 0) };
    },
  });
  const result = await handlers.syncCatalogToLoyverse({});
  assert.equal(result.body.queued, true);
  assert.equal(result.body.products, 1);
  assert.equal(result.body.variants, 2);
  assert.deepEqual(catalog[0], [{ handle: "tee", name: "Tee", variants: [
    { sku: "T-1", color: "Red", size: "S", price: 19.5, quantity: 4 },
    { sku: "T-2", color: "Red", size: "M", price: 19.5, quantity: 0 },
  ] }]);
  assert.deepEqual(audits[0], { action: "inventory.catalog.synced", details: { products: 1, variants: 2, queued: true } });

  const empty = createInventoryHandlers({
    prisma: { product: { findMany: async () => [] } },
    jsonResponse: (body, status = 200) => ({ body, status }),
    readJson: async () => ({}),
    isAuthorized: async () => true,
    appendAudit: async () => undefined,
  });
  assert.equal((await empty.syncCatalogToLoyverse({})).body.queued, false);
});
