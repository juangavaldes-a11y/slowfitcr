// Mirrors the "Costeo" sheet of Inventario precios.xlsx (rows 8-87, totals in row 88), applied per purchase (batch).
export const SIZE_KEYS = ["S", "M", "L", "XL", "OS"];

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function sumSizes(sizes = {}) {
  return SIZE_KEYS.reduce((total, key) => total + (Number.isFinite(Number(sizes[key])) ? Number(sizes[key]) : 0), 0);
}

// Costs that do not depend on the purchase: the exchange rate, a flat extra per piece and the card commission.
export function normalizeSettings(raw = {}) {
  return {
    hkShippingUsd: toNumber(raw.hkShippingUsd) ?? 0,
    invoiceAdjustmentUsd: toNumber(raw.invoiceAdjustmentUsd) ?? 0,
    fxRate: toNumber(raw.fxRate),
    crShippingUsd: toNumber(raw.crShippingUsd),
    nationalizationCrc: toNumber(raw.nationalizationCrc),
    otherImportCrc: toNumber(raw.otherImportCrc),
    extraUnitCrc: toNumber(raw.extraUnitCrc) ?? 0,
    cardCommissionRate: toNumber(raw.cardCommissionRate) ?? 0,
    customizationPerPieceUsd: toNumber(raw.customizationPerPieceUsd) ?? 0,
  };
}

// Costs of one purchase. Printing, packaging and discount are fixed totals from the invoice; they are spread over the
// purchase like the shipping. The Costa Rica side stays null until it is known, which keeps the purchase "pending".
export function normalizeBatch(raw = {}) {
  return {
    id: raw.id ?? null,
    name: raw.name ?? null,
    hkShippingUsd: toNumber(raw.hkShippingUsd) ?? 0,
    invoiceAdjustmentUsd: toNumber(raw.invoiceAdjustmentUsd) ?? 0,
    customizationPerPieceUsd: toNumber(raw.customizationPerPieceUsd) ?? 0,
    logoPrintingUsd: toNumber(raw.logoPrintingUsd) ?? 0,
    sizePrintingUsd: toNumber(raw.sizePrintingUsd) ?? 0,
    packagingUsd: toNumber(raw.packagingUsd) ?? 0,
    discountUsd: toNumber(raw.discountUsd) ?? 0,
    crShippingUsd: toNumber(raw.crShippingUsd),
    nationalizationCrc: toNumber(raw.nationalizationCrc),
    otherImportCrc: toNumber(raw.otherImportCrc),
  };
}

// Computes one purchase's lines. Returns rows in the order received.
function costBatch(rawLines, batch, settings) {
  const crReady = [settings.fxRate, batch.crShippingUsd, batch.nationalizationCrc, batch.otherImportCrc].every((value) => value !== null);
  const expensesUsd = batch.logoPrintingUsd + batch.sizePrintingUsd + batch.packagingUsd - batch.discountUsd;

  const base = rawLines.map((line) => {
    const quantity = sumSizes(line.sizes);
    const unitPriceUsd = toNumber(line.unitPriceUsd) ?? 0;
    const piecesPerGarment = toNumber(line.piecesPerGarment) ?? 1;
    const customizationPerUnitUsd = piecesPerGarment * batch.customizationPerPieceUsd;
    return {
      quantity,
      goodsUsd: quantity * unitPriceUsd,
      customizationUsd: quantity * customizationPerUnitUsd,
      customizationPerUnitUsd,
    };
  });

  const goodsPlusCustomization = base.reduce((total, row) => total + row.goodsUsd + row.customizationUsd, 0);
  const share = (row) => (goodsPlusCustomization ? (row.goodsUsd + row.customizationUsd) / goodsPlusCustomization : 0);

  const withUsd = base.map((row) => {
    const hkShippingUsd = batch.hkShippingUsd * share(row);
    const invoiceAdjustmentUsd = batch.invoiceAdjustmentUsd * share(row);
    const batchExpensesUsd = expensesUsd * share(row);
    const paidInvestmentUsd = row.goodsUsd + row.customizationUsd + hkShippingUsd + invoiceAdjustmentUsd + batchExpensesUsd;
    return { ...row, hkShippingUsd, invoiceAdjustmentUsd, batchExpensesUsd, paidInvestmentUsd };
  });
  const totalPaidUsd = withUsd.reduce((total, row) => total + row.paidInvestmentUsd, 0);

  const lines = withUsd.map((row, index) => {
    const salePriceCrc = toNumber(rawLines[index].salePriceCrc);
    const paidShare = totalPaidUsd ? row.paidInvestmentUsd / totalPaidUsd : 0;
    const result = {
      ...row,
      paidCostPerUnitUsd: row.quantity ? row.paidInvestmentUsd / row.quantity : 0,
      crShippingUsd: null,
      nationalizationCrc: null,
      otherImportCrc: null,
      totalInventoryCostCrc: null,
      costPerUnitCrc: null,
      salePriceCrc,
      cardCommissionCrc: null,
      variableCostPerUnitCrc: null,
      contributionPerUnitCrc: null,
      contributionMargin: null,
      expectedSalesCrc: salePriceCrc === null ? null : row.quantity * salePriceCrc,
      totalContributionCrc: null,
    };
    if (crReady) {
      result.crShippingUsd = batch.crShippingUsd * paidShare;
      result.nationalizationCrc = batch.nationalizationCrc * paidShare;
      result.otherImportCrc = batch.otherImportCrc * paidShare;
      result.totalInventoryCostCrc = (row.paidInvestmentUsd + result.crShippingUsd) * settings.fxRate
        + result.nationalizationCrc + result.otherImportCrc + row.quantity * settings.extraUnitCrc;
      result.costPerUnitCrc = row.quantity ? result.totalInventoryCostCrc / row.quantity : null;
    }
    if (salePriceCrc !== null) {
      result.cardCommissionCrc = salePriceCrc * settings.cardCommissionRate;
      if (result.costPerUnitCrc !== null) {
        result.variableCostPerUnitCrc = result.costPerUnitCrc + result.cardCommissionCrc;
        result.contributionPerUnitCrc = salePriceCrc - result.variableCostPerUnitCrc;
        result.contributionMargin = salePriceCrc ? result.contributionPerUnitCrc / salePriceCrc : null;
        result.totalContributionCrc = row.quantity * result.contributionPerUnitCrc;
      }
    }
    return result;
  });
  return { lines, crReady, totalPaidUsd };
}

