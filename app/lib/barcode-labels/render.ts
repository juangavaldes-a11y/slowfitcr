import fs from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { code128Modules, encodeCode128 } from "./code128";

export type LabelItem = {
  sku: string;
  name: string;
  size?: string | null;
  color?: string | null;
  price?: number | null;
  copies: number;
};

export type LabelFormat = "thermal" | "a4";

export const MAX_LABELS = 3000;

const MM = 72 / 25.4;
const ASSET_DIR = path.join(process.cwd(), "public", "slowfit", "catalog-template");
const QUIET_MODULES = 10;
const MIN_MODULE_WIDTH = 0.4;
const MAX_MODULE_WIDTH = 1.1;
const INK = rgb(0.1, 0.09, 0.09);

// "thermal" prints one 50 x 25 mm label per page for roll printers. "a4" fills 3 x 7 sheets of 63.5 x 38.1 mm labels.
const FORMATS = {
  thermal: { page: [50 * MM, 25 * MM], label: [50 * MM, 25 * MM], columns: 1, rows: 1, left: 0, top: 0, pitchX: 0, pitchY: 0 },
  a4: {
    page: [210 * MM, 297 * MM], label: [63.5 * MM, 38.1 * MM], columns: 3, rows: 7,
    left: 7.2 * MM, top: 15.1 * MM, pitchX: 66 * MM, pitchY: 38.1 * MM,
  },
} as const;

type Fonts = { regular: PDFFont; medium: PDFFont; currency: PDFFont };

function fitText(text: string, font: PDFFont, size: number, maxWidth: number) {
  let result = text;
  while (result.length > 1 && font.widthOfTextAtSize(result, size) > maxWidth) result = `${result.slice(0, -2).trimEnd()}…`;
  return result;
}

const formatPrice = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function drawCentered(page: PDFPage, text: string, font: PDFFont, size: number, centerX: number, baselineY: number) {
  page.drawText(text, { x: centerX - font.widthOfTextAtSize(text, size) / 2, y: baselineY, size, font, color: INK });
}

function drawLabel(page: PDFPage, fonts: Fonts, item: LabelItem, x: number, top: number, width: number, height: number, pageHeight: number) {
  const pad = Math.min(width, height) * 0.08;
  const centerX = x + width / 2;
  const innerWidth = width - pad * 2;
  const y = (offset: number) => pageHeight - top - offset;

  const nameSize = height * 0.12;
  const detailSize = height * 0.095;
  const skuSize = height * 0.1;
  const sizeLabel = !item.size ? "" : /^(one size|os|[uú]nica)$/i.test(item.size.trim()) ? "Talla única" : `Talla ${item.size}`;
  const detail = [sizeLabel, item.color ?? ""].filter(Boolean).join(" · ");

  drawCentered(page, fitText(item.name, fonts.medium, nameSize, innerWidth), fonts.medium, nameSize, centerX, y(pad + nameSize * 0.85));
  if (detail) {
    drawCentered(page, fitText(detail, fonts.regular, detailSize, innerWidth), fonts.regular, detailSize, centerX, y(pad + nameSize * 1.1 + detailSize));
  }

  const widths = encodeCode128(item.sku);
  const moduleWidth = Math.min(MAX_MODULE_WIDTH, innerWidth / (code128Modules(item.sku) + QUIET_MODULES * 2));
  const barcodeTop = pad + nameSize * 1.1 + detailSize * 1.5;
  const barcodeHeight = height * 0.34;
  let cursor = centerX - (code128Modules(item.sku) * moduleWidth) / 2;
  widths.forEach((barWidth, index) => {
    if (index % 2 === 0) {
      page.drawRectangle({ x: cursor, y: y(barcodeTop + barcodeHeight), width: barWidth * moduleWidth, height: barcodeHeight, color: INK });
    }
    cursor += barWidth * moduleWidth;
  });

  const skuBaseline = barcodeTop + barcodeHeight + skuSize * 1.05;
  drawCentered(page, item.sku, fonts.regular, skuSize, centerX, y(skuBaseline));
  if (item.price !== null && item.price !== undefined) {
    const priceSize = height * 0.13;
    const symbolWidth = fonts.currency.widthOfTextAtSize("₡", priceSize);
    const amount = formatPrice(item.price);
    const total = symbolWidth + fonts.medium.widthOfTextAtSize(amount, priceSize);
    const startX = centerX - total / 2;
    const priceBaseline = y(skuBaseline + priceSize * 1.15);
    page.drawText("₡", { x: startX, y: priceBaseline, size: priceSize, font: fonts.currency, color: INK });
    page.drawText(amount, { x: startX + symbolWidth, y: priceBaseline, size: priceSize, font: fonts.medium, color: INK });
  }
}

export function labelFits(sku: string, format: LabelFormat) {
  const [labelWidth, labelHeight] = FORMATS[format].label;
  const innerWidth = labelWidth - Math.min(labelWidth, labelHeight) * 0.16;
  return innerWidth / (code128Modules(sku) + QUIET_MODULES * 2) >= MIN_MODULE_WIDTH;
}

export async function renderLabelsPdf(items: LabelItem[], format: LabelFormat): Promise<Uint8Array> {
  const spec = FORMATS[format];
  const labels = items.flatMap((item) => Array.from({ length: item.copies }, () => item));
  if (!labels.length) throw new Error("NO_LABELS");
  if (labels.length > MAX_LABELS) throw new Error("TOO_MANY_LABELS");

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle("Etiquetas Slow");
  const read = (name: string) => fs.readFile(path.join(ASSET_DIR, name));
  const [regular, medium, currency] = await Promise.all([read("Poppins-Regular.ttf"), read("Poppins-Medium.ttf"), read("LiberationSerif-Regular.ttf")]);
  const fonts: Fonts = {
    regular: await pdf.embedFont(regular, { subset: true }),
    medium: await pdf.embedFont(medium, { subset: true }),
    currency: await pdf.embedFont(currency, { subset: true }),
  };

  const [pageWidth, pageHeight] = spec.page;
  const [labelWidth, labelHeight] = spec.label;
  const perPage = spec.columns * spec.rows;
  let page: PDFPage | null = null;
  labels.forEach((item, index) => {
    const slot = index % perPage;
    if (slot === 0) page = pdf.addPage([pageWidth, pageHeight]);
    const column = slot % spec.columns;
    const row = Math.floor(slot / spec.columns);
    drawLabel(page!, fonts, item, spec.left + column * spec.pitchX, spec.top + row * spec.pitchY, labelWidth, labelHeight, pageHeight);
  });
  return pdf.save();
}
