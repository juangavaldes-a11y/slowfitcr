export type PdfSize = "S" | "M" | "L" | "XL" | "OS";

export type PdfInvoiceLine = {
  code: string;
  productName: string;
  color: string;
  sizes: Record<PdfSize, number>;
  unitPriceUsd: number;
};

export type PdfTextItem = { str: string; x: number; y: number; width?: number };

type Column = "number" | "code" | "color" | "qty" | "price" | "other";

// Header cells of the invoice table. "other" cells hold no data, but they claim their area so stray text does not land in a data column.
const HEADER_COLUMNS: Array<[Column, RegExp]> = [
  ["number", /^No\.?:?$/i],
  ["code", /^Product Code$/i],
  ["color", /^Color\/Qty\/Size$/i],
  ["qty", /^Qty$/i],
  ["price", /^Unit Price$/i],
  ["other", /^(Pictures?|Logo Design|Sub_?total)$/i],
];
const REQUIRED_COLUMNS: Column[] = ["code", "color", "qty", "price"];
const HEADER_ROW_RADIUS = 12;
const LEGACY_NUMBER_COLUMN_MAX_X = 60;
const CODE_ROW_RADIUS = 50;
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

// Production notes printed in the description column ("1 logo", "2 logos", "no wash label") are not part of the product name.
const NOTE_PATTERN = /\b\d+\s*logos?\b|\bno\s*wash\s*la[a-z]*\b/gi;

// A line like "Cherry S-1 M-1 L-1 -3" or "Grape M-1" holds the color and its sizes together.
function splitColorAndSizes(line: string): { color: string; sizes: Record<PdfSize, number> } | null {
  const first = line.search(/(?:^|\s)(?:S|M|L|XL)-\d+(?:\s|$)/);
  if (first <= 0) return null;
  const color = line.slice(0, first).trim();
  const sizes = parseSizeLine(line.slice(first).trim());
  return color && sizes ? { color, sizes } : null;
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
  const productName = lines.slice(index).join(" ").replace(NOTE_PATTERN, "").replace(/^-\s*/, "").replace(/\s+/g, " ").trim();
  return { code: code.replace(/\s*-$/, "").trim(), productName };
}

const centerX = (item: PdfTextItem) => item.x + (item.width ?? 0) / 2;

// Suppliers lay the table out differently (extra columns, other widths), so each column is found from its header cell and
// every text belongs to the column whose header is closest to it. Without a recognizable header, fixed positions are used.
function columnFinder(pages: PdfTextItem[][]): (item: PdfTextItem) => Column {
  const legacy = (item: PdfTextItem): Column =>
    item.x < LEGACY_NUMBER_COLUMN_MAX_X ? "number" : item.x < 300 ? "code" : item.x < 420 ? "color" : item.x < 455 ? "qty" : "price";
  for (const page of pages) {
    const anchor = page.find((item) => clean(item.str) === "Product Code");
    if (!anchor) continue;
    const cells: Array<{ column: Column; center: number }> = [];
    for (const item of page) {
      if (Math.abs(item.y - anchor.y) > HEADER_ROW_RADIUS) continue;
      const text = clean(item.str);
      const match = HEADER_COLUMNS.find(([, pattern]) => pattern.test(text));
      if (match) cells.push({ column: match[0], center: centerX(item) });
    }
    if (!REQUIRED_COLUMNS.every((column) => cells.some((cell) => cell.column === column))) return legacy;
    if (!cells.some((cell) => cell.column === "number")) cells.push({ column: "number", center: LEGACY_NUMBER_COLUMN_MAX_X / 3 });
    return (item) => {
      const center = centerX(item);
      return cells.reduce((best, cell) => (Math.abs(cell.center - center) < Math.abs(best.center - center) ? cell : best)).column;
    };
  }
  return legacy;
}

export function parseInvoiceItems(pages: PdfTextItem[][]): PdfInvoiceLine[] {
  const result: PdfInvoiceLine[] = [];
  const columnOf = columnFinder(pages);
  for (const page of pages) {
    let items = page.map((item) => ({ ...item, str: clean(item.str) })).filter((item) => item.str);
    const header = items.find((item) => item.str === "Product Code");
    if (header) items = items.filter((item) => item.y < header.y - 3);
    const footer = items.find((item) => columnOf(item) === "number" && /^Custom/.test(item.str));
    if (footer) items = items.filter((item) => item.y > footer.y + 8);

    const anchors = items.filter((item) => columnOf(item) === "number" && /^\d{1,3}$/.test(item.str));
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
      const codeLines = sorted((item) => columnOf(item) === "code" && nearest(item.y, CODE_ROW_RADIUS) === anchor).map((item) => item.str);
      const colorLines = sorted((item) => columnOf(item) === "color" && nearest(item.y, COLOR_ROW_RADIUS) === anchor).map((item) => item.str);
      const qtyItem = items.find((item) => columnOf(item) === "qty" && /^\d+$/.test(item.str) && Math.abs(item.y - anchor.y) < 4);
      const priceItem = items.find((item) => columnOf(item) === "price" && /^US\$[\d,.]+$/.test(item.str) && Math.abs(item.y - anchor.y) < 4);
      const parsedCode = parseCode(codeLines);
      const { code } = parsedCode;
      // Some rows only carry production notes; the code then stands in for the missing description.
      const productName = parsedCode.productName || code;
      if (!code || !priceItem) throw new Error(`PDF_PARSE:${anchor.str}`);
      const unitPriceUsd = Number(priceItem.str.replace(/[^\d.]/g, ""));

      const byColor = new Map<string, PdfInvoiceLine>();
      let color: string | null = null;
      for (const line of colorLines) {
        if (/^\(.*\)$/.test(line)) continue;
        const sizes: Record<PdfSize, number> | null = color ? parseSizeLine(line) : null;
        if (sizes && color) {
          const entry = byColor.get(color) ?? { code, productName, color, sizes: emptySizes(), unitPriceUsd };
          for (const key of Object.keys(sizes) as PdfSize[]) entry.sizes[key] += sizes[key];
          byColor.set(color, entry);
          continue;
        }
        const inline = splitColorAndSizes(line);
        if (inline) {
          const entry = byColor.get(inline.color) ?? { code, productName, color: inline.color, sizes: emptySizes(), unitPriceUsd };
          for (const key of Object.keys(inline.sizes) as PdfSize[]) entry.sizes[key] += inline.sizes[key];
          byColor.set(inline.color, entry);
          color = inline.color;
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
  return disambiguateCodes(result);
}

// The supplier sometimes reuses one code for different garments (e.g. a jacket and its pants). Inventory lines are keyed
// by code and color, so those get the first word of their description appended: FGB2455-JACKETS, FGB2455-PANTS.
function disambiguateCodes(lines: PdfInvoiceLine[]): PdfInvoiceLine[] {
  const names = new Map<string, Set<string>>();
  for (const line of lines) names.set(line.code, (names.get(line.code) ?? new Set()).add(line.productName));
  return lines.map((line) => {
    if ((names.get(line.code)?.size ?? 0) < 2) return line;
    const word = line.productName.split(/[^A-Za-z0-9]+/).find(Boolean)?.toUpperCase();
    return word ? { ...line, code: `${line.code}-${word}` } : line;
  });
}

export async function parseInvoicePdf(file: File): Promise<PdfInvoiceLine[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: PdfTextItem[][] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const content = await (await document.getPage(number)).getTextContent();
    pages.push(content.items.flatMap((item) => ("str" in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width }] : [])));
  }
  const lines = parseInvoiceItems(pages);
  if (!lines.length) throw new Error("PDF_EMPTY");
  return lines;
}
