"use client";

import { Button, Select, Space, Typography } from "antd";
import { useMemo, useState } from "react";
import { useCart } from "./cart/cart-context";
import { trackEvent } from "./lib/analytics";

type Variant = {
  id: string;
  title: string;
  price: number;
  currencyCode: string;
  availableForSale: boolean;
  preorder: boolean;
};

type ProductPurchaseProps = {
  locale: "es" | "en";
  product: {
    id: string;
    handle: string;
    title: string;
    image: string;
    variants: Variant[];
  };
};

export default function ProductPurchase({ locale, product }: ProductPurchaseProps) {
  const { addLine } = useCart();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");

  const selected = useMemo(
    () => product.variants.find((variant) => variant.id === variantId) ?? product.variants[0],
    [product.variants, variantId],
  );

  if (!selected) {
    return null;
  }

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: selected.currencyCode,
    maximumFractionDigits: 2,
  });

  const labels =
    locale === "es"
      ? {
          variants: "Talla",
          add: "Agregar al carrito",
          preorder: "Reservar en preventa",
          unavailable: "No disponible",
        }
      : {
          variants: "Size",
          add: "Add to cart",
          preorder: "Pre-order",
          unavailable: "Unavailable",
        };

  const onAdd = () => {
    addLine(
      {
        productId: product.id,
        variantId: selected.id,
        title: `${product.title} - ${selected.title}`,
        handle: product.handle,
        image: product.image,
        price: selected.price,
        currencyCode: selected.currencyCode,
      },
      1,
    );

    trackEvent("add_to_cart", {
      product_handle: product.handle,
      variant_id: selected.id,
      price: selected.price,
      currency: selected.currencyCode,
    });
  };

  return (
    <Space orientation="vertical" size={14} className="slowfit-product-purchase">
      <Typography.Text>{labels.variants}</Typography.Text>
      <Select
        value={selected.id}
        onChange={(value) => setVariantId(value)}
        options={product.variants.map((variant) => ({
          value: variant.id,
          label: `${variant.title} - ${money.format(variant.price)}`,
          disabled: !variant.availableForSale,
        }))}
      />
      <Button type="primary" className="slowfit-secondary-cta" onClick={onAdd} disabled={!selected.availableForSale}>
        {selected.availableForSale ? (selected.preorder ? labels.preorder : labels.add) : labels.unavailable}
      </Button>
    </Space>
  );
}
