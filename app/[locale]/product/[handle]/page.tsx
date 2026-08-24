import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductGallery from "../../../product-gallery";
import ProductPurchase from "../../../product-purchase";
import ReviewsPanel from "../../../reviews-panel";
import { isLocale, type Locale } from "../../../i18n";
import { getProductByHandle } from "../../../lib/catalog";
import StructuredData from "../../../structured-data";

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

  const product = await getProductByHandle(handle);

  if (!product) {
    return {};
  }

  return {
    title: product.title,
    description: product.description,
    alternates: {
      canonical: `/${locale}/product/${product.handle}`,
      languages: {
        "es-CR": `/es/product/${product.handle}`,
        en: `/en/product/${product.handle}`,
        "x-default": `/es/product/${product.handle}`,
      },
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

  const product = await getProductByHandle(handle);

  if (!product) {
    notFound();
  }

  const formatMoney = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currencyCode,
    maximumFractionDigits: 2,
  });
  const productUrl = `https://slowfitcr.com/${locale}/product/${product.handle}`;
  const imageUrls = product.images.map((image) => image.url.startsWith("http")
    ? image.url
    : `https://slowfitcr.com${image.url}`);

  return (
    <main className="slowfit-shop-page">
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          "@id": `${productUrl}#product`,
          name: product.title,
          description: product.description,
          image: imageUrls,
          url: productUrl,
          brand: {
            "@type": "Brand",
            name: "Slow Fit CR",
          },
          category: locale === "es" ? "Ropa deportiva" : "Activewear",
          offers: {
            "@type": "Offer",
            url: productUrl,
            priceCurrency: product.currencyCode,
            price: product.price,
            availability: product.variants.some((variant) => variant.availableForSale && !variant.preorder)
              ? "https://schema.org/InStock"
              : product.variants.some((variant) => variant.preorder)
                ? "https://schema.org/PreOrder"
                : "https://schema.org/OutOfStock",
            itemCondition: "https://schema.org/NewCondition",
          },
        }}
      />
      <section className="slowfit-shell slowfit-product-detail">
        <ProductGallery images={product.images} productTitle={product.title} />
        <div className="slowfit-product-detail-content">
          <span className="slowfit-kicker">{product.collectionTitle}</span>
          <h1 className="slowfit-display slowfit-product-detail-title">{product.title}</h1>
          <p className="slowfit-shop-card-copy slowfit-product-description">{product.description}</p>
          {product.supplierReference ? (
            <p className="slowfit-product-reference">
              <strong>{locale === "es" ? "Referencia" : "Reference"}:</strong> {product.supplierReference}
            </p>
          ) : null}
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
