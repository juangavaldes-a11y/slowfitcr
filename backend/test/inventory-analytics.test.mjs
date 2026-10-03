import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalytics, projectPayback, saleEconomics } from "../inventory-analytics.mjs";

const now = new Date("2026-10-30T00:00:00Z");
const sale = (soldAt, quantity, price, method = "Cash", extra = {}) => ({ lineId: "l1", soldAt: new Date(soldAt), quantity, unitPriceCrc: price, discountCrc: 0, paymentMethod: method, voidedAt: null, ...extra });
const lines = [{ id: "l1", productName: "Top", remainingQuantity: 10, cost: { costPerUnitCrc: 5000, salePriceCrc: 15000 } }];

test("saleEconomics applies commission only to card-like methods", () => {
  assert.equal(saleEconomics(sale("2026-10-01", 1, 10000, "Cash"), 4000, 0.02).profit, 6000);
  assert.equal(saleEconomics(sale("2026-10-01", 1, 10000, "Card"), 4000, 0.02).profit, 5800);
  assert.equal(saleEconomics({ ...sale("2026-10-01", 2, 10000), discountCrc: 5000 }, 0, 0).revenue, 15000);
});

test("buildAnalytics aggregates, ignores voided sales and computes recovery", () => {
  const result = buildAnalytics({
    lines,
    commissionRate: 0,
    invested: 100000,
    now,
    sales: [sale("2026-10-02", 2, 15000), sale("2026-10-09", 1, 15000, "Card"), sale("2026-10-09", 5, 15000, "Cash", { voidedAt: new Date() })],
  });
  assert.equal(result.totals.units, 3);
  assert.equal(result.totals.netRevenue, 45000);
  assert.equal(result.totals.recoveredPct, 0.45);
  assert.equal(result.daily.at(-1).cumulativeProfit, 30000);
  assert.deepEqual(result.byMethod.map((row) => row.method), ["Cash", "Card"]);
  assert.equal(result.totals.remainingNetRevenue, 150000);
});

test("projectPayback gives ordered scenarios and handles no sales or enough stock limits", () => {
  const series = Array.from({ length: 6 }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, 25 + i * 7)).toISOString().slice(0, 10), netRevenue: 10000 * (i + 1) }));
  const result = projectPayback({ invested: 200000, recovered: 210000 - 210000 + 0, remainingNetRevenue: 500000, series, now });
  const [worst, base, best] = result.scenarios;
  assert.ok(worst.weeklyRevenue <= base.weeklyRevenue && base.weeklyRevenue <= best.weeklyRevenue);
  assert.ok(best.weeksToPayback <= worst.weeksToPayback);
  assert.equal(result.scenarios[0].curve.length, 53);
  const none = projectPayback({ invested: 1000, recovered: 0, remainingNetRevenue: 5000, series: [], now });
  assert.equal(none.scenarios[1].paybackDate, null);
  const limited = projectPayback({ invested: 1000, recovered: 0, remainingNetRevenue: 500, series, now });
  assert.equal(limited.scenarios[1].paybackDate, null);
  const done = projectPayback({ invested: 1000, recovered: 1000, remainingNetRevenue: 0, series, now });
  assert.equal(done.scenarios[1].weeksToPayback, 0);
});

test("refunds reduce revenue and units; restocked units also drop their cost", () => {
  const base = sale("2026-10-01", 4, 10000, "Cash", { discountCrc: 4000 });
  assert.equal(saleEconomics(base, 3000, 0).revenue, 36000);
  const refunded = { ...base, refundedQuantity: 2, restockedQuantity: 0 };
  assert.deepEqual([saleEconomics(refunded, 3000, 0).revenue, saleEconomics(refunded, 3000, 0).cost], [18000, 12000]);
  const restocked = { ...refunded, restockedQuantity: 2 };
  assert.equal(saleEconomics(restocked, 3000, 0).cost, 6000);
  const result = buildAnalytics({ lines, commissionRate: 0, invested: 50000, now, sales: [restocked] });
  assert.equal(result.totals.units, 2);
  assert.equal(result.totals.revenue, 18000);
});
