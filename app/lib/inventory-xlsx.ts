import type { Cell, CellValue } from "exceljs";

export type XlsxLine = {
  code: string;
  productName: string;
  color: string;
  sizes: Record<"S" | "M" | "L" | "XL" | "OS", number>;
  piecesPerGarment: number;
  unitPriceUsd: number;
  salePriceCrc: number | null;
  supplierEquivalence: string | null;
};

export type ExportLine = XlsxLine & {
  cost: Record<string, number | null>;
};

type ExportView = { settings: Record<string, number | null>; lines: ExportLine[] };

const HEADER_ROW = 7;
const FIRST_ROW = 8;
const SIZE_COLUMNS = ["S", "M", "L", "XL", "OS"] as const;
const HEADERS = [
  "No.", "Código", "Producto", "Color", "S", "M", "L", "XL", "Talla única", "Equivalencia proveedor",
  "Cantidad total por color", "Piezas por prenda", "Precio unitario USD", "Mercadería USD",
  "Personalización / unidad USD", "Personalización USD", "Envío HK asignado USD", "Ajuste pago/factura USD",
  "Inversión pagada USD", "Costo pagado / prenda USD", "Envío CR asignado USD", "Nacionalización asignada CRC",
  "Otros importación asignados CRC", "Costo total inventario CRC", "Costo por prenda CRC", "Precio de venta CRC",
  "Comisión tarjeta CRC", "Costo variable / prenda CRC", "Contribución / prenda CRC", "Margen contribución",
  "Inversión total línea CRC", "Venta esperada línea CRC", "Contribución total línea CRC",
];

const SETTING_ROWS: Array<[number, string, string]> = [
  [12, "Envío HK USD", "hkShippingUsd"],
  [13, "Ajuste pago/factura USD", "invoiceAdjustmentUsd"],
  [22, "Tipo de cambio CRC/USD", "fxRate"],
  [23, "Envío CR USD", "crShippingUsd"],
  [24, "Nacionalización CRC", "nationalizationCrc"],
  [25, "Otros importación CRC", "otherImportCrc"],
  [26, "Extra por prenda CRC", "extraUnitCrc"],
  [28, "Comisión tarjeta", "cardCommissionRate"],
  [29, "Personalización por pieza USD", "customizationPerPieceUsd"],
];

const resultOf = (value: CellValue): unknown =>
  value && typeof value === "object" && "result" in value ? (value as { result: unknown }).result : value;

const text = (value: CellValue) => {
  const raw = resultOf(value);
  return raw === null || raw === undefined ? "" : String(raw).trim();
};

