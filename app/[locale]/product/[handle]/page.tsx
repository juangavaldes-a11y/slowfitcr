import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import ProductPurchase from "../../../product-purchase";
import ReviewsPanel from "../../../reviews-panel";
import { isLocale, locales, type Locale } from "../../../i18n";
import { getProductByHandle } from "../../../lib/shopify";

type ProductPageProps = {
  params: Promise<{
    locale: string;
    handle: string;
  }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { locale, handle } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const product = await getProductByHandle(handle, locale as Locale);

  if (!product) {
    return {};
  }

  return {
    title: `Slow Fit CR | ${product.title}`,
    description: product.description,
    alternates: {
      canonical: `/${locale}/product/${product.handle}`,
      languages: Object.fromEntries(locales.map((value) => [value, `/${value}/product/${product.handle}`])),
    },
    openGraph: {
      title: `Slow Fit CR | ${product.title}`,
      description: product.description,
      images: [
        {
          url: product.image,
          alt: product.title,
        },
      ],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { locale, handle } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const product = await getProductByHandle(handle, locale as Locale);

  if (!product) {
    notFound();
  }

  const formatMoney = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currencyCode,
    maximumFractionDigits: 2,
  });

  return (
    <main className="slowfit-shop-page">
      <section className="slowfit-shell slowfit-product-detail">
        <div className="slowfit-product-detail-media">
          <Image src={product.image} alt={product.title} fill sizes="(max-width: 991px) 100vw, 48vw" className="slowfit-cover" />
        </div>
        <div className="slowfit-product-detail-content">
          <span className="slowfit-kicker">{product.collectionTitle}</span>
          <h1 className="slowfit-display slowfit-product-detail-title">{product.title}</h1>
          <p className="slowfit-shop-card-copy slowfit-product-description">{product.description}</p>
          <div className="slowfit-product-price-row">
            <span className="slowfit-product-price">{formatMoney.format(product.price)}</span>
            {typeof product.compareAtPrice === "number" ? (
              <span className="slowfit-product-compare-price">
                {formatMoney.format(product.compareAtPrice)}
              </span>
            ) : null}
          </div>
          <ProductPurchase
            locale={locale as Locale}
            product={{
              id: product.id,
              handle: product.handle,
              title: product.title,
              image: product.image,
              variants: product.variants,
            }}
          />

          <ReviewsPanel locale={locale as Locale} productHandle={product.handle} />
        </div>
      </section>
    </main>
  );
}
