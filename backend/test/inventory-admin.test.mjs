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
  ], new Map([["2", { S: 2 }]]));
  assert.equal(diff.unchanged.length, 1);
  assert.equal(diff.updated.length, 1);
  assert.deepEqual(diff.updated[0].changes, { salePriceCrc: 9000 });
  assert.equal(diff.created.length, 1);
  assert.deepEqual(diff.missing, [{ code: "C", color: "Navy" }]);
  assert.deepEqual(diff.errors.map((entry) => entry.error).sort(), ["INVALID_DUPLICATE_ROW", "INVALID_TEXT"]);
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
