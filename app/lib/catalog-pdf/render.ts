import fs from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { CatalogEntry, CatalogSize } from "./data";
import { fitCatalogImage, loadCatalogImage } from "./images";
import { catalogTemplate as T } from "./template";

const PAGE_W = T.page.width;
const PAGE_H = T.page.height;
const LEFT = T.page.marginX;
const RIGHT = PAGE_W - T.page.marginX;
const ASSET_DIR = path.join(process.cwd(), "public", "slowfit", "catalog-template");

const SIZE_LABEL: Record<CatalogSize, string> = { S: "S", M: "M", L: "L", XL: "XL", OS: "Única" };
const SIZE_RING: Record<CatalogSize, string> = { S: "S", M: "M", L: "L", XL: "XL", OS: "U" };

type Fonts = { light: PDFFont; regular: PDFFont; medium: PDFFont; serif: PDFFont; serifItalic: PDFFont; currency: PDFFont };
type Align = "left" | "center" | "right";
type PageRecord = { page: PDFPage; number: number; footer: boolean };

const color = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
const byName = (name: keyof typeof T.colors) => color(T.colors[name]);

function drawText(page: PDFPage, text: string, o: { x: number; baseline: number; font: PDFFont; size: number; color: string; spacing?: number; align?: Align }) {
  const spacing = o.spacing ?? 0;
  const chars = [...text];
  const width = spacing ? chars.reduce((total, char) => total + o.font.widthOfTextAtSize(char, o.size) + spacing, -spacing) : o.font.widthOfTextAtSize(text, o.size);
  let x = o.align === "right" ? o.x - width : o.align === "center" ? o.x - width / 2 : o.x;
  const y = PAGE_H - o.baseline;
  const paint = { size: o.size, font: o.font, color: color(o.color) };
  if (!spacing) {
    page.drawText(text, { x, y, ...paint });
    return width;
  }
  for (const char of chars) {
    page.drawText(char, { x, y, ...paint });
    x += o.font.widthOfTextAtSize(char, o.size) + spacing;
  }
  return width;
}

const rect = (page: PDFPage, x: number, top: number, width: number, height: number, fill: string) =>
  page.drawRectangle({ x, y: PAGE_H - top - height, width, height, color: color(fill) });

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  return current ? [...lines, current] : lines.length ? lines : [""];
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number) {
  let fitted = size;
  while (fitted > 6.5 && font.widthOfTextAtSize(text, fitted) > maxWidth) fitted -= 0.25;
  let result = text;
  while (result.length > 1 && font.widthOfTextAtSize(result, fitted) > maxWidth) result = `${result.slice(0, -2).trimEnd()}…`;
  return { text: result, size: fitted };
}

const formatPrice = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

// Colón sign + amount, e.g. "₡18.950"; returns the drawn width.
function drawPrice(page: PDFPage, fonts: Fonts, value: number, o: { x: number; baseline: number; size: number; align?: Align }) {
  const amount = formatPrice(value);
  const symbolWidth = fonts.currency.widthOfTextAtSize("₡", o.size);
  const width = symbolWidth + fonts.serif.widthOfTextAtSize(amount, o.size);
  const x = o.align === "right" ? o.x - width : o.x;
  drawText(page, "₡", { x, baseline: o.baseline, font: fonts.currency, size: o.size, color: T.colors.ink });
  drawText(page, amount, { x: x + symbolWidth, baseline: o.baseline, font: fonts.serif, size: o.size, color: T.colors.ink });
  return width;
}

async function loadAssets(pdf: PDFDocument) {
  const read = (name: string) => fs.readFile(path.join(ASSET_DIR, name));
  const [light, regular, medium, serif, serifItalic, currency, logoWhite, logoDark] = await Promise.all([
    read("Poppins-Light.ttf"), read("Poppins-Regular.ttf"), read("Poppins-Medium.ttf"), read("Lora.ttf"), read("Lora-Italic.ttf"), read("LiberationSerif-Regular.ttf"),
    read("logo-white.png"), read("logo-dark.png"),
  ]);
  const embed = (bytes: Buffer) => pdf.embedFont(bytes, { subset: true });
  const fonts: Fonts = {
    light: await embed(light), regular: await embed(regular), medium: await embed(medium),
    serif: await embed(serif), serifItalic: await embed(serifItalic), currency: await embed(currency),
  };
  return { fonts, logoWhite: await pdf.embedPng(logoWhite), logoDark: await pdf.embedPng(logoDark) };
}

