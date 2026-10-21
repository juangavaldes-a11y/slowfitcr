import fs from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { CatalogColor, CatalogEntry, CatalogSize } from "./data";
import { fitCatalogImage, loadCatalogImage } from "./images";
import { catalogTemplate as T } from "./template";

const PAGE_W = T.page.width;
const PAGE_H = T.page.height;
const LEFT = T.page.marginX;
const RIGHT = PAGE_W - T.page.marginX;
const CONTENT_W = RIGHT - LEFT;
const ASSET_DIR = path.join(process.cwd(), "public", "slowfit", "catalog-template");


type Fonts = { light: PDFFont; regular: PDFFont; medium: PDFFont; serif: PDFFont; serifItalic: PDFFont; currency: PDFFont };
type Align = "left" | "center" | "right";

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

function wavePath(points: ReadonlyArray<ReadonlyArray<number>>) {
  const { scaleX: sx, scaleY: sy } = T.cover;
  const [[startX, startY], ...curves] = points;
  const curve = (c: ReadonlyArray<number>) => `C${c[0] * sx} ${c[1] * sy} ${c[2] * sx} ${c[3] * sy} ${c[4] * sx} ${c[5] * sy}`;
  return `M${startX * sx} ${startY * sy} ${curves.map(curve).join(" ")} L${PAGE_W} ${PAGE_H + 1} L0 ${PAGE_H + 1} Z`;
}

// The closing page is the cover without its "Catálogo" label.
function drawCoverPage(page: PDFPage, { fonts, logoWhite }: Assets, label: boolean) {
  const c = T.cover;
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: byName("cover") });
  if (label) drawText(page, T.copy.coverLabel.toUpperCase(), { x: PAGE_W / 2, baseline: c.labelBaseline, font: fonts.light, size: c.labelSize, color: T.colors.coverText, spacing: c.labelSpacing, align: "center" });
  const logoHeight = (c.logo.width * logoWhite.height) / logoWhite.width;
  page.drawImage(logoWhite, { x: (PAGE_W - c.logo.width) / 2, y: PAGE_H - c.logo.y - logoHeight, width: c.logo.width, height: logoHeight });
  drawText(page, T.copy.tagline, { x: PAGE_W / 2, baseline: c.taglineBaseline, font: fonts.serifItalic, size: c.taglineSize, color: T.colors.coverText, align: "center" });
  for (const wave of c.waves) page.drawSvgPath(wavePath(wave.points), { x: 0, y: PAGE_H, color: byName(wave.color) });
  drawText(page, T.copy.brandUrl, { x: PAGE_W / 2, baseline: c.urlBaseline, font: fonts.light, size: c.urlSize, color: T.colors.white, spacing: c.urlSpacing, align: "center" });
}

function newProductPage(pdf: PDFDocument, { logoDark }: Assets) {
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: byName("page") });
  const l = T.logo;
  const height = (l.width * logoDark.height) / logoDark.width;
  page.drawImage(logoDark, { x: l.right - l.width, y: PAGE_H - l.top - height, width: l.width, height });
  return page;
}

// ---- photos ------------------------------------------------------------------------------------------------------

type Photo = PDFImage | null;

const sizesText = (sizes: CatalogSize[]) => (sizes.length === 1 && sizes[0] === "OS" ? T.copy.singleSizeLabel : `${T.copy.sizesLabel}${sizes.join(", ")}`);

async function embedPhoto(pdf: PDFDocument, url: string | undefined, width: number, height: number): Promise<Photo> {
  const bytes = url ? await loadCatalogImage(url) : null;
  const fitted = bytes && (await fitCatalogImage(bytes, width, height));
  return fitted ? pdf.embedJpg(fitted) : null;
}

function drawPhoto(page: PDFPage, photo: Photo, x: number, top: number, width: number, height: number) {
  if (photo) page.drawImage(photo, { x, y: PAGE_H - top - height, width, height });
  else rect(page, x, top, width, height, T.colors.imageBackdrop);
}

// ---- labels ------------------------------------------------------------------------------------------------------

function drawDot(page: PDFPage, hex: string, cx: number, cy: number) {
  page.drawCircle({ x: cx, y: PAGE_H - cy, size: T.product.label.dot / 2, color: color(hex), borderColor: byName("headerRule"), borderWidth: 0.8 });
}

const ringWidth = (size: CatalogSize) => (size === "OS" ? T.product.ring.pillWidth : T.product.ring.diameter);
const ringsRowWidth = (sizes: CatalogSize[]) => sizes.reduce((total, size) => total + ringWidth(size), 0) + Math.max(0, sizes.length - 1) * T.product.ring.gap;

