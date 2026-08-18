import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HomePage from "../home-page";
import { getCopy, isLocale, locales, type Locale } from "../i18n";
import StructuredData from "../structured-data";

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
  const languages = {
    "es-CR": "/es",
    en: "/en",
    "x-default": "/es",
  };

  return {
    title: locale === "es" ? "Ropa deportiva en Costa Rica" : "Activewear in Costa Rica",
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

  const copy = getCopy(locale as Locale);

  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "OnlineStore",
          "@id": "https://slowfitcr.com/#store",
          name: "Slow Fit CR",
          url: `https://slowfitcr.com/${locale}`,
          logo: "https://slowfitcr.com/slowfit/hero-mark.png",
          image: "https://slowfitcr.com/slowfit/hero.jpg",
          description: copy.hero.description,
          areaServed: {
            "@type": "Country",
            name: "Costa Rica",
          },
          sameAs: ["https://www.instagram.com/slowfitcr/", "https://www.tiktok.com/@slowfitcr"],
        }}
      />
      <HomePage copy={copy} locale={locale as Locale} />
    </>
  );
}