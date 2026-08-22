import "server-only";

export type CatalogVariant = {
  id: string;
  title: string;
  sku?: string | null;
  price: number;
  compareAtPrice?: number | null;
  inventoryQuantity: number;
  currencyCode: string;
  availableForSale: boolean;
  preorder: boolean;
};

export type CatalogProduct = {
  id: string;
  handle: string;
  title: string;
  description: string;
  status: "ACTIVE";
  published: boolean;
  preorderEnabled: boolean;
  currencyCode: string;
  tags: string[];
  images: Array<{ id: string; url: string; altText: string }>;
  variants: CatalogVariant[];
  image: string;
  price: number;
  compareAtPrice?: number;
  collectionTitle: string;
};

type CatalogApiProduct = Omit<CatalogProduct, "image" | "price" | "compareAtPrice" | "collectionTitle">;

function backendOrigin() {
  return process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
}

function normalizeProduct(product: CatalogApiProduct): CatalogProduct {
  const sortedVariants = [...product.variants].sort((left, right) => left.price - right.price);
  const lowest = sortedVariants[0];
  return {
    ...product,
    image: product.images[0]?.url || "/slowfit/hero.jpg",
    price: lowest?.price || 0,
    compareAtPrice: lowest?.compareAtPrice && lowest.compareAtPrice > lowest.price ? lowest.compareAtPrice : undefined,
    collectionTitle: product.tags[0] || "Slow Fit",
  };
}

async function catalogFetch<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(new URL(path, backendOrigin()), { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

export async function getProducts(): Promise<CatalogProduct[]> {
  const payload = await catalogFetch<{ products: CatalogApiProduct[] }>(
    "/api/catalog/products?pageSize=100",
  );
  return payload?.products.map(normalizeProduct) || [];
}

export async function getProductByHandle(handle: string): Promise<CatalogProduct | null> {
  const payload = await catalogFetch<{ product: CatalogApiProduct }>(
    `/api/catalog/products/${encodeURIComponent(handle)}`,
  );
  return payload?.product ? normalizeProduct(payload.product) : null;
}

export async function getAllProductHandles(): Promise<string[]> {
  return (await getProducts()).map((product) => product.handle);
}