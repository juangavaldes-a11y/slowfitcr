import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CatalogAdminPanel from "../../../catalog-admin-panel";
import { isLocale, locales, type Locale } from "../../../i18n";

type CatalogAdminPageProps = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Slow Fit CR | Catalog", robots: { index: false, follow: false } };
}

export default async function CatalogAdminPage({ params }: CatalogAdminPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <CatalogAdminPanel locale={locale as Locale} />;
}