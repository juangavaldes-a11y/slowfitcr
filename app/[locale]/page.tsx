import { notFound } from "next/navigation";
import HomePage from "../home-page";
import { getCopy, isLocale, locales, type Locale } from "../i18n";

type LocalePageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocalePage({ params }: LocalePageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return <HomePage copy={getCopy(locale as Locale)} locale={locale as Locale} />;
}