type Assets = Awaited<ReturnType<typeof loadAssets>>;

function wavePath(points: ReadonlyArray<ReadonlyArray<number>>, mapY: (y: number) => number) {
  const [[startX, startY], ...curves] = points;
  const curve = (c: ReadonlyArray<number>) => `C${c[0]} ${mapY(c[1])} ${c[2]} ${mapY(c[3])} ${c[4]} ${mapY(c[5])}`;
  const bottom = mapY(PAGE_H + 0.3);
  return `M${startX} ${mapY(startY)} ${curves.map(curve).join(" ")} L${PAGE_W} ${bottom} L0 ${bottom} Z`;
}

function drawWaves(page: PDFPage, mapY: (y: number) => number) {
  for (const wave of T.cover.waves) page.drawSvgPath(wavePath(wave.points, mapY), { x: 0, y: PAGE_H, color: byName(wave.color) });
}

function drawCover(page: PDFPage, { fonts, logoWhite }: Assets) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: byName("cover") });
  const c = T.cover;
  drawText(page, T.copy.coverLabel, { x: PAGE_W / 2, baseline: c.labelBaseline, font: fonts.light, size: c.labelSize, color: T.colors.coverText, spacing: c.labelSpacing, align: "center" });
  const logoHeight = (c.logo.width * logoWhite.height) / logoWhite.width;
  page.drawImage(logoWhite, { x: (PAGE_W - c.logo.width) / 2, y: PAGE_H - c.logo.y - logoHeight, width: c.logo.width, height: logoHeight });
  drawText(page, T.copy.tagline, { x: PAGE_W / 2, baseline: c.taglineBaseline, font: fonts.serifItalic, size: c.taglineSize, color: T.colors.coverText, align: "center" });
  drawWaves(page, (y) => y);
  drawText(page, T.copy.brandUrl, { x: PAGE_W / 2, baseline: c.urlBaseline, font: fonts.light, size: c.urlSize, color: T.colors.white, spacing: c.urlSpacing, align: "center" });
}

function drawClosing(page: PDFPage, { fonts, logoWhite }: Assets) {
  const c = T.closing;
  const top = PAGE_H - c.height;
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: c.height, color: byName("cover") });
  const logoHeight = (c.logoWidth * logoWhite.height) / logoWhite.width;
  page.drawImage(logoWhite, { x: (PAGE_W - c.logoWidth) / 2, y: PAGE_H - top - c.logoTop - logoHeight, width: c.logoWidth, height: logoHeight });
  drawText(page, T.copy.tagline, { x: PAGE_W / 2, baseline: top + c.taglineBaseline, font: fonts.serifItalic, size: T.cover.taglineSize, color: T.colors.coverText, align: "center" });
  drawWaves(page, (y) => PAGE_H + 0.3 - (PAGE_H + 0.3 - y) * c.waveScale);
  drawText(page, T.copy.brandUrl, { x: PAGE_W / 2, baseline: top + c.urlBaseline, font: fonts.light, size: T.cover.urlSize, color: T.colors.white, spacing: T.cover.urlSpacing, align: "center" });
}

function newContentPage(pdf: PDFDocument, pages: PageRecord[], assets: Assets) {
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  pages.push({ page, number: pages.length + 2, footer: true });
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: byName("page") });
  const h = T.header;
  const logo = assets.logoDark;
  const logoHeight = (h.logoWidth * logo.height) / logo.width;
  page.drawImage(logo, { x: h.logoX, y: PAGE_H - h.logoY - logoHeight, width: h.logoWidth, height: logoHeight });
  drawText(page, T.copy.headerLabel, { x: RIGHT, baseline: h.labelBaseline, font: assets.fonts.light, size: h.labelSize, color: T.colors.muted, spacing: h.labelSpacing, align: "right" });
  rect(page, LEFT, h.ruleY, RIGHT - LEFT, h.ruleHeight, T.colors.headerRule);
  return page;
}

