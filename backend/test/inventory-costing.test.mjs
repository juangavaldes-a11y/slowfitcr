import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { computeInventoryCosts, sumSizes } from "../inventory-costing.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures-costeo.json", import.meta.url), "utf8"));
const settings = {
  hkShippingUsd: 80,
  invoiceAdjustmentUsd: 36.2,
  fxRate: 466,
  crShippingUsd: 1093,
  nationalizationCrc: 48631.75,
  otherImportCrc: 37549.65,
  extraUnitCrc: 100,
  cardCommissionRate: 0.0195,
  customizationPerPieceUsd: 2,
};
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-6 * Math.max(1, Math.abs(expected)), `${label}: ${actual} vs ${expected}`);

// Workbook row 12 (index 4) has no U12 formula, so the sheet omits its Costa Rica shipping share.
const WORKBOOK_GAP_INDEX = 4;

test("matches every line of the Costeo workbook", () => {
  const result = computeInventoryCosts(fixture.rows, settings);
  assert.equal(result.lines.length, 80);
  result.lines.forEach((line, index) => {
    const expected = fixture.rows[index].expected;
    close(line.paidInvestmentUsd, expected.S, `S row ${index}`);
    if (index === WORKBOOK_GAP_INDEX) {
      assert.ok(line.totalInventoryCostCrc > expected.X);
      return;
    }
    close(line.totalInventoryCostCrc, expected.X, `X row ${index}`);
    close(line.costPerUnitCrc, expected.Y, `Y row ${index}`);
    close(line.contributionPerUnitCrc, expected.AC, `AC row ${index}`);
  });
});

test("matches the workbook totals row", () => {
  const { totals } = computeInventoryCosts(fixture.rows, settings);
  assert.equal(totals.quantity, fixture.totals.K);
  close(totals.paidInvestmentUsd, fixture.totals.S, "S total");
  const gap = 11408.872703707872;
  close(totals.totalInventoryCostCrc, fixture.totals.X + gap, "X total");
  close(totals.expectedSalesCrc, fixture.totals.AF, "AF total");
  close(totals.totalContributionCrc, fixture.totals.AG - gap, "AG total");
});

test("leaves CRC costs empty until import assumptions are complete", () => {
  const result = computeInventoryCosts(fixture.rows, { ...settings, nationalizationCrc: null });
  assert.equal(result.crReady, false);
  assert.equal(result.lines[0].totalInventoryCostCrc, null);
  assert.equal(result.totals.totalInventoryCostCrc, null);
  assert.ok(result.lines[0].paidInvestmentUsd > 0);
});

test("handles empty input and missing sale prices", () => {
  const empty = computeInventoryCosts([], settings);
  assert.equal(empty.totals.quantity, 0);
  const unpriced = computeInventoryCosts([{ sizes: { S: 2 }, unitPriceUsd: 10, piecesPerGarment: 1, salePriceCrc: null }], settings);
  assert.equal(unpriced.lines[0].contributionPerUnitCrc, null);
  assert.equal(unpriced.totals.expectedSalesCrc, null);
  assert.equal(sumSizes({ S: "x", M: 2 }), 2);
});

test("each purchase spreads its own costs over its own lines only", () => {
  const lines = [
    { batchId: "old", sizes: { S: 1, M: 1 }, piecesPerGarment: 1, unitPriceUsd: 10, salePriceCrc: 20000 },
    { batchId: "new", sizes: { S: 1, M: 1 }, piecesPerGarment: 1, unitPriceUsd: 10, salePriceCrc: 20000 },
    { batchId: "new", sizes: { M: 2 }, piecesPerGarment: 1, unitPriceUsd: 20, salePriceCrc: 20000 },
  ];
  const global = { fxRate: 500, extraUnitCrc: 0, cardCommissionRate: 0 };
  const old = { id: "old", name: "Old", hkShippingUsd: 10, crShippingUsd: 0, nationalizationCrc: 0, otherImportCrc: 0 };
  const fresh = { id: "new", name: "New", hkShippingUsd: 30, logoPrintingUsd: 20, sizePrintingUsd: 10, packagingUsd: 5, discountUsd: 5, crShippingUsd: 0, nationalizationCrc: 0, otherImportCrc: 0 };

  const apart = computeInventoryCosts(lines, global, [old, fresh]);
  // The old purchase carries only its own 10 USD of shipping; the 60 USD of new costs never reach it.
  assert.equal(apart.lines[0].paidInvestmentUsd, 20 + 10);
  assert.equal(apart.lines[0].batchExpensesUsd, 0);
  // New costs: shipping 30 + (20 + 10 + 5 - 5) = 60, split by value (20 USD and 40 USD of goods).
  assert.equal(Math.round(apart.lines[1].paidInvestmentUsd * 100) / 100, 20 + 20);
  assert.equal(Math.round(apart.lines[2].paidInvestmentUsd * 100) / 100, 40 + 40);
  assert.equal(apart.batches.find((batch) => batch.id === "new").paidInvestmentUsd, 120);
  assert.equal(apart.crReady, true);
  assert.equal(apart.totals.batchExpensesUsd, 30);

  // Costs of the new purchase leave the old lines exactly as they were before it existed.
  const before = computeInventoryCosts(lines.slice(0, 1), global, [old]);
  assert.equal(before.lines[0].totalInventoryCostCrc, apart.lines[0].totalInventoryCostCrc);
});

test("a purchase still missing its Costa Rica costs stays pending without hiding the others", () => {
  const lines = [
    { batchId: "old", sizes: { M: 2 }, piecesPerGarment: 1, unitPriceUsd: 10 },
    { batchId: "new", sizes: { M: 2 }, piecesPerGarment: 1, unitPriceUsd: 10 },
  ];
  const result = computeInventoryCosts(lines, { fxRate: 500 }, [
    { id: "old", crShippingUsd: 0, nationalizationCrc: 0, otherImportCrc: 0 },
    { id: "new", hkShippingUsd: 90 },
  ]);
  assert.equal(result.crReady, false);
  assert.notEqual(result.lines[0].totalInventoryCostCrc, null);
  assert.equal(result.lines[1].totalInventoryCostCrc, null);
  assert.equal(result.totals.totalInventoryCostCrc, 10000);
  assert.equal(result.totals.costPerUnitCrc, 5000);
  assert.equal(result.batches[1].crReady, false);
  assert.equal(result.totals.paidInvestmentUsd, 20 + 20 + 90);
});

test("lines without a purchase belong to the oldest one, and an unknown purchase falls back to it", () => {
  const lines = [{ sizes: { M: 1 }, unitPriceUsd: 10 }, { batchId: "gone", sizes: { M: 1 }, unitPriceUsd: 10 }];
  const result = computeInventoryCosts(lines, { fxRate: 500 }, [{ id: "a", hkShippingUsd: 20, crShippingUsd: 0, nationalizationCrc: 0, otherImportCrc: 0 }]);
  assert.deepEqual(result.lines.map((line) => line.hkShippingUsd), [10, 10]);
  assert.equal(result.batches[0].lineCount, 2);
});
