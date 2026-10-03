// Mirrors the "Costeo" sheet of Inventario precios.xlsx (rows 8-87, totals in row 88).
export const SIZE_KEYS = ["S", "M", "L", "XL", "OS"];

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function sumSizes(sizes = {}) {
  return SIZE_KEYS.reduce((total, key) => total + (Number.isFinite(Number(sizes[key])) ? Number(sizes[key]) : 0), 0);
}

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

export function computeInventoryCosts(rawLines, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const crReady = [settings.fxRate, settings.crShippingUsd, settings.nationalizationCrc, settings.otherImportCrc]
    .every((value) => value !== null);

  const base = rawLines.map((line) => {
    const quantity = sumSizes(line.sizes);
    const unitPriceUsd = toNumber(line.unitPriceUsd) ?? 0;
    const piecesPerGarment = toNumber(line.piecesPerGarment) ?? 1;
    const customizationPerUnitUsd = piecesPerGarment * settings.customizationPerPieceUsd;
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
    const hkShippingUsd = settings.hkShippingUsd * share(row);
    const invoiceAdjustmentUsd = settings.invoiceAdjustmentUsd * share(row);
    const paidInvestmentUsd = row.goodsUsd + row.customizationUsd + hkShippingUsd + invoiceAdjustmentUsd;
    return { ...row, hkShippingUsd, invoiceAdjustmentUsd, paidInvestmentUsd };
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
      result.crShippingUsd = settings.crShippingUsd * paidShare;
      result.nationalizationCrc = settings.nationalizationCrc * paidShare;
      result.otherImportCrc = settings.otherImportCrc * paidShare;
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

  const totalQuantity = lines.reduce((total, line) => total + line.quantity, 0);
  const sum = (key) => lines.reduce((total, line) => total + (line[key] ?? 0), 0);
  const allPriced = lines.every((line) => line.salePriceCrc !== null);
  const totals = {
    quantity: totalQuantity,
    goodsUsd: sum("goodsUsd"),
    customizationUsd: sum("customizationUsd"),
    hkShippingUsd: sum("hkShippingUsd"),
    invoiceAdjustmentUsd: sum("invoiceAdjustmentUsd"),
    paidInvestmentUsd: totalPaidUsd,
    totalInventoryCostCrc: crReady ? sum("totalInventoryCostCrc") : null,
    expectedSalesCrc: allPriced ? sum("expectedSalesCrc") : null,
    totalContributionCrc: crReady && allPriced ? sum("totalContributionCrc") : null,
  };
  totals.costPerUnitCrc = totals.totalInventoryCostCrc !== null && totalQuantity
    ? totals.totalInventoryCostCrc / totalQuantity : null;
  totals.contributionMargin = totals.totalContributionCrc !== null && totals.expectedSalesCrc
    ? totals.totalContributionCrc / totals.expectedSalesCrc : null;

  return { settings, crReady, lines, totals };
}
