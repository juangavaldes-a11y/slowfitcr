"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Input, Select, Space, Tag } from "antd";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogProduct } from "./lib/catalog";

type CatalogApiProduct = Omit<CatalogProduct, "image" | "price" | "compareAtPrice" | "collectionTitle">;

function normalizeProduct(product: CatalogApiProduct): CatalogProduct {
  const sortedVariants = [...product.variants].sort((left, right) => left.price - right.price);
  const lowest = sortedVariants[0];
  return {
    ...product,
    image: product.images[0]?.url || "/slowfit/hero.jpg",
    price: lowest?.price || 0,
    compareAtPrice: lowest?.compareAtPrice && lowest.compareAtPrice > lowest.price ? lowest.compareAtPrice : undefined,
    collectionTitle: product.tags[0] || "Slow Fit",
  };
}

export default function ShopCatalog({
  locale,
  products,
  total: initialTotal,
  pageSize,
  initialTag = "all",
}: {
  locale: "es" | "en";
  products: CatalogProduct[];
  total: number;
  pageSize: number;
  initialTag?: string;
}) {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState(initialTag);
  const [catalogProducts, setCatalogProducts] = useState(products);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const initialRender = useRef(true);
  const requestSequence = useRef(0);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const tags = useMemo(() => Array.from(new Set([
    ...(initialTag === "all" ? [] : [initialTag]),
    ...catalogProducts.flatMap((product) => product.tags),
  ])).sort(), [catalogProducts, initialTag]);
  const labels = locale === "es"
    ? { search: "Buscar productos", all: "Todas las etiquetas", empty: "No encontramos productos con estos filtros.", view: "Ver producto", soldOut: "Agotado", preorder: "Preventa", loadMore: "Cargar más", error: "No pudimos cargar los productos." }
    : { search: "Search products", all: "All tags", empty: "No products match these filters.", view: "View product", soldOut: "Sold out", preorder: "Pre-order", loadMore: "Load more", error: "We could not load the products." };

  const loadPage = useCallback(async (nextPage: number, replace: boolean) => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
    if (deferredSearch) params.set("search", deferredSearch);
    if (tag !== "all") params.set("tag", tag);

    try {
      const response = await fetch(`/api/catalog/products?${params}`);
      if (!response.ok) throw new Error("Catalog request failed");
      const payload = await response.json() as { products: CatalogApiProduct[]; total: number; page: number };
      if (requestId !== requestSequence.current) return;
      const nextProducts = payload.products.map(normalizeProduct);
      setCatalogProducts((current) => replace ? nextProducts : [...current, ...nextProducts]);
      setTotal(payload.total);
      setPage(payload.page);
    } catch {
      if (requestId === requestSequence.current) setLoadError(true);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [deferredSearch, pageSize, tag]);

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    void loadPage(1, true);
  }, [loadPage]);

  return (
    <>
      <Space wrap className="slowfit-shop-filters">
        <Input prefix={<SearchOutlined />} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={labels.search} allowClear />
        <Select value={tag} onChange={setTag} options={[
          { value: "all", label: labels.all },
          ...tags.map((value) => ({ value, label: value })),
        ]} />
      </Space>
      {loadError ? <Alert type="error" showIcon message={labels.error} /> : null}
      {catalogProducts.length ? (
        <div className="slowfit-product-grid">
          {catalogProducts.map((product, index) => {
            const available = product.variants.some((variant) => variant.availableForSale);
            const preorder = product.variants.some((variant) => variant.preorder);
            const money = new Intl.NumberFormat(locale === "es" ? "es-CR" : "en-US", { style: "currency", currency: product.currencyCode });
            return (
              <article key={product.id} className="slowfit-product-card">
                <div className="slowfit-product-card-media">
                  <Image src={product.image} alt={product.images[0]?.altText || product.title} fill priority={index === 0} unoptimized sizes="(max-width: 767px) 100vw, (max-width: 991px) 50vw, 33vw" className="slowfit-cover" />
                  {!available || preorder ? <span className="slowfit-stock-badge">{preorder ? labels.preorder : labels.soldOut}</span> : null}
                </div>
                <div className="slowfit-product-card-body">
                  <Space wrap>{product.tags.map((value) => <Tag key={value}>{value}</Tag>)}</Space>
                  <h2>{product.title}</h2>
                  <p className="slowfit-shop-card-copy">{product.description}</p>
                  <div className="slowfit-product-price-row">
                    <span className="slowfit-product-price">{money.format(product.price)}</span>
                    {product.compareAtPrice ? <span className="slowfit-product-compare-price">{money.format(product.compareAtPrice)}</span> : null}
                  </div>
                  <Link className="ant-btn slowfit-block-cta" href={`/${locale}/product/${product.handle}`}>{labels.view}</Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : <Empty description={labels.empty} />}
      {catalogProducts.length < total ? (
        <div className="slowfit-shop-load-more">
          <Button loading={loading} onClick={() => void loadPage(page + 1, false)}>{labels.loadMore}</Button>
        </div>
      ) : null}
    </>
  );
}