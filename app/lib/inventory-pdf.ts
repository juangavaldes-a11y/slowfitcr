export type PdfSize = "S" | "M" | "L" | "XL" | "OS";

export type PdfInvoiceLine = {
  code: string;
  productName: string;
  color: string;
  sizes: Record<PdfSize, number>;
  unitPriceUsd: number;
};

export type PdfTextItem = { str: string; x: number; y: number };

const CODE_COLUMN_MAX_X = 300;
const COLOR_COLUMN_MAX_X = 420;
const QTY_COLUMN_MAX_X = 455;
const NUMBER_COLUMN_MAX_X = 60;
const CODE_ROW_RADIUS = 30;
const COLOR_ROW_RADIUS = 80;
const SIZE_NAMES = new Set(["S", "M", "L", "XL"]);

const emptySizes = (): Record<PdfSize, number> => ({ S: 0, M: 0, L: 0, XL: 0, OS: 0 });
const clean = (value: string) => value.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();

// Supports "1S-2M-1L" and "M-1 L-1 -2" (the trailing "-2" is the color subtotal).
function parseSizeLine(line: string): Record<PdfSize, number> | null {
  const sizes = emptySizes();
  const numberFirst = line.split("-").map((token) => token.trim().match(/^(\d+)(S|M|L|XL)$/));
  if (numberFirst.every(Boolean)) {
    for (const match of numberFirst) sizes[match![2] as PdfSize] += Number(match![1]);
    return sizes;
  }
  let found = false;
  for (const token of line.split(/\s+/)) {
    const match = token.match(/^(S|M|L|XL)-(\d+)$/);
    if (match && SIZE_NAMES.has(match[1])) {
      sizes[match[1] as PdfSize] += Number(match[2]);
      found = true;
    } else if (!/^-\d+$/.test(token)) {
      return null;
    }
  }
  return found ? sizes : null;
}

function parseCode(lines: string[]) {
  const codeLine = /^[A-Z0-9+]+(?:-[A-Z0-9+]*)*(?: -)?$/;
  let code = "";
  let index = 0;
  while (index < lines.length && codeLine.test(lines[index])) {
    code += lines[index];
    index += 1;
    if (code.endsWith(" -")) break;
  }
  const productName = lines.slice(index).join(" ").replace(/^-\s*/, "").trim();
  return { code: code.replace(/\s*-$/, "").trim(), productName };
}

export function parseInvoiceItems(pages: PdfTextItem[][]): PdfInvoiceLine[] {
  const result: PdfInvoiceLine[] = [];
  for (const page of pages) {
    let items = page.map((item) => ({ ...item, str: clean(item.str) })).filter((item) => item.str);
    const header = items.find((item) => item.str === "Product Code");
    if (header) items = items.filter((item) => item.y < header.y - 3);
    const footer = items.find((item) => item.x < NUMBER_COLUMN_MAX_X && /^Custom/.test(item.str));
    if (footer) items = items.filter((item) => item.y > footer.y + 8);

    const anchors = items.filter((item) => item.x < NUMBER_COLUMN_MAX_X && /^\d{1,3}$/.test(item.str));
    const nearest = (y: number, radius: number) => {
      let best: (typeof anchors)[number] | null = null;
      for (const anchor of anchors) {
        if (Math.abs(anchor.y - y) <= radius && (!best || Math.abs(anchor.y - y) < Math.abs(best.y - y))) best = anchor;
      }
      return best;
    };

    for (const anchor of anchors) {
      const sorted = (filter: (item: (typeof items)[number]) => boolean) =>
        items.filter(filter).sort((a, b) => b.y - a.y || a.x - b.x);
      const codeLines = sorted((item) => item.x >= NUMBER_COLUMN_MAX_X && item.x < CODE_COLUMN_MAX_X && nearest(item.y, CODE_ROW_RADIUS) === anchor).map((item) => item.str);
      const colorLines = sorted((item) => item.x >= CODE_COLUMN_MAX_X && item.x < COLOR_COLUMN_MAX_X && nearest(item.y, COLOR_ROW_RADIUS) === anchor).map((item) => item.str);
      const qtyItem = items.find((item) => item.x >= COLOR_COLUMN_MAX_X && item.x < QTY_COLUMN_MAX_X && /^\d+$/.test(item.str) && Math.abs(item.y - anchor.y) < 4);
      const priceItem = items.find((item) => item.x >= QTY_COLUMN_MAX_X && /^US\$[\d,.]+$/.test(item.str) && Math.abs(item.y - anchor.y) < 4);
      const { code, productName } = parseCode(codeLines);
      if (!code || !priceItem) throw new Error(`PDF_PARSE:${anchor.str}`);
      const unitPriceUsd = Number(priceItem.str.replace(/[^\d.]/g, ""));

      const byColor = new Map<string, PdfInvoiceLine>();
      let color: string | null = null;
      for (const line of colorLines) {
        if (/^\(.*\)$/.test(line)) continue;
        const sizes = color ? parseSizeLine(line) : null;
        if (sizes && color) {
          const entry = byColor.get(color) ?? { code, productName, color, sizes: emptySizes(), unitPriceUsd };
          for (const key of Object.keys(sizes) as PdfSize[]) entry.sizes[key] += sizes[key];
          byColor.set(color, entry);
          continue;
        }
        const oneSize = line.match(/^(.*?)\s*-(\d+)$/);
        if (oneSize) {
          const entry = byColor.get(oneSize[1]) ?? { code, productName, color: oneSize[1], sizes: emptySizes(), unitPriceUsd };
          entry.sizes.OS += Number(oneSize[2]);
          byColor.set(oneSize[1], entry);
          color = null;
          continue;
        }
        color = line;
      }

      const lines = [...byColor.values()];
      const units = lines.reduce((total, line) => total + Object.values(line.sizes).reduce((a, b) => a + b, 0), 0);
      if (!lines.length || (qtyItem && Number(qtyItem.str) !== units)) throw new Error(`PDF_QTY_MISMATCH:${code}`);
      result.push(...lines);
    }
  }
  return result;
}

export async function parseInvoicePdf(file: File): Promise<PdfInvoiceLine[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: PdfTextItem[][] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const content = await (await document.getPage(number)).getTextContent();
    pages.push(content.items.flatMap((item) => ("str" in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5] }] : [])));
  }
  const lines = parseInvoiceItems(pages);
  if (!lines.length) throw new Error("PDF_EMPTY");
  return lines;
}
