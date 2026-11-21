import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addScan, applyBody, countDifference, removeRow, rowKey, sessionSummary, setRowQuantity, type ScannedItem } from "../app/lib/inventory-scan.ts";

const item = (overrides: Partial<ScannedItem> = {}): ScannedItem => ({ lineId: "l1", size: "M", sku: "SLWA17-ROSA-M", productName: "Aura", color: "Rosa", remaining: 4, ...overrides });

describe("scan session", () => {
  it("starts a row at one and adds one per repeated scan of the same SKU", () => {
    let rows = addScan([], item());
    assert.equal(rows.length, 1);
    assert.equal(rows[0].key, rowKey("l1", "M"));
    assert.equal(rows[0].quantity, 1);
    rows = addScan(rows, item({ remaining: 5 }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].quantity, 2);
    assert.equal(rows[0].remaining, 5);
  });

  it("keeps different sizes and colors as separate rows", () => {
    const rows = addScan(addScan([], item()), item({ size: "L", sku: "SLWA17-ROSA-L" }));
    assert.equal(rows.length, 2);
  });

  it("clamps typed quantities to whole numbers from zero and removes rows", () => {
    const rows = addScan([], item());
    assert.equal(setRowQuantity(rows, rows[0].key, 7.9)[0].quantity, 7);
    assert.equal(setRowQuantity(rows, rows[0].key, -3)[0].quantity, 0);
    assert.equal(setRowQuantity(rows, rows[0].key, Number.NaN)[0].quantity, 0);
    assert.equal(removeRow(rows, rows[0].key).length, 0);
  });
});

describe("count summary", () => {
  const rows = [
    ...addScan([], item({ remaining: 3 })).map((row) => ({ ...row, quantity: 5 })),
    ...addScan([], item({ lineId: "l2", remaining: 4 })).map((row) => ({ ...row, quantity: 1 })),
    ...addScan([], item({ lineId: "l3", remaining: 2 })).map((row) => ({ ...row, quantity: 2 })),
  ];

  it("reports surplus, shortfall and how many rows differ", () => {
    assert.equal(countDifference(rows[0]), 2);
    assert.deepEqual(sessionSummary(rows, "count"), { rows: 3, units: 8, differences: 2, shortfall: -3, surplus: 2 });
    assert.deepEqual(sessionSummary(rows, "receive"), { rows: 3, units: 8, differences: 0, shortfall: 0, surplus: 0 });
  });
});

describe("apply payload", () => {
  const rows = [
    { ...addScan([], item())[0], quantity: 0 },
    { ...addScan([], item({ lineId: "l2" }))[0], quantity: 3 },
  ];

  it("drops zero rows when receiving", () => {
    const body = applyBody(rows, "receive", "pedido 3");
    assert.deepEqual(body, { mode: "receive", note: "pedido 3", items: [{ lineId: "l2", size: "M", quantity: 3 }] });
  });

  it("keeps a counted zero when counting", () => {
    const body = applyBody(rows, "count");
    assert.deepEqual(body.items, [{ lineId: "l1", size: "M", quantity: 0 }, { lineId: "l2", size: "M", quantity: 3 }]);
  });
});
