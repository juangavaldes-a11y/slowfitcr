import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminOpsPanel from "../../../admin-ops-panel";
import { isLocale, locales, type Locale } from "../../../i18n";

type AdminOpsPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: AdminOpsPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  return {
    title: "Slow Fit CR | Operations",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function AdminOpsPage({ params }: AdminOpsPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return <AdminOpsPanel locale={locale as Locale} />;
}
