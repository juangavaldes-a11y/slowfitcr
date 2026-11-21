// Pure logic for the inventory scanner session (receiving stock and physical counts). No React, no imports.

export type ScanMode = "receive" | "count";

export type ScannedItem = {
  lineId: string;
  size: string;
  sku: string;
  productName: string;
  color: string;
  remaining: number;
};

export type ScanRow = ScannedItem & { key: string; quantity: number };

export const rowKey = (lineId: string, size: string) => `${lineId}:${size}`;

// Every scan of the same SKU adds one unit; a new SKU starts a row at one.
export function addScan(rows: ScanRow[], item: ScannedItem): ScanRow[] {
  const key = rowKey(item.lineId, item.size);
  if (rows.some((row) => row.key === key)) {
    return rows.map((row) => (row.key === key ? { ...row, quantity: row.quantity + 1, remaining: item.remaining } : row));
  }
  return [...rows, { ...item, key, quantity: 1 }];
}

export function setRowQuantity(rows: ScanRow[], key: string, quantity: number): ScanRow[] {
  const clean = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  return rows.map((row) => (row.key === key ? { ...row, quantity: clean } : row));
}

export const removeRow = (rows: ScanRow[], key: string) => rows.filter((row) => row.key !== key);

// In count mode the number typed is what is physically on the shelf; the difference is what the system gets wrong.
export const countDifference = (row: ScanRow) => row.quantity - row.remaining;

export function sessionSummary(rows: ScanRow[], mode: ScanMode) {
  const units = rows.reduce((total, row) => total + row.quantity, 0);
  if (mode === "receive") return { rows: rows.length, units, differences: 0, shortfall: 0, surplus: 0 };
  const diffs = rows.map(countDifference);
  return {
    rows: rows.length,
    units,
    differences: diffs.filter((diff) => diff !== 0).length,
    shortfall: diffs.filter((diff) => diff < 0).reduce((total, diff) => total + diff, 0),
    surplus: diffs.filter((diff) => diff > 0).reduce((total, diff) => total + diff, 0),
  };
}

// Receiving ignores zero rows; counting keeps them (a counted zero is a real answer).
export function applyBody(rows: ScanRow[], mode: ScanMode, note = "") {
  const used = mode === "receive" ? rows.filter((row) => row.quantity > 0) : rows;
  return { mode, note, items: used.map((row) => ({ lineId: row.lineId, size: row.size, quantity: row.quantity })) };
}
