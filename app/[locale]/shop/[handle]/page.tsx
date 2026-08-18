import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCollectionByHandle } from "../../../lib/shopify";
import { isLocale, type Locale } from "../../../i18n";

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
    title: collection.title,
    description: collection.description,
    alternates: {
      canonical: `/${locale}/shop/${collection.handle}`,
      languages: {
        "es-CR": `/es/shop/${collection.handle}`,
        en: `/en/shop/${collection.handle}`,
        "x-default": `/es/shop/${collection.handle}`,
      },
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
        <h1 className="slowfit-display slowfit-section-title">{collection.title}</h1>
        <p className="slowfit-shop-lead">{collection.description}</p>
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
                <h4>{product.title}</h4>
                <p className="slowfit-shop-card-copy">{product.description}</p>
                <span className="slowfit-product-price">{formatMoney.format(product.price)}</span>
                <Link className="ant-btn slowfit-block-cta" href={`/${locale}/product/${product.handle}`}>
                  {locale === "es" ? "Ver producto" : "View product"}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
