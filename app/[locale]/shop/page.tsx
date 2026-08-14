import type { Metadata } from "next";
import { Button, Typography } from "antd";
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
    title: `Slow Fit CR | ${copy.shop.kicker}`,
    description: copy.shop.description,
    alternates: {
      canonical: `/${locale}/shop`,
      languages: Object.fromEntries(locales.map((value) => [value, `/${value}/shop`])),
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
        <Typography.Title className="slowfit-display slowfit-section-title">
          {copy.shop.title}
        </Typography.Title>
        <Typography.Paragraph className="slowfit-shop-lead">{copy.shop.description}</Typography.Paragraph>
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
                <Typography.Title className="slowfit-display slowfit-shop-card-title">
                  {collection.title}
                </Typography.Title>
                <Typography.Paragraph className="slowfit-shop-card-copy">
                  {collection.description}
                </Typography.Paragraph>
                <Link href={`/${locale}/shop/${collection.handle}`}>
                  <Button type="primary" className="slowfit-block-cta">
                    {copy.shop.ctaLabel}
                  </Button>
                </Link>
              </div>
            </article>
          ))}
        </div>
        <Typography.Paragraph className="slowfit-shop-helper">{copy.shop.helper}</Typography.Paragraph>
      </section>

      <section className="slowfit-shell slowfit-policy-section">
        <div className="slowfit-trust-grid">
          <div className="slowfit-trust-card">
            <Typography.Title level={4}>{copy.trust.shippingTitle}</Typography.Title>
            <Typography.Paragraph>{copy.trust.shippingCopy}</Typography.Paragraph>
          </div>
          <div className="slowfit-trust-card">
            <Typography.Title level={4}>{copy.trust.returnsTitle}</Typography.Title>
            <Typography.Paragraph>{copy.trust.returnsCopy}</Typography.Paragraph>
          </div>
          <div className="slowfit-trust-card">
            <Typography.Title level={4}>{copy.trust.supportTitle}</Typography.Title>
            <Typography.Paragraph>{copy.trust.supportCopy}</Typography.Paragraph>
          </div>
          <div className="slowfit-trust-card">
            <Typography.Title level={4}>{copy.trust.secureTitle}</Typography.Title>
            <Typography.Paragraph>{copy.trust.secureCopy}</Typography.Paragraph>
          </div>
        </div>
      </section>
    </main>
  );
}