const numberOf = (value: CellValue) => {
  const raw = resultOf(value);
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

async function loadWorkbook() {
  const exceljs = await import("exceljs");
  return exceljs.Workbook ?? (exceljs as unknown as { default: typeof exceljs }).default.Workbook;
}

export async function exportInventoryWorkbook(view: ExportView) {
  const Workbook = await loadWorkbook();
  const workbook = new Workbook();
  const settings = workbook.addWorksheet("Supuestos");
  settings.getColumn(1).width = 34;
  settings.getColumn(2).width = 18;
  settings.getCell("A1").value = "Supuestos de importación";
  for (const [row, label, key] of SETTING_ROWS) {
    settings.getCell(`A${row}`).value = label;
    settings.getCell(`B${row}`).value = view.settings[key] ?? null;
  }

  const sheet = workbook.addWorksheet("Costeo");
  sheet.getCell("A2").value = "Inventario y costeo por modelo, color y talla";
  HEADERS.forEach((header, index) => {
    const cell = sheet.getCell(HEADER_ROW, index + 1);
    cell.value = header;
    cell.font = { bold: true };
    sheet.getColumn(index + 1).width = Math.max(10, Math.min(28, header.length + 2));
  });
  sheet.views = [{ state: "frozen", ySplit: HEADER_ROW, xSplit: 4 }];

  const last = FIRST_ROW + view.lines.length - 1;
  const S = "Supuestos!";
  const denominator = `SUM($N$${FIRST_ROW}:$N$${last},$P$${FIRST_ROW}:$P$${last})`;
  const sumS = `SUM($S$${FIRST_ROW}:$S$${last})`;
  const ready = `COUNTBLANK(${S}$B$22:$B$25)>0`;
  const f = (formula: string, result: number | null) => ({ formula, result: result ?? "" } as CellValue);

  view.lines.forEach((line, index) => {
    const r = FIRST_ROW + index;
    const c = line.cost;
    const quantity = SIZE_COLUMNS.reduce((total, size) => total + line.sizes[size], 0);
    const values: CellValue[] = [
      index + 1, line.code, line.productName, line.color,
      ...SIZE_COLUMNS.map((size) => line.sizes[size]),
      line.supplierEquivalence ?? "",
      f(`SUM(E${r}:I${r})`, quantity),
      line.piecesPerGarment,
      line.unitPriceUsd,
      f(`K${r}*M${r}`, c.goodsUsd),
      f(`L${r}*${S}$B$29`, c.customizationPerUnitUsd),
      f(`K${r}*O${r}`, c.customizationUsd),
      f(`${S}$B$12*(N${r}+P${r})/${denominator}`, c.hkShippingUsd),
      f(`${S}$B$13*(N${r}+P${r})/${denominator}`, c.invoiceAdjustmentUsd),
      f(`SUM(N${r},P${r},Q${r},R${r})`, c.paidInvestmentUsd),
      f(`S${r}/K${r}`, c.paidCostPerUnitUsd),
      f(`IF(${S}$B$23="","",${S}$B$23*S${r}/${sumS})`, c.crShippingUsd),
      f(`IF(${S}$B$24="","",${S}$B$24*S${r}/${sumS})`, c.nationalizationCrc),
      f(`IF(${S}$B$25="","",${S}$B$25*S${r}/${sumS})`, c.otherImportCrc),
      f(`IF(${ready},"",(S${r}+U${r})*${S}$B$22+V${r}+W${r}+K${r}*${S}$B$26)`, c.totalInventoryCostCrc),
      f(`IFERROR(X${r}/K${r},"")`, c.costPerUnitCrc),
      line.salePriceCrc,
      f(`IF(Z${r}="","",Z${r}*${S}$B$28)`, c.cardCommissionCrc),
      f(`IF(OR(Y${r}="",AA${r}=""),"",Y${r}+AA${r})`, c.variableCostPerUnitCrc),
      f(`IF(OR(Z${r}="",AB${r}=""),"",Z${r}-AB${r})`, c.contributionPerUnitCrc),
      f(`IFERROR(AC${r}/Z${r},"")`, c.contributionMargin),
      f(`X${r}`, c.totalInventoryCostCrc),
      f(`IF(Z${r}="","",K${r}*Z${r})`, c.expectedSalesCrc),
      f(`IF(AC${r}="","",K${r}*AC${r})`, c.totalContributionCrc),
    ];
    values.forEach((value, column) => {
      sheet.getCell(r, column + 1).value = value;
    });
    sheet.getCell(r, 26).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
    sheet.getCell(r, 30).numFmt = "0.0%";
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `inventario-costeo-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function parseInventoryWorkbook(file: File): Promise<XlsxLine[]> {
  const Workbook = await loadWorkbook();
  const workbook = new Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet("Costeo") ?? workbook.worksheets[0];
  if (!sheet) throw new Error("NO_SHEET");

  const columns = new Map<string, number>();
  let headerRow = 0;
  sheet.eachRow((row, rowNumber) => {
    if (headerRow) return;
    row.eachCell((cell: Cell) => {
      if (normalize(text(cell.value)) === "codigo") headerRow = rowNumber;
    });
  });
  if (!headerRow) throw new Error("NO_HEADER");
  sheet.getRow(headerRow).eachCell((cell: Cell, column: number) => columns.set(normalize(text(cell.value)), column));

  const col = (name: string) => columns.get(name);
  const required = ["codigo", "producto", "color", "precio unitario usd"].filter((name) => !col(name));
  if (required.length) throw new Error(`MISSING_COLUMNS:${required.join(",")}`);

  const valueAt = (row: ReturnType<typeof sheet.getRow>, name: string): CellValue => {
    const index = col(name);
    return index ? row.getCell(index).value : null;
  };

  const lines: XlsxLine[] = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const code = text(valueAt(row, "codigo"));
    if (!code || normalize(code).startsWith("total")) continue;
    const size = (name: string) => numberOf(valueAt(row, name)) ?? 0;
    lines.push({
      code,
      productName: text(valueAt(row, "producto")),
      color: text(valueAt(row, "color")),
      sizes: { S: size("s"), M: size("m"), L: size("l"), XL: size("xl"), OS: size("talla unica") },
      piecesPerGarment: numberOf(valueAt(row, "piezas por prenda")) ?? 1,
      unitPriceUsd: numberOf(valueAt(row, "precio unitario usd")) ?? 0,
      salePriceCrc: numberOf(valueAt(row, "precio de venta crc")),
      supplierEquivalence: text(valueAt(row, "equivalencia proveedor")) || null,
    });
  }
  return lines;
}