// rawBatches holds the purchases (each line points to one through batchId; lines without one belong to the oldest purchase).
// Without any purchase, the cost fields of the settings act as a single one, as before purchases existed.
export function computeInventoryCosts(rawLines, rawSettings, rawBatches = []) {
  const settings = normalizeSettings(rawSettings);
  const batches = rawBatches.length ? rawBatches.map(normalizeBatch) : [normalizeBatch({ ...rawSettings })];
  const indexOfBatch = (line) => {
    const found = batches.findIndex((batch) => batch.id !== null && batch.id === line.batchId);
    return found === -1 ? 0 : found;
  };

  const grouped = batches.map(() => []);
  rawLines.forEach((line, index) => grouped[indexOfBatch(line)].push(index));

  const lines = new Array(rawLines.length);
  const summaries = batches.map((batch, position) => {
    const { lines: costed, crReady, totalPaidUsd } = costBatch(grouped[position].map((index) => rawLines[index]), batch, settings);
    grouped[position].forEach((index, offset) => { lines[index] = costed[offset]; });
    const sum = (key) => costed.reduce((total, line) => total + (line[key] ?? 0), 0);
    return {
      id: batch.id,
      name: batch.name,
      crReady,
      lineCount: costed.length,
      quantity: sum("quantity"),
      goodsUsd: sum("goodsUsd"),
      paidInvestmentUsd: totalPaidUsd,
      totalInventoryCostCrc: crReady ? sum("totalInventoryCostCrc") : null,
    };
  });

  // A purchase without lines does not hold the whole inventory back.
  const relevant = rawLines.length ? summaries.filter((summary) => summary.lineCount > 0) : summaries.slice(0, 1);
  const crReady = relevant.every((summary) => summary.crReady);

  const totalQuantity = lines.reduce((total, line) => total + line.quantity, 0);
  const sum = (key) => lines.reduce((total, line) => total + (line[key] ?? 0), 0);
  const allPriced = lines.every((line) => line.salePriceCrc !== null);
  const anyReady = relevant.some((summary) => summary.crReady);
  // Costs of purchases that are still pending are left out, so these CRC totals cover only the purchases that are ready.
  const totals = {
    quantity: totalQuantity,
    goodsUsd: sum("goodsUsd"),
    customizationUsd: sum("customizationUsd"),
    hkShippingUsd: sum("hkShippingUsd"),
    invoiceAdjustmentUsd: sum("invoiceAdjustmentUsd"),
    batchExpensesUsd: sum("batchExpensesUsd"),
    paidInvestmentUsd: summaries.reduce((total, summary) => total + summary.paidInvestmentUsd, 0),
    totalInventoryCostCrc: anyReady ? sum("totalInventoryCostCrc") : null,
    expectedSalesCrc: allPriced ? sum("expectedSalesCrc") : null,
    totalContributionCrc: crReady && allPriced ? sum("totalContributionCrc") : null,
  };
  const readyQuantity = lines.reduce((total, line) => total + (line.totalInventoryCostCrc === null ? 0 : line.quantity), 0);
  totals.costPerUnitCrc = totals.totalInventoryCostCrc !== null && readyQuantity
    ? totals.totalInventoryCostCrc / readyQuantity : null;
  totals.contributionMargin = totals.totalContributionCrc !== null && totals.expectedSalesCrc
    ? totals.totalContributionCrc / totals.expectedSalesCrc : null;

  return { settings, crReady, lines, totals, batches: summaries };
}
