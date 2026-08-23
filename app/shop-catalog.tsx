"use client";

import { HeartFilled, HeartOutlined, SearchOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { Alert, Button, Checkbox, Empty, Input, Modal, Segmented, Select, Space, Tag, Tooltip } from "antd";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "./lib/analytics";
import { apiRequest, isApiErrorStatus } from "./lib/api-client";
import type { CatalogProduct } from "./lib/catalog";
import ProductPurchase from "./product-purchase";

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
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState(initialTag === "all" ? [] : [initialTag]);
  const [preorderOnly, setPreorderOnly] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState(products);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteLoadingId, setFavoriteLoadingId] = useState("");
  const [quickAddProduct, setQuickAddProduct] = useState<CatalogProduct | null>(null);
  const requestSequence = useRef(0);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const tags = useMemo(() => Array.from(new Set([
    ...(initialTag === "all" ? [] : [initialTag]),
    ...catalogProducts.flatMap((product) => product.tags),
  ])).sort(), [catalogProducts, initialTag]);
  const selectedGender = selectedTags.find((tag) => tag === "men" || tag === "women") || "all";
  const labels = locale === "es"
    ? { search: "Buscar productos", all: "Escribe una o varias etiquetas", everyone: "Todo", men: "Hombre", women: "Mujer", empty: "No encontramos productos con estos filtros.", view: "Ver", quickAdd: "Agregar", quickAddTitle: "Agregar al carrito", soldOut: "Agotado", preorder: "Preventa", preorderOnly: "Solo preventa", favorite: "Guardar favorito", unfavorite: "Quitar de favoritos", loadMore: "Cargar más", error: "No pudimos cargar los productos." }
    : { search: "Search products", all: "Type one or more tags", everyone: "All", men: "Men", women: "Women", empty: "No products match these filters.", view: "View", quickAdd: "Add", quickAddTitle: "Add to cart", soldOut: "Sold out", preorder: "Pre-order", preorderOnly: "Pre-order only", favorite: "Save favorite", unfavorite: "Remove favorite", loadMore: "Load more", error: "We could not load the products." };

  const loadPage = useCallback(async (nextPage: number, replace: boolean) => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
    if (deferredSearch) params.set("search", deferredSearch);
    selectedTags.forEach((tag) => params.append("tag", tag));
    if (preorderOnly) params.set("preorder", "true");

    try {
      const response = await fetch(`/api/catalog/products?${params}`);
      if (!response.ok) throw new Error("Catalog request failed");
      const payload = await response.json() as { products: CatalogApiProduct[]; total: number; page: number };
      if (requestId !== requestSequence.current) return;
      const nextProducts = payload.products.map(normalizeProduct);
      setCatalogProducts((current) => replace ? nextProducts : [...current, ...nextProducts]);
      setTotal(payload.total);
      setPage(payload.page);
      if (deferredSearch || selectedTags.length) {
        trackEvent("product_search", {
          search_term: deferredSearch,
          tags: selectedTags,
          product_ids: nextProducts.map((product) => product.id),
          result_count: payload.total,
        });
      }
    } catch {
      if (requestId === requestSequence.current) setLoadError(true);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [deferredSearch, pageSize, preorderOnly, selectedTags]);

  useEffect(() => {
    apiRequest<{ productIds: string[] }>("/api/account/favorites")
      .then((payload) => setFavoriteIds(new Set(payload.productIds)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadPage(1, true), 0);
    return () => window.clearTimeout(timeout);
  }, [loadPage]);

  const toggleFavorite = async (productId: string) => {
    const isFavorite = favoriteIds.has(productId);
    setFavoriteLoadingId(productId);
    try {
      await apiRequest(`/api/account/favorites/${encodeURIComponent(productId)}`, {
        method: isFavorite ? "DELETE" : "PUT",
      });
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (isFavorite) next.delete(productId);
        else next.add(productId);
        return next;
      });
    } catch (error) {
      if (isApiErrorStatus(error, 401)) router.push(`/${locale}/account`);
    } finally {
      setFavoriteLoadingId("");
    }
  };

  return (
    <>
      <Space wrap className="slowfit-shop-filters">
        <Input prefix={<SearchOutlined />} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={labels.search} allowClear />
        <Segmented value={selectedGender} onChange={(value) => setSelectedTags((current) => [
          ...(value === "all" ? [] : [value]),
          ...current.filter((tag) => tag !== "men" && tag !== "women"),
        ])} options={[
          { value: "all", label: labels.everyone },
          { value: "men", label: labels.men },
          { value: "women", label: labels.women },
        ]} />
        <Select mode="tags" allowClear showSearch value={selectedTags.filter((tag) => tag !== "men" && tag !== "women")} onChange={(values) => setSelectedTags([
          ...(selectedGender === "all" ? [] : [selectedGender]),
          ...values.filter((tag) => tag !== "men" && tag !== "women"),
        ])} tokenSeparators={[","]} placeholder={labels.all} options={[
          ...tags.map((value) => ({ value, label: value })),
        ]} />
        <Checkbox checked={preorderOnly} onChange={(event) => setPreorderOnly(event.target.checked)}>{labels.preorderOnly}</Checkbox>
      </Space>
      {loadError ? <Alert type="error" showIcon message={labels.error} /> : null}
      {catalogProducts.length ? (
        <div className="slowfit-product-grid">
          {catalogProducts.map((product, index) => {
            const available = product.variants.some((variant) => variant.availableForSale);
            const preorder = product.variants.some((variant) => variant.preorder);
            const money = new Intl.NumberFormat(locale === "es" ? "es-CR" : "en-US", { style: "currency", currency: product.currencyCode });
            const detailHref = `/${locale}/product/${product.handle}`;
            return (
              <article key={product.id} className="slowfit-product-card">
                <Link className="slowfit-product-card-link" href={detailHref} aria-label={`${labels.view}: ${product.title}`}
                  onClick={() => trackEvent("product_click", { product_id: product.id, product_handle: product.handle })} />
                <div className="slowfit-product-card-media">
                  <Image src={product.image} alt={product.images[0]?.altText || product.title} fill priority={index === 0} unoptimized sizes="(max-width: 767px) 100vw, (max-width: 991px) 50vw, 33vw" className="slowfit-cover" />
                  <Tooltip title={favoriteIds.has(product.id) ? labels.unfavorite : labels.favorite}>
                    <Button className="slowfit-favorite-button" type="text" shape="circle" loading={favoriteLoadingId === product.id}
                      icon={favoriteIds.has(product.id) ? <HeartFilled /> : <HeartOutlined />} onClick={(event) => {
                        event.stopPropagation();
                        void toggleFavorite(product.id);
                      }}
                      aria-label={favoriteIds.has(product.id) ? labels.unfavorite : labels.favorite} />
                  </Tooltip>
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
                  <div className="slowfit-product-card-actions">
                    <Button type="primary" icon={<ShoppingCartOutlined />} disabled={!available && !preorder}
                      aria-label={`${labels.quickAdd}: ${product.title}`} onClick={() => setQuickAddProduct(product)}>{labels.quickAdd}</Button>
                    <Link className="ant-btn slowfit-product-detail-link" href={detailHref}
                      onClick={() => trackEvent("product_click", { product_id: product.id, product_handle: product.handle })}>{labels.view}</Link>
                  </div>
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
      <Modal title={quickAddProduct ? `${labels.quickAddTitle}: ${quickAddProduct.title}` : labels.quickAddTitle}
        open={Boolean(quickAddProduct)} onCancel={() => setQuickAddProduct(null)} footer={null} destroyOnHidden>
        {quickAddProduct ? <ProductPurchase locale={locale} product={quickAddProduct} hideSingleColor /> : null}
      </Modal>
    </>
  );
}