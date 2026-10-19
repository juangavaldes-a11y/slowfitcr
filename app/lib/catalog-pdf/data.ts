import { catalogTemplate } from "./template";

export type CatalogSize = "S" | "M" | "L" | "XL" | "OS";
export const CATALOG_SIZES: CatalogSize[] = ["S", "M", "L", "XL", "OS"];

export type CatalogEntry = {
  code: string;
  name: string;
  priceCrc: number | null;
  pieces: number;
  sizes: CatalogSize[];
  colors: Array<{ name: string; sizes: CatalogSize[] }>;
  imageUrls: string[];
};

// Subset of GET /api/admin/inventory and GET /api/admin/catalog/products that the catalog needs.
export type InventoryViewLine = {
  code: string;
  productName: string;
  color: string;
  productHandle: string | null;
  piecesPerGarment: number;
  remaining: Partial<Record<CatalogSize, number>>;
  cost: { salePriceCrc: number | null };
};
export type CatalogProductImages = { handle: string; images: Array<{ url: string }> };

const productNamesEs: Record<string, string> = {
  jackets: "Jacket",
  "bra & pants": "Conjunto top y pantalón",
  shorts: "Short",
  leggings: "Leggings",
  "pants - free size": "Pantalón",
  pants: "Pantalón",
  "long sleeves tops & bell-bottom pants": "Conjunto manga larga y pantalón campana",
  "bra & skirts": "Conjunto top y falda",
  bra: "Top deportivo",
  "leggings - pockets": "Leggings con bolsillos",
  "short sleeves tops (without padding) & pants": "Conjunto top manga corta (sin relleno) y pantalón",
  "bra & shorts (pocket)": "Conjunto top y short con bolsillo",
  "shorts - free size": "Short",
  "one shoulder bra & shorts (pockets)": "Conjunto top de un hombro y short con bolsillos",
  "crop tops": "Crop top",
  top: "Camiseta sin mangas",
  "bra & bell-bottoms pants (pockets)": "Conjunto top y pantalón campana con bolsillos",
};

const colorsEs: Record<string, string> = {
  black: "Negro", white: "Blanco", grey: "Gris", gray: "Gris", navy: "Azul marino", blue: "Azul", "dark blue": "Azul oscuro",
  "sky blue": "Celeste", cherry: "Cereza", raspberry: "Frambuesa", "army green": "Verde militar", green: "Verde",
  "cobalt blue": "Azul cobalto", khaki: "Caqui", "off white": "Blanco hueso", pink: "Rosa", red: "Rojo", "dark red": "Rojo oscuro",
  olive: "Oliva", violet: "Violeta", purple: "Morado", "dark purple": "Morado oscuro", "light purple": "Morado claro",
  grape: "Uva", burgundy: "Vino", wine: "Vino", midnight: "Azul medianoche", cream: "Crema", stripe: "rayas", "polka dot": "lunares",
};

const lookup = (table: Record<string, string>, value: string) => table[value.trim().toLowerCase()];

// Unknown names fall back to the inventory text, so a new product never breaks the export.
export const translateProductName = (name: string) => lookup(productNamesEs, name) ?? name;

export function translateColor(color: string) {
  const parts = color.split("&").map((part) => lookup(colorsEs, part) ?? part.trim());
  if (parts.length === 1) return parts[0];
  return [parts[0], ...parts.slice(1).map((part) => part.charAt(0).toLowerCase() + part.slice(1))].join(" y ");
}

export const formatCatalogCode = (index: number) => `${catalogTemplate.copy.codePrefix}${String(index + 1).padStart(3, "0")}`;

type BuildOptions = { includeSoldOut?: boolean };

// Products are numbered in inventory order over *all* codes so a product keeps its SLW code when it sells out.
export function buildCatalogEntries(lines: InventoryViewLine[], products: CatalogProductImages[], options: BuildOptions = {}): CatalogEntry[] {
  const imagesByHandle = new Map(products.map((product) => [product.handle, product.images.map((image) => image.url)]));
  const groups = new Map<string, InventoryViewLine[]>();
  for (const line of lines) groups.set(line.code, [...(groups.get(line.code) ?? []), line]);

  const entries: CatalogEntry[] = [];
  [...groups.values()].forEach((group, index) => {
    const colors = group
      .map((line) => ({ name: translateColor(line.color), sizes: CATALOG_SIZES.filter((size) => (line.remaining[size] ?? 0) > 0) }))
      .filter((color) => options.includeSoldOut || color.sizes.length);
    if (!colors.length) return;
    const first = group[0];
    const handle = group.find((line) => line.productHandle)?.productHandle;
    entries.push({
      code: formatCatalogCode(index),
      name: translateProductName(first.productName),
      priceCrc: group.map((line) => line.cost.salePriceCrc).find((price) => price !== null && price !== undefined) ?? null,
      pieces: Math.max(1, first.piecesPerGarment || 1),
      sizes: CATALOG_SIZES.filter((size) => colors.some((color) => color.sizes.includes(size))),
      colors,
      imageUrls: (handle && imagesByHandle.get(handle)) || [],
    });
  });
  return entries;
}
