import "server-only";
import { getProductByHandle as getCatalogProductByHandle, getProducts, type CatalogProduct } from "./catalog";

export type StorefrontCollection = {
  id: string;
  handle: string;
  title: string;
  description: string;
  image: string;
  products: CatalogProduct[];
};

function toCollectionTitle(handle: string) {
  return handle.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function toCollection(handle: string, products: CatalogProduct[]): StorefrontCollection {
  const title = toCollectionTitle(handle);
  return {
    id: handle,
    handle,
    title,
    description: `Explore Slow Fit ${title.toLowerCase()} styles.`,
    image: products[0]?.image || "/slowfit/hero.jpg",
    products,
  };
}

export async function getCollections(_locale?: string): Promise<StorefrontCollection[]> {
  const products = await getProducts();
  const groups = new Map<string, CatalogProduct[]>();

  for (const product of products) {
    for (const tag of product.tags) {
      const handle = tag.trim().toLowerCase().replace(/\s+/g, "-");
      if (!handle) continue;
      groups.set(handle, [...(groups.get(handle) || []), product]);
    }
  }

  return [...groups.entries()].map(([handle, group]) => toCollection(handle, group));
}

export async function getCollectionByHandle(handle: string, _locale?: string): Promise<StorefrontCollection | null> {
  const collection = (await getCollections()).find((item) => item.handle === handle);
  return collection || null;
}

export async function getProductByHandle(handle: string, _locale?: string) {
  return getCatalogProductByHandle(handle);
}