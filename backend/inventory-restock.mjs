import { SIZE_KEYS } from "./inventory-costing.mjs";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 90;
const MIN_WINDOW_DAYS = 14;
const SAFETY_FACTOR = 1.2;

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const netUnits = (sale) => sale.quantity - (sale.refundedQuantity ?? 0);

function clampInt(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

// Ranks garments by sales velocity and recommends the next order from recent sell-through.
// A line needs reorder when its stock will not last until a new shipment arrives (leadTimeDays);
// the suggested quantity covers leadTimeDays + coverageDays of demand with a safety margin.
export function buildRestock({ lines, sales, now = new Date(), leadTimeDays = 45, coverageDays = 60 }) {
  const lead = clampInt(leadTimeDays, 45, 0, 365);
  const coverage = clampInt(coverageDays, 60, 7, 365);
  const windowStart = now.getTime() - WINDOW_DAYS * DAY_MS;
  const active = sales.filter((sale) => !sale.voidedAt);
  const firstSale = active.reduce((min, sale) => Math.min(min, new Date(sale.soldAt).getTime()), Infinity);
  const historyDays = Number.isFinite(firstSale) ? (now.getTime() - firstSale) / DAY_MS : 0;
  const windowDays = Math.max(MIN_WINDOW_DAYS, Math.min(WINDOW_DAYS, historyDays));

  const soldBySize = new Map();
  const lastSale = new Map();
  for (const sale of active) {
    const time = new Date(sale.soldAt).getTime();
    if (time < windowStart || time > now.getTime()) continue;
    const entry = soldBySize.get(sale.lineId) ?? {};
    entry[sale.size] = (entry[sale.size] ?? 0) + netUnits(sale);
    soldBySize.set(sale.lineId, entry);
    lastSale.set(sale.lineId, Math.max(lastSale.get(sale.lineId) ?? 0, time));
  }

  const items = lines.map((line) => {
    const sold = soldBySize.get(line.id) ?? {};
    const sizes = SIZE_KEYS.map((size) => {
      const stock = Math.max(0, line.remaining?.[size] ?? 0);
      const velocity = (sold[size] ?? 0) / windowDays;
      const suggested = velocity > 0 ? Math.max(0, Math.ceil(velocity * (lead + coverage) * SAFETY_FACTOR - stock)) : 0;
      return { size, stock, sold: sold[size] ?? 0, velocityPerWeek: round(velocity * 7), suggested };
    }).filter((entry) => entry.stock > 0 || entry.sold > 0);
    const unitsSold = sizes.reduce((total, entry) => total + entry.sold, 0);
    const stock = sizes.reduce((total, entry) => total + entry.stock, 0);
    const velocity = unitsSold / windowDays;
    const daysOfStock = velocity > 0 ? stock / velocity : null;
    const suggested = sizes.reduce((total, entry) => total + entry.suggested, 0);
    const costPerUnitUsd = line.unitPriceUsd ?? 0;
    return {
      lineId: line.id,
      code: line.code,
      productName: line.productName,
      color: line.color,
      stock,
      unitsSold,
      velocityPerWeek: round(velocity * 7),
      daysOfStock: daysOfStock === null ? null : round(daysOfStock, 1),
      lastSaleAt: lastSale.has(line.id) ? new Date(lastSale.get(line.id)).toISOString() : null,
      sizes,
      suggested,
      estimatedCostUsd: round(suggested * costPerUnitUsd),
      status: "normal",
    };
  });

  const sellers = items.filter((item) => item.unitsSold > 0).sort((a, b) => b.velocityPerWeek - a.velocityPerWeek);
  const fastCut = Math.max(1, Math.ceil(sellers.length / 3));
  const slowFrom = sellers.length - fastCut;
  const rank = new Map(sellers.map((item, index) => [item.lineId, index]));
  for (const item of items) {
    const position = rank.get(item.lineId);
    if (item.unitsSold === 0) item.status = item.stock > 0 ? "dead" : "none";
    else if (item.suggested > 0 && item.daysOfStock !== null && item.daysOfStock <= lead) item.status = position < fastCut ? "reorder_fast" : "reorder";
    else if (sellers.length >= 3 && position < fastCut) item.status = "fast";
    else if (sellers.length >= 3 && position >= slowFrom) item.status = "slow";
  }

  const reorder = items.filter((item) => item.status.startsWith("reorder")).sort((a, b) => (a.daysOfStock ?? 0) - (b.daysOfStock ?? 0));
  const recommended = items.filter((item) => item.suggested > 0 && (item.status.startsWith("reorder") || item.status === "fast"));
  return {
    params: { leadTimeDays: lead, coverageDays: coverage, windowDays: Math.round(windowDays), enoughHistory: historyDays >= 28 },
    fastest: sellers.slice(0, 5),
    slowest: items.filter((item) => item.stock > 0).sort((a, b) => a.velocityPerWeek - b.velocityPerWeek || b.stock - a.stock).slice(0, 5),
    needsReorder: reorder,
    nextOrder: {
      lines: recommended.sort((a, b) => b.suggested - a.suggested),
      totalUnits: recommended.reduce((total, item) => total + item.suggested, 0),
      estimatedCostUsd: round(recommended.reduce((total, item) => total + item.estimatedCostUsd, 0)),
    },
  };
}
