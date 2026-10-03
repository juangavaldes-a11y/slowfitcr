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
