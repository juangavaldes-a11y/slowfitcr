import type { Metadata } from "next";
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

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const copy = getCopy(locale);
  const languages = Object.fromEntries(locales.map((value) => [value, `/${value}`]));

  return {
    title: `Slow Fit CR | ${copy.brandTagline}`,
    description: copy.hero.description,
    alternates: {
      canonical: `/${locale}`,
      languages,
    },
    openGraph: {
      title: `Slow Fit CR | ${copy.brandTagline}`,
      description: copy.hero.description,
      url: `/${locale}`,
      locale,
      siteName: "Slow Fit CR",
      images: [
        {
          url: "/slowfit/hero.jpg",
          alt: copy.hero.imageAlt,
        },
      ],
    },
  };
}

export default async function LocalePage({ params }: LocalePageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return <HomePage copy={getCopy(locale as Locale)} locale={locale as Locale} />;
}