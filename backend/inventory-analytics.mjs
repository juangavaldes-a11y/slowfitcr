const DAY_MS = 86_400_000;
const COMMISSION_METHODS = new Set(["card", "website checkout"]);

const dayKey = (date) => new Date(date).toISOString().slice(0, 10);
const round = (value) => Math.round(value * 100) / 100;

// Units still sold after refunds; restocked units go back to inventory and carry no cost.
export const netQuantity = (sale) => sale.quantity - (sale.refundedQuantity ?? 0);

export function saleEconomics(sale, costPerUnitCrc, commissionRate) {
  const net = netQuantity(sale);
  const revenue = Number(sale.unitPriceCrc) * net - Number(sale.discountCrc) * (net / sale.quantity);
  const commission = COMMISSION_METHODS.has(String(sale.paymentMethod).toLowerCase()) ? revenue * commissionRate : 0;
  const cost = (costPerUnitCrc ?? 0) * (sale.quantity - (sale.restockedQuantity ?? 0));
  return { revenue, commission, cost, profit: revenue - commission - cost };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

// Projects when net sales revenue recovers the investment under worst/base/best weekly sales pace.
export function projectPayback({ invested, recovered, remainingNetRevenue, series, now = new Date() }) {
  const result = { scenarios: [], weeksOfHistory: 0 };
  const start = series.length ? new Date(series[0].date) : null;
  const weeks = [];
  if (start) {
    const totalWeeks = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / (7 * DAY_MS)));
    for (let week = 0; week < totalWeeks; week += 1) weeks.push(0);
    for (const point of series) {
      const index = Math.min(totalWeeks - 1, Math.floor((new Date(point.date).getTime() - start.getTime()) / (7 * DAY_MS)));
      weeks[index] += point.netRevenue;
    }
  }
  result.weeksOfHistory = weeks.length;
  const sorted = [...weeks].sort((a, b) => a - b);
  const mean = weeks.length ? weeks.reduce((total, value) => total + value, 0) / weeks.length : 0;
  const recent = weeks.slice(-4);
  const base = recent.length ? recent.reduce((total, value) => total + value, 0) / recent.length : 0;
  const enoughData = weeks.length >= 4;
  const paces = {
    worst: enoughData ? percentile(sorted, 0.25) : base * 0.5,
    base,
    best: enoughData ? Math.max(percentile(sorted, 0.75), base) : base * 1.5,
  };
  const outstanding = Math.max(0, invested - recovered);
  for (const [name, weeklyRevenue] of Object.entries(paces)) {
    const maxRecoverable = recovered + remainingNetRevenue;
    let paybackDate = null;
    let weeksToPayback = null;
    if (outstanding === 0) {
      weeksToPayback = 0;
      paybackDate = dayKey(now);
    } else if (weeklyRevenue > 0 && remainingNetRevenue >= outstanding) {
      weeksToPayback = outstanding / weeklyRevenue;
      paybackDate = dayKey(new Date(now.getTime() + weeksToPayback * 7 * DAY_MS));
    }
    const curve = [];
    let cumulative = recovered;
    for (let week = 0; week <= 52; week += 1) {
      curve.push({ week, date: dayKey(new Date(now.getTime() + week * 7 * DAY_MS)), recovered: round(Math.min(maxRecoverable, cumulative)) });
      cumulative += weeklyRevenue;
    }
    result.scenarios.push({
      name,
      weeklyRevenue: round(weeklyRevenue),
      weeksToPayback: weeksToPayback === null ? null : round(weeksToPayback),
      paybackDate,
      roiAtSellOut: invested ? round((maxRecoverable - invested) / invested) : null,
      curve,
    });
  }
  result.meanWeeklyRevenue = round(mean);
  return result;
}

export function buildAnalytics({ lines, sales, commissionRate, invested, now = new Date() }) {
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const byDay = new Map();
  const byMethod = new Map();
  const byProduct = new Map();
  const totals = { units: 0, revenue: 0, commission: 0, cost: 0, profit: 0 };

  for (const sale of sales) {
    if (sale.voidedAt) continue;
    const line = lineById.get(sale.lineId);
    const economics = saleEconomics(sale, line?.cost?.costPerUnitCrc ?? 0, commissionRate);
    const key = dayKey(sale.soldAt);
    const day = byDay.get(key) ?? { date: key, units: 0, revenue: 0, netRevenue: 0, profit: 0 };
    const units = netQuantity(sale);
    day.units += units;
    day.revenue += economics.revenue;
    day.netRevenue += economics.revenue - economics.commission;
    day.profit += economics.profit;
    byDay.set(key, day);

    const method = byMethod.get(sale.paymentMethod) ?? { method: sale.paymentMethod, units: 0, revenue: 0 };
    method.units += units;
    method.revenue += economics.revenue;
    byMethod.set(sale.paymentMethod, method);

    const productKey = line ? `${line.productName}` : "?";
    const product = byProduct.get(productKey) ?? { product: productKey, units: 0, revenue: 0, profit: 0 };
    product.units += units;
    product.revenue += economics.revenue;
    product.profit += economics.profit;
    byProduct.set(productKey, product);

    totals.units += units;
    totals.revenue += economics.revenue;
    totals.commission += economics.commission;
    totals.cost += economics.cost;
    totals.profit += economics.profit;
  }

  const series = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  let cumulativeNet = 0;
  let cumulativeProfit = 0;
  const daily = series.map((day) => {
    cumulativeNet += day.netRevenue;
    cumulativeProfit += day.profit;
    return {
      date: day.date,
      units: day.units,
      revenue: round(day.revenue),
      netRevenue: round(day.netRevenue),
      profit: round(day.profit),
      cumulativeNetRevenue: round(cumulativeNet),
      cumulativeProfit: round(cumulativeProfit),
    };
  });

  const remainingUnits = lines.reduce((total, line) => total + (line.remainingQuantity ?? 0), 0);
  const remainingNetRevenue = lines.reduce((total, line) => {
    const price = line.cost?.salePriceCrc ?? 0;
    return total + (line.remainingQuantity ?? 0) * price * (1 - commissionRate);
  }, 0);
  const remainingCost = lines.reduce((total, line) => total + (line.remainingQuantity ?? 0) * (line.cost?.costPerUnitCrc ?? 0), 0);

  const round2 = (entries) => entries.map((entry) => Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])));
  const projection = projectPayback({ invested, recovered: cumulativeNet, remainingNetRevenue, series: daily, now });

  return {
    totals: {
      ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, round(value)])),
      netRevenue: round(cumulativeNet),
      invested: round(invested),
      recoveredPct: invested ? round(cumulativeNet / invested) : null,
      roi: invested ? round((cumulativeNet - invested) / invested) : null,
      remainingUnits,
      remainingCost: round(remainingCost),
      remainingNetRevenue: round(remainingNetRevenue),
    },
    daily,
    byMethod: round2([...byMethod.values()].sort((a, b) => b.revenue - a.revenue)),
    byProduct: round2([...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 15)),
    projection,
  };
}
