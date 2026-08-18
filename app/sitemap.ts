import type { MetadataRoute } from "next";
import { locales } from "./i18n";
import { getCollections } from "./lib/shopify";

const staticRoutes = ["", "/shop", "/privacy", "/terms", "/shipping", "/returns"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  return [...localizedStaticRoutes, ...uniqueDynamicRoutes].map((route) => {
    const localizedPath = route.replace(/^\/(es|en)/, "");

    return {
      url: `https://slowfitcr.com${route}`,
      changeFrequency: route.includes("/product/") ? "weekly" : "monthly",
      priority: route === "/es" || route === "/en" ? 1 : 0.7,
      alternates: {
        languages: {
          "es-CR": `https://slowfitcr.com/es${localizedPath}`,
          en: `https://slowfitcr.com/en${localizedPath}`,
          "x-default": `https://slowfitcr.com/es${localizedPath}`,
        },
      },
    };
  });
}