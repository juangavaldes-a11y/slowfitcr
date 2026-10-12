import assert from "node:assert/strict";
import test from "node:test";
import { buildRestock } from "../inventory-restock.mjs";

const now = new Date("2026-10-01T00:00:00Z");
const line = (id, remaining) => ({ id, code: id, productName: id, color: "Black", unitPriceUsd: 10, remaining: { S: remaining, M: 0, L: 0, XL: 0, OS: 0 } });
const sale = (lineId, quantity, daysAgo) => ({ lineId, size: "S", quantity, refundedQuantity: 0, soldAt: new Date(now.getTime() - daysAgo * 86_400_000) });

test("restock ranks velocity, flags reorder and dead stock and suggests quantities", () => {
  const lines = [line("fast", 5), line("mid", 50), line("slow", 40), line("dead", 20)];
  const sales = [sale("fast", 30, 60), sale("fast", 30, 5), sale("mid", 10, 30), sale("slow", 1, 20)];
  const result = buildRestock({ lines, sales, now, leadTimeDays: 30, coverageDays: 60 });
  assert.equal(result.fastest[0].lineId, "fast");
  const byId = Object.fromEntries([...result.needsReorder, ...result.nextOrder.lines].map((item) => [item.lineId, item]));
  assert.equal(byId.fast.status, "reorder_fast");
  assert.ok(byId.fast.suggested > 0);
  assert.equal(result.needsReorder.some((item) => item.lineId === "slow"), false);
  assert.equal(result.slowest.find((item) => item.lineId === "dead").status, "dead");
  assert.equal(result.nextOrder.totalUnits, result.nextOrder.lines.reduce((total, item) => total + item.suggested, 0));
});

test("restock ignores voided sales and handles no history", () => {
  const empty = buildRestock({ lines: [line("a", 5)], sales: [{ ...sale("a", 5, 3), voidedAt: new Date() }], now });
  assert.equal(empty.nextOrder.lines.length, 0);
  assert.equal(empty.params.enoughHistory, false);
});
