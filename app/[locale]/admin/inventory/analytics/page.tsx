import type { Metadata } from "next";
import { notFound } from "next/navigation";
import InventoryAnalyticsPanel from "../../../../inventory-analytics-panel";
import { isLocale, locales, type Locale } from "../../../../i18n";
import { isModuleEnabled } from "../../../../../packages/core/config";

type InventoryAnalyticsPageProps = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Slow Fit CR | Sales & projections", robots: { index: false, follow: false } };
}

export default async function InventoryAnalyticsPage({ params }: InventoryAnalyticsPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (!isModuleEnabled("admin")) notFound();
  return <InventoryAnalyticsPanel locale={locale as Locale} />;
}
