import type { Metadata } from "next";
import { notFound } from "next/navigation";
import InventoryAdminPanel from "../../../inventory-admin-panel";
import { isLocale, locales, type Locale } from "../../../i18n";
import { isModuleEnabled } from "../../../../packages/core/config";

type InventoryAdminPageProps = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Slow Fit CR | Inventory", robots: { index: false, follow: false } };
}

export default async function InventoryAdminPage({ params }: InventoryAdminPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (!isModuleEnabled("admin")) notFound();
  return <InventoryAdminPanel locale={locale as Locale} />;
}
