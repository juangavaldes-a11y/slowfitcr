import type { Metadata } from "next";
import { Button, Typography } from "antd";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCollectionByHandle } from "../../../lib/shopify";
import { isLocale, locales, type Locale } from "../../../i18n";

type CollectionPageProps = {
  params: Promise<{
    locale: string;
    handle: string;
  }>;
};

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { locale, handle } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const collection = await getCollectionByHandle(handle, locale as Locale);

  if (!collection) {
    return {};
  }

  return {
    title: `Slow Fit CR | ${collection.title}`,
    description: collection.description,
    alternates: {
      canonical: `/${locale}/shop/${collection.handle}`,
      languages: Object.fromEntries(locales.map((value) => [value, `/${value}/shop/${collection.handle}`])),
    },
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { locale, handle } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const collection = await getCollectionByHandle(handle, locale as Locale);

  if (!collection) {
    notFound();
  }

  const formatMoney = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: collection.products[0]?.currencyCode ?? "USD",
    maximumFractionDigits: 2,
  });

  return (
    <main className="slowfit-shop-page">
      <section className="slowfit-shell slowfit-shop-hero">
        <span className="slowfit-kicker">{locale === "es" ? "Coleccion" : "Collection"}</span>
        <Typography.Title className="slowfit-display slowfit-section-title">{collection.title}</Typography.Title>
        <Typography.Paragraph className="slowfit-shop-lead">{collection.description}</Typography.Paragraph>
      </section>

      <section className="slowfit-shell slowfit-policy-section">
        <div className="slowfit-product-grid">
          {collection.products.map((product) => (
            <article key={product.id} className="slowfit-product-card">
              <div className="slowfit-product-card-media">
                <Image
                  src={product.image}
                  alt={product.title}
                  fill
                  sizes="(max-width: 767px) 100vw, (max-width: 991px) 50vw, 33vw"
                  className="slowfit-cover"
                />
              </div>
              <div className="slowfit-product-card-body">
                <Typography.Title level={4}>{product.title}</Typography.Title>
                <Typography.Paragraph className="slowfit-shop-card-copy">{product.description}</Typography.Paragraph>
                <Typography.Text className="slowfit-product-price">{formatMoney.format(product.price)}</Typography.Text>
                <Link href={`/${locale}/product/${product.handle}`}>
                  <Button type="primary" className="slowfit-block-cta">
                    {locale === "es" ? "Ver producto" : "View product"}
                  </Button>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
