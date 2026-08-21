"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Empty, Input, Select, Space, Tag } from "antd";
import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import type { CatalogProduct } from "./lib/catalog";

export default function ShopCatalog({ locale, products, initialTag = "all" }: { locale: "es" | "en"; products: CatalogProduct[]; initialTag?: string }) {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState(initialTag);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const tags = useMemo(() => Array.from(new Set(products.flatMap((product) => product.tags))).sort(), [products]);
  const filtered = products.filter((product) => {
    const matchesTag = tag === "all" || product.tags.includes(tag);
    const haystack = `${product.title} ${product.description} ${product.tags.join(" ")}`.toLowerCase();
    return matchesTag && (!deferredSearch || haystack.includes(deferredSearch));
  });
  const labels = locale === "es"
    ? { search: "Buscar productos", all: "Todas las etiquetas", empty: "No encontramos productos con estos filtros.", view: "Ver producto", soldOut: "Agotado" }
    : { search: "Search products", all: "All tags", empty: "No products match these filters.", view: "View product", soldOut: "Sold out" };

  return (
    <>
      <Space wrap className="slowfit-shop-filters">
        <Input prefix={<SearchOutlined />} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={labels.search} allowClear />
        <Select value={tag} onChange={setTag} options={[
          { value: "all", label: labels.all },
          ...tags.map((value) => ({ value, label: value })),
        ]} />
      </Space>
      {filtered.length ? (
        <div className="slowfit-product-grid">
          {filtered.map((product, index) => {
            const available = product.variants.some((variant) => variant.availableForSale);
            const money = new Intl.NumberFormat(locale === "es" ? "es-CR" : "en-US", { style: "currency", currency: product.currencyCode });
            return (
              <article key={product.id} className="slowfit-product-card">
                <div className="slowfit-product-card-media">
                  <Image src={product.image} alt={product.images[0]?.altText || product.title} fill priority={index === 0} unoptimized sizes="(max-width: 767px) 100vw, (max-width: 991px) 50vw, 33vw" className="slowfit-cover" />
                  {!available ? <span className="slowfit-stock-badge">{labels.soldOut}</span> : null}
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
    </>
  );
}