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
