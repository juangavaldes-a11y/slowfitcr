import { catalogTemplate } from "./template";

export type CatalogSize = "S" | "M" | "L" | "XL" | "OS";
export const CATALOG_SIZES: CatalogSize[] = ["S", "M", "L", "XL", "OS"];

export type CatalogColor = { name: string; hex: string; sizes: CatalogSize[]; photos: string[] };

export type CatalogEntry = {
  code: string;
  name: string;
  priceCrc: number | null;
  pieces: number;
  sizes: CatalogSize[];
  colors: CatalogColor[];
};

// public/slowfit/catalog-photos/manifest.json, written by tools/catalog-import/extract_new_catalog.py.
export type PhotoManifest = Record<string, { colors: Array<{ raw: string; label: string; hex: string | null; photos: string[] }> }>;

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
export type CatalogProductImages = { handle: string; images: Array<{ url: string; color?: string | null }> };

const normalizeColorName = (color: string) => color.trim().toLowerCase();

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

type BuildOptions = { includeSoldOut?: boolean; photos?: PhotoManifest };

// Dot colors for products without a designed photo set; the designed manifest carries its own.
const colorHexEs: Record<string, string> = {
  negro: "#1f1e1c", blanco: "#ffffff", gris: "#9a9a9a", "azul marino": "#26395c", azul: "#2f6fc0", "azul oscuro": "#1e264b", celeste: "#a7c7ee",
  cereza: "#a5173d", frambuesa: "#ae1253", "verde militar": "#8da478", verde: "#9db38a", "azul cobalto": "#2d4da2", caqui: "#b5a283",
  "blanco hueso": "#efe9dc", rosa: "#f3b9cf", rojo: "#d4202a", "rojo oscuro": "#7b152d", oliva: "#5f6c41", violeta: "#a48be0", morado: "#7d5ba6",
  "morado oscuro": "#4b3a66", "morado claro": "#bba2e8", uva: "#4e2a57", vino: "#6d1e3d", "azul medianoche": "#1a2448", crema: "#efe6cf",
};

const hexFor = (name: string) => colorHexEs[name.trim().toLowerCase()] ?? catalogTemplate.colors.dotFallback;

// Products are numbered in inventory order over *all* codes so a product keeps its SLW code when it sells out.
export function buildCatalogEntries(lines: InventoryViewLine[], products: CatalogProductImages[], options: BuildOptions = {}): CatalogEntry[] {
  const imagesByHandle = new Map(products.map((product) => [product.handle, product.images]));
  const groups = new Map<string, InventoryViewLine[]>();
  for (const line of lines) groups.set(line.code, [...(groups.get(line.code) ?? []), line]);

  const entries: CatalogEntry[] = [];
  [...groups.values()].forEach((group, index) => {
    const first = group[0];
    const code = formatCatalogCode(index);
    const handle = group.find((line) => line.productHandle)?.productHandle;
    const productImages = (handle && imagesByHandle.get(handle)) || [];
    const designed = options.photos?.[code]?.colors ?? [];
    const designedByRaw = new Map(designed.map((color) => [normalizeColorName(color.raw), color]));
    // The designed photo set only applies when it really belongs to this product (its raw color names match the inventory).
    const useDesigned = group.some((line) => designedByRaw.has(normalizeColorName(line.color)));

    const colors = group
      .map((line): CatalogColor => {
        const tag = normalizeColorName(line.color);
        const match = useDesigned ? designedByRaw.get(tag) : undefined;
        const name = match?.label ?? translateColor(line.color);
        // Fallback photo: the first product image tagged with this color (a photo may list several colors separated by commas).
        const tagged = productImages.find((image) => (image.color ?? "").split(",").map(normalizeColorName).includes(tag));
        return {
          name,
          hex: match?.hex ?? hexFor(name),
          sizes: CATALOG_SIZES.filter((size) => (line.remaining[size] ?? 0) > 0),
          photos: match ? match.photos : useDesigned || !tagged ? [] : [tagged.url],
        };
      })
      .filter((color) => options.includeSoldOut || color.sizes.length);
    if (!colors.length) return;
    entries.push({
      code,
      name: translateProductName(first.productName),
      priceCrc: group.map((line) => line.cost.salePriceCrc).find((price) => price !== null && price !== undefined) ?? null,
      pieces: Math.max(1, first.piecesPerGarment || 1),
      sizes: CATALOG_SIZES.filter((size) => colors.some((color) => color.sizes.includes(size))),
      colors,
    });
  });
  return entries;
}
