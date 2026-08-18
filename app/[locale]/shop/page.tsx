import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCopy, isLocale, locales, type Locale } from "../../i18n";
import { getCollections } from "../../lib/shopify";

type ShopPageProps = {
  params: Promise<{
    locale: string;
  }>;
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

export default async function ShopPage({ params }: ShopPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const copy = getCopy(locale as Locale);
  const collections = await getCollections(locale as Locale);

  return (
    <main className="slowfit-shop-page">
      <section className="slowfit-shell slowfit-shop-hero">
        <span className="slowfit-kicker">{copy.shop.kicker}</span>
        <h1 className="slowfit-display slowfit-section-title">{copy.shop.title}</h1>
        <p className="slowfit-shop-lead">{copy.shop.description}</p>
      </section>

      <section id="collections" className="slowfit-shell">
        <div className="slowfit-shop-grid">
          {collections.map((collection, index) => (
            <article key={collection.id} className="slowfit-shop-card">
              <div className="slowfit-shop-card-media">
                <Image
                  src={collection.image}
                  alt={collection.title}
                  fill
                  sizes="(max-width: 767px) 100vw, (max-width: 991px) 50vw, 33vw"
                  className="slowfit-cover"
                />
              </div>
              <div className="slowfit-shop-card-body">
                <span className="slowfit-shop-card-label">
                  {index === 0 ? copy.shop.featuredLabel : copy.collections.kicker}
                </span>
                <h2 className="slowfit-display slowfit-shop-card-title">{collection.title}</h2>
                <p className="slowfit-shop-card-copy">{collection.description}</p>
                <Link className="ant-btn slowfit-block-cta" href={`/${locale}/shop/${collection.handle}`}>
                  {copy.shop.ctaLabel}
                </Link>
              </div>
            </article>
          ))}
        </div>
        <p className="slowfit-shop-helper">{copy.shop.helper}</p>
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