function drawRings(page: PDFPage, fonts: Fonts, sizes: CatalogSize[], available: CatalogSize[], o: { left: number; centerY: number }) {
  const r = T.product.ring;
  let x = o.left;
  for (const size of sizes) {
    const on = available.includes(size);
    const ink = on ? T.colors.ink : T.colors.sizeMissing;
    const border = on ? byName("sizeRing") : byName("sizeMissing");
    const width = ringWidth(size);
    if (size === "OS") {
      const h = r.pillHeight;
      const top = o.centerY - h / 2;
      page.drawSvgPath(`M${x + h / 2} ${top} H${x + width - h / 2} A${h / 2} ${h / 2} 0 0 1 ${x + width - h / 2} ${top + h} H${x + h / 2} A${h / 2} ${h / 2} 0 0 1 ${x + h / 2} ${top} Z`, { x: 0, y: PAGE_H, borderColor: border, borderWidth: 1 });
      drawText(page, "Única", { x: x + width / 2, baseline: o.centerY + 4, font: fonts.regular, size: r.pillSize, color: ink, align: "center" });
    } else {
      page.drawCircle({ x: x + width / 2, y: PAGE_H - o.centerY, size: width / 2, borderColor: border, borderWidth: 1 });
      drawText(page, size, { x: x + width / 2, baseline: o.centerY + 4, font: fonts.regular, size: r.size, color: ink, align: "center" });
    }
    x += width + r.gap;
  }
}

type LabelOptions = { x: number; top: number; width: number; inline: boolean; size?: number };

// Dot + color name, with the size rings on the same line (wide cells) or on the next one (narrow cells).
function drawColorLabel(page: PDFPage, fonts: Fonts, entry: CatalogEntry, c: CatalogColor, o: LabelOptions) {
  const l = T.product.label;
  const size = o.size ?? l.size;
  const baseline = o.top + size * 0.85;
  const textX = o.x + l.dot + l.dotGap;
  const rings = ringsRowWidth(entry.sizes);
  drawDot(page, c.hex, o.x + l.dot / 2, baseline - size * 0.3);
  const room = (o.inline ? o.width - rings - 14 : o.width) - l.dot - l.dotGap;
  const fitted = fitText(c.name, fonts.serif, size, room);
  drawText(page, fitted.text, { x: textX, baseline, font: fonts.serif, size: fitted.size, color: T.colors.ink });
  const centerY = o.inline ? baseline - size * 0.3 : baseline + l.ringRow - 6;
  const left = o.inline ? o.x + o.width - rings : o.x;
  if (c.sizes.length) drawRings(page, fonts, entry.sizes, c.sizes, { left, centerY });
  else drawText(page, T.copy.soldOut.toUpperCase(), { x: left, baseline: centerY + 4, font: fonts.regular, size: 11, color: T.colors.sizeRing, spacing: 1.4 });
}

// ---- product page ------------------------------------------------------------------------------------------------

type HeaderOptions = { x: number; maxWidth: number; titleSizes: readonly number[]; codeBaseline: number };

// Returns the price baseline, which is where the content below starts.
function drawHeader(page: PDFPage, fonts: Fonts, entry: CatalogEntry, o: HeaderOptions) {
  const p = T.product;
  drawText(page, entry.code, { x: o.x, baseline: o.codeBaseline, font: fonts.medium, size: p.codeSize, color: T.colors.accent, spacing: p.codeSpacing });
  const single = o.titleSizes.find((size) => fonts.serif.widthOfTextAtSize(entry.name, size) <= o.maxWidth);
  const size = single ?? o.titleSizes[o.titleSizes.length - 1];
  const lines = single ? [entry.name] : wrap(entry.name, fonts.serif, size, o.maxWidth);
  const lineHeight = p.titleLineHeight * (size / p.titleSizes[0] + 0.2);
  let baseline = o.codeBaseline + (p.titleBaseline - p.codeBaseline);
  lines.forEach((line, index) => drawText(page, line, { x: o.x, baseline: baseline + index * lineHeight, font: fonts.serif, size, color: T.colors.ink }));
  baseline += (lines.length - 1) * lineHeight;
  if (entry.pieces > 1) {
    baseline += 32;
    drawText(page, T.copy.setLabel(entry.pieces), { x: o.x, baseline, font: fonts.light, size: p.subtitleSize, color: T.colors.muted });
    baseline += 44;
  } else {
    baseline += 62;
  }
  if (entry.priceCrc === null) {
    drawText(page, T.copy.noPrice, { x: o.x, baseline, font: fonts.light, size: 20, color: T.colors.muted });
  } else {
    const width = drawPrice(page, fonts, entry.priceCrc, { x: o.x, baseline, size: p.priceSize });
    if (entry.pieces > 1) drawText(page, T.copy.setSuffix, { x: o.x + width + 8, baseline, font: fonts.light, size: p.priceSuffixSize, color: T.colors.muted });
  }
  return baseline;
}

function footerSizes(entry: CatalogEntry, colors: CatalogColor[]) {
  const sets = new Set(colors.map((c) => c.sizes.join(",")));
  if (sets.size !== 1) return T.copy.sizesPerColor;
  return sizesText(colors[0].sizes.length ? colors[0].sizes : entry.sizes);
}

