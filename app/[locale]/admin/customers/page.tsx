import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CustomersPanel from "../../../customers-panel";
import { isLocale, locales, type Locale } from "../../../i18n";
import { isModuleEnabled } from "../../../../packages/core/config";

type CustomersAdminPageProps = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Slow Fit CR | Customers", robots: { index: false, follow: false } };
}

export default async function CustomersAdminPage({ params }: CustomersAdminPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (!isModuleEnabled("admin")) notFound();
  return <CustomersPanel locale={locale as Locale} />;
}
