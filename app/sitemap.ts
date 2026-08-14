import type { MetadataRoute } from "next";
import { locales } from "./i18n";
import { getCollections } from "./lib/shopify";

const staticRoutes = ["", "/shop", "/privacy", "/terms", "/shipping", "/returns"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const dynamicRoutes: string[] = [];

  for (const locale of locales) {
    const collections = await getCollections(locale);

    for (const collection of collections) {
      dynamicRoutes.push(`/${locale}/shop/${collection.handle}`);
      for (const product of collection.products) {
        dynamicRoutes.push(`/${locale}/product/${product.handle}`);
      }
    }
  }

  const uniqueDynamicRoutes = Array.from(new Set(dynamicRoutes));
  const localizedStaticRoutes = locales.flatMap((locale) => staticRoutes.map((route) => `/${locale}${route}`));

  return [...localizedStaticRoutes, ...uniqueDynamicRoutes].map((route) => ({
    url: `https://slowfitcr.com${route}`,
    lastModified,
    changeFrequency: route.includes("/product/") ? "weekly" : "monthly",
    priority: route.endsWith("/es") || route.endsWith("/en") ? 1 : 0.7,
  }));
}