function drawFooter(page: PDFPage, fonts: Fonts, o: { left: number; right: number | null; text: string }) {
  const f = T.footer;
  drawText(page, T.copy.brandUrl, { x: o.left, baseline: f.baseline, font: fonts.light, size: f.size, color: T.colors.muted, spacing: f.spacing });
  if (o.right !== null) drawText(page, o.text, { x: o.right, baseline: f.baseline, font: fonts.light, size: f.size, color: T.colors.muted, spacing: f.spacing, align: "right" });
}

// One page per product. Colors without a photo are left out unless none has one (then every color gets a backdrop tile).
async function drawProductPage(pdf: PDFDocument, assets: Assets, entry: CatalogEntry) {
  const { fonts } = assets;
  const p = T.product;
  const shown = entry.colors.some((c) => c.photos.length) ? entry.colors.filter((c) => c.photos.length) : entry.colors;
  const perColor = Math.min(3, Math.max(1, ...shown.map((c) => c.photos.length)));
  const page = newProductPage(pdf, assets);

  if (shown.length === 1 && perColor === 1) {
    const h = p.hero;
    drawPhoto(page, await embedPhoto(pdf, shown[0].photos[0], h.width, h.height), h.x, h.y, h.width, h.height);
    const baseline = drawHeader(page, fonts, entry, { x: h.infoX, maxWidth: h.infoWidth, titleSizes: [40], codeBaseline: 560 });
    drawColorLabel(page, fonts, entry, shown[0], { x: h.infoX, top: baseline + 22, width: h.infoWidth, inline: false, size: 28 });
    drawFooter(page, fonts, { left: h.infoX, right: null, text: "" });
    return;
  }

  const priceBaseline = drawHeader(page, fonts, entry, { x: LEFT, maxWidth: p.titleMaxWidth, titleSizes: p.titleSizes, codeBaseline: p.codeBaseline });
  const top = priceBaseline + 36;
  const available = p.bodyBottom - top;

  // Few colors with several photos each: photos in rows on the left, one label per row on the right.
  if (perColor >= 2 && shown.length <= 3) {
    const photoW = (p.side.photosWidth - (perColor - 1) * p.photoGap) / perColor;
    const rowH = Math.min((available - (shown.length - 1) * p.side.rowGap) / shown.length, photoW * (perColor === 2 ? p.side.maxRatioPair : p.side.maxRatioTriple));
    for (const [row, color] of shown.entries()) {
      const y = top + row * (rowH + p.side.rowGap);
      for (let i = 0; i < perColor; i++) {
        drawPhoto(page, await embedPhoto(pdf, color.photos[i], photoW, rowH), LEFT + i * (photoW + p.photoGap), y, photoW, rowH);
      }
      drawColorLabel(page, fonts, entry, color, { x: p.side.labelX, top: y + rowH / 2 - p.side.labelSize, width: RIGHT - p.side.labelX, inline: false, size: p.side.labelSize });
    }
    drawFooter(page, fonts, { left: LEFT, right: RIGHT, text: footerSizes(entry, shown) });
    return;
  }

  // Grid of color cells; each cell holds that color's photos side by side. Sets are shown full-length, so they get one narrow column per color.
  const count = shown.length;
  const cols = count <= 3 ? count : count === 4 && perColor === 1 && entry.pieces > 1 ? 4 : count === 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const cellW = (CONTENT_W - (cols - 1) * p.tilesGap) / cols;
  const inline = cellW >= 400;
  const labelH = inline ? p.label.inlineHeight : p.label.stackedHeight;
  const maxRatio = cols <= 2 ? p.maxRatio.two : cols === 3 ? p.maxRatio.three : p.maxRatio.four;
  const tileH = Math.min((available - rows * labelH - (rows - 1) * p.rowGap) / rows, cellW * maxRatio);
  for (const [i, color] of shown.entries()) {
    const x = LEFT + (i % cols) * (cellW + p.tilesGap);
    const y = top + Math.floor(i / cols) * (tileH + labelH + p.rowGap);
    const k = Math.max(1, Math.min(perColor, color.photos.length));
    const photoW = (cellW - (k - 1) * p.photoGap) / k;
    for (let n = 0; n < k; n++) {
      drawPhoto(page, await embedPhoto(pdf, color.photos[n], photoW, tileH), x + n * (photoW + p.photoGap), y, photoW, tileH);
    }
    drawColorLabel(page, fonts, entry, color, { x, top: y + tileH + 14, width: cellW, inline });
  }
  drawFooter(page, fonts, { left: LEFT, right: RIGHT, text: footerSizes(entry, shown) });
}

// ---- entry point -------------------------------------------------------------------------------------------------

export async function renderCatalogPdf(entries: CatalogEntry[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle("Catálogo Slow");
  pdf.setAuthor("Slow");
  const assets = await loadAssets(pdf);

  drawCoverPage(pdf.addPage([PAGE_W, PAGE_H]), assets, true);
  for (const entry of entries) await drawProductPage(pdf, assets, entry);
  drawCoverPage(pdf.addPage([PAGE_W, PAGE_H]), assets, false);

  return pdf.save();
}
