import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCopy, isLocale, locales, type Locale } from "../../i18n";
import { getProductPage } from "../../lib/catalog";
import ShopCatalog from "../../shop-catalog";

type ShopPageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{ tag?: string }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: ShopPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const copy = getCopy(locale);

  return {
    title: copy.shop.kicker,
    description: copy.shop.description,
    alternates: {
      canonical: `/${locale}/shop`,
      languages: {
        "es-CR": "/es/shop",
        en: "/en/shop",
        "x-default": "/es/shop",
      },
    },
    openGraph: {
      title: `Slow Fit CR | ${copy.shop.kicker}`,
      description: copy.shop.description,
      url: `/${locale}/shop`,
      locale,
      images: [
        {
          url: "/slowfit/hero.jpg",
          alt: copy.hero.imageAlt,
        },
      ],
    },
  };
}

export default async function ShopPage({ params, searchParams }: ShopPageProps) {
  const { locale } = await params;
  const { tag } = await searchParams;

  if (!isLocale(locale)) {
    notFound();
  }

  const copy = getCopy(locale as Locale);
  const catalog = await getProductPage({ tag: tag || "" });

  return (
    <main className="slowfit-shop-page">
      <section className="slowfit-shell slowfit-shop-hero">
        <span className="slowfit-kicker">{copy.shop.kicker}</span>
        <h1 className="slowfit-display slowfit-section-title">{copy.shop.title}</h1>
        <p className="slowfit-shop-lead">{copy.shop.description}</p>
      </section>

      <section id="catalog" className="slowfit-shell slowfit-policy-section">
        <ShopCatalog
          locale={locale as Locale}
          products={catalog.products}
          total={catalog.total}
          pageSize={catalog.pageSize}
          initialTag={tag || "all"}
        />
      </section>

      <section className="slowfit-shell slowfit-policy-section">
        <div className="slowfit-trust-grid">
          <div className="slowfit-trust-card">
            <h4>{copy.trust.shippingTitle}</h4>
            <p>{copy.trust.shippingCopy}</p>
          </div>
          <div className="slowfit-trust-card">
            <h4>{copy.trust.returnsTitle}</h4>
            <p>{copy.trust.returnsCopy}</p>
          </div>
          <div className="slowfit-trust-card">
            <h4>{copy.trust.supportTitle}</h4>
            <p>{copy.trust.supportCopy}</p>
          </div>
          <div className="slowfit-trust-card">
            <h4>{copy.trust.secureTitle}</h4>
            <p>{copy.trust.secureCopy}</p>
          </div>
        </div>
      </section>
    </main>
  );
}