function drawFooter(record: PageRecord, fonts: Fonts) {
  const f = T.footer;
  drawText(record.page, T.copy.brandUrl, { x: LEFT, baseline: f.baseline, font: fonts.light, size: f.size, color: T.colors.muted, spacing: f.spacing });
  drawText(record.page, String(record.number), { x: RIGHT, baseline: f.baseline, font: fonts.light, size: f.size, color: T.colors.muted, align: "right" });
}

// ---- index -------------------------------------------------------------------------------------------------------

type IndexRow = { entry: CatalogEntry; lines: string[]; height: number };

function drawIndex(pdf: PDFDocument, pages: PageRecord[], assets: Assets, entries: CatalogEntry[]) {
  const { fonts } = assets;
  const ix = T.index;
  const rows: IndexRow[] = entries.map((entry) => {
    const lines = wrap(entry.name, fonts.light, ix.nameSize, ix.nameWrapWidth);
    return { entry, lines, height: ix.rowPadding + lines.length * ix.lineHeight };
  });

  // Fill column by column, page by page; the last page is rebalanced so its two columns end at about the same height.
  const pageColumns: IndexRow[][][] = [];
  let startTop: number = ix.firstRowTop;
  let columns: IndexRow[][] = [[]];
  let used = 0;
  for (const row of rows) {
    if (used + row.height > ix.bottomLimit - startTop) {
      if (columns.length < ix.columns.length) {
        columns.push([]);
      } else {
        pageColumns.push(columns);
        columns = [[]];
        startTop = ix.continuationRowTop;
      }
      used = 0;
    }
    columns[columns.length - 1].push(row);
    used += row.height;
  }
  const last = columns.flat();
  const left = last.slice(0, Math.ceil(last.length / 2));
  pageColumns.push(left.length === last.length ? [left] : [left, last.slice(left.length)]);

  pageColumns.forEach((cols, pageIndex) => {
    const page = newContentPage(pdf, pages, assets);
    const firstTop = pageIndex === 0 ? ix.firstRowTop : ix.continuationRowTop;
    if (pageIndex === 0) {
      drawText(page, T.copy.indexTitle, { x: LEFT, baseline: ix.titleBaseline, font: fonts.serif, size: ix.titleSize, color: T.colors.ink });
      drawText(page, T.copy.indexSubtitle, { x: LEFT, baseline: ix.subtitleBaseline, font: fonts.light, size: ix.subtitleSize, color: T.colors.muted });
    }
    cols.forEach((column, columnIndex) => {
      const { x, width } = ix.columns[columnIndex];
      let top = firstTop;
      for (const row of column) {
        const baseline = top + ix.rowBaseline;
        drawText(page, row.entry.code, { x, baseline, font: fonts.medium, size: ix.codeSize, color: T.colors.accent, spacing: ix.codeSpacing });
        row.lines.forEach((line, lineIndex) => drawText(page, line, { x: x + ix.nameX, baseline: baseline + lineIndex * ix.wrapLineHeight, font: fonts.light, size: ix.nameSize, color: T.colors.ink }));
        if (row.entry.priceCrc !== null) drawPrice(page, fonts, row.entry.priceCrc, { x: x + width, baseline, size: ix.priceSize, align: "right" });
        top += row.height;
        rect(page, x, top, width, 0.75, T.colors.rowRule);
      }
    });
  });
}

// ---- product blocks ----------------------------------------------------------------------------------------------

type LoadedEntry = { entry: CatalogEntry; images: Buffer[] };

async function loadEntryImages(entries: CatalogEntry[]): Promise<LoadedEntry[]> {
  const wanted = 1 + T.product.gallery.maxThumbs;
  const result: LoadedEntry[] = [];
  for (let index = 0; index < entries.length; index += 4) {
    const batch = entries.slice(index, index + 4);
    result.push(...(await Promise.all(batch.map(async (entry) => {
      const loaded = await Promise.all(entry.imageUrls.slice(0, wanted).map(loadCatalogImage));
      return { entry, images: loaded.filter((image): image is Buffer => image !== null) };
    }))));
  }
  return result;
}

async function embedFitted(pdf: PDFDocument, bytes: Buffer, width: number, height: number): Promise<PDFImage | null> {
  const fitted = await fitCatalogImage(bytes, width, height);
  return fitted ? pdf.embedJpg(fitted) : null;
}

async function drawProduct(pdf: PDFDocument, page: PDFPage, assets: Assets, { entry, images }: LoadedEntry, top: number, layout: ReturnType<typeof measureProduct>) {
  const { fonts } = assets;
  const p = T.product;
  const gallery = layout.gallery;
  const box = gallery ? p.gallery : p.single;

  rect(page, LEFT, top, box.imageWidth, box.imageHeight, T.colors.imageBackdrop);
  const main = images[0] ? await embedFitted(pdf, images[0], box.imageWidth, box.imageHeight) : null;
  if (main) page.drawImage(main, { x: LEFT, y: PAGE_H - top - box.imageHeight, width: box.imageWidth, height: box.imageHeight });
  if (gallery) {
    for (const [index, bytes] of images.slice(1, 1 + p.gallery.maxThumbs).entries()) {
      const thumbTop = top + 1.2 + index * (p.gallery.thumbHeight + p.gallery.thumbGap);
      rect(page, p.gallery.thumbX, thumbTop, p.gallery.thumbWidth, p.gallery.thumbHeight, T.colors.imageBackdrop);
      const thumb = await embedFitted(pdf, bytes, p.gallery.thumbWidth, p.gallery.thumbHeight);
      if (thumb) page.drawImage(thumb, { x: p.gallery.thumbX, y: PAGE_H - thumbTop - p.gallery.thumbHeight, width: p.gallery.thumbWidth, height: p.gallery.thumbHeight });
    }
  }

  const x = box.infoX;
  const o = p.offsets;
  const y0 = top + (layout.height - layout.infoHeight) / 2;
  const extraTitle = (layout.titleLines.length - 1) * p.titleLineHeight;
  const setShift = entry.pieces > 1 ? o.setExtra : 0;

  drawText(page, entry.code, { x, baseline: y0 + o.codeBaseline, font: fonts.medium, size: p.codeSize, color: T.colors.accent, spacing: p.codeSpacing });
  layout.titleLines.forEach((line, index) => drawText(page, line, { x, baseline: y0 + o.titleBaseline + index * p.titleLineHeight, font: fonts.serif, size: p.titleSize, color: T.colors.ink }));
  if (entry.pieces > 1) drawText(page, `Conjunto de ${entry.pieces} piezas`, { x, baseline: y0 + o.subtitleBaseline + extraTitle, font: fonts.light, size: p.subtitleSize, color: T.colors.muted });

  const priceBaseline = y0 + o.priceBaseline + extraTitle + setShift;
  if (entry.priceCrc !== null) {
    const width = drawPrice(page, fonts, entry.priceCrc, { x, baseline: priceBaseline, size: p.priceSize });
    if (entry.pieces > 1) drawText(page, T.copy.setSuffix, { x: x + width + 3, baseline: priceBaseline, font: fonts.light, size: 7.5, color: T.colors.muted });
  } else {
    drawText(page, T.copy.noPrice, { x, baseline: priceBaseline, font: fonts.light, size: p.subtitleSize, color: T.colors.muted });
  }

  const sizesText = entry.sizes.length === 1 && entry.sizes[0] === "OS" ? T.copy.singleSizeLabel : `${T.copy.sizesLabel}${entry.sizes.map((size) => SIZE_LABEL[size]).join(", ")}`;
  drawText(page, sizesText, { x, baseline: y0 + o.sizesBaseline + extraTitle + setShift, font: fonts.light, size: p.sizesSize, color: T.colors.body });

  const headRule = y0 + o.headRule + extraTitle + setShift;
  const columnWidth = (gallery ? p.sizeColumnWidth.gallery : p.sizeColumnWidth.single)[Math.min(entry.sizes.length, 5) - 1];
  const tableRight = p.infoRight;
  const labelWidth = tableRight - x - columnWidth * entry.sizes.length;
  const centerOf = (index: number) => x + labelWidth + columnWidth * index + columnWidth / 2;

  drawText(page, T.copy.colorColumn, { x, baseline: headRule - 7.7, font: fonts.regular, size: p.headSize, color: T.colors.muted });
  entry.sizes.forEach((size, index) => drawText(page, SIZE_LABEL[size], { x: centerOf(index), baseline: headRule - 7.7, font: fonts.regular, size: p.headSize, color: T.colors.muted, align: "center" }));
  rect(page, x, headRule, tableRight - x, 0.7, T.colors.headRule);

  entry.colors.forEach((row, rowIndex) => {
    const ruleAbove = headRule + 0.7 + rowIndex * p.rowHeight;
    const fitted = fitText(row.name, fonts.light, p.rowSize, labelWidth - 8);
    drawText(page, fitted.text, { x, baseline: ruleAbove + 15, font: fonts.light, size: fitted.size, color: T.colors.ink });
    entry.sizes.forEach((size, index) => {
      const cx = centerOf(index);
      if (row.sizes.includes(size)) {
        page.drawCircle({ x: cx, y: PAGE_H - (ruleAbove + 12), size: p.ringDiameter / 2, borderColor: byName("sizeRing"), borderWidth: 0.75 });
        drawText(page, SIZE_RING[size], { x: cx, baseline: ruleAbove + 13.9, font: fonts.regular, size: p.ringSize, color: T.colors.ink, align: "center" });
      } else {
        drawText(page, "–", { x: cx, baseline: ruleAbove + 15, font: fonts.light, size: p.rowSize, color: T.colors.sizeMissing, align: "center" });
      }
    });
    rect(page, x, ruleAbove + p.rowHeight, tableRight - x, 0.75, T.colors.rowRule);
  });
}

function measureProduct(fonts: Fonts, { entry, images }: LoadedEntry) {
  const p = T.product;
  const gallery = images.length > 1;
  const box = gallery ? p.gallery : p.single;
  const titleLines = wrap(entry.name, fonts.serif, p.titleSize, p.infoRight - box.infoX);
  const infoHeight = p.offsets.headRule + (titleLines.length - 1) * p.titleLineHeight + (entry.pieces > 1 ? p.offsets.setExtra : 0) + entry.colors.length * p.rowHeight + 0.7;
  return { gallery, titleLines, infoHeight, height: Math.max(box.imageHeight, infoHeight) };
}

// ---- entry point -------------------------------------------------------------------------------------------------

export async function renderCatalogPdf(entries: CatalogEntry[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle("Catálogo Slow");
  pdf.setAuthor("Slow");
  const assets = await loadAssets(pdf);
  const pages: PageRecord[] = [];

  drawCover(pdf.addPage([PAGE_W, PAGE_H]), assets);
  if (entries.length) drawIndex(pdf, pages, assets, entries);

  const p = T.product;
  const loaded = await loadEntryImages(entries);
  let page: PDFPage | null = null;
  let bottom = 0;
  for (const item of loaded) {
    const layout = measureProduct(assets.fonts, item);
    let top = bottom + p.blockGap;
    if (!page || top + layout.height > p.bodyBottom) {
      page = newContentPage(pdf, pages, assets);
      top = p.bodyTop;
    } else {
      rect(page, LEFT, bottom + p.dividerOffset, RIGHT - LEFT, p.dividerHeight, T.colors.headerRule);
    }
    await drawProduct(pdf, page, assets, item, top, layout);
    bottom = top + layout.height;
  }

  const closingTop = PAGE_H - T.closing.height;
  if (!page || bottom + T.closing.minGapAbove > closingTop) {
    page = newContentPage(pdf, pages, assets);
  }
  pages[pages.length - 1].footer = false;
  drawClosing(page, assets);
  for (const record of pages) if (record.footer) drawFooter(record, assets.fonts);

  return pdf.save();
}
