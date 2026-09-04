"use client";

import { Button, Select, Space, Typography } from "antd";
import { useMemo, useState } from "react";
import { useCart } from "./cart/cart-context";
import { trackEvent } from "./lib/analytics";
import { getProductColor } from "./lib/product-colors";

type Variant = {
  id: string;
  title: string;
  size?: string | null;
  color?: string | null;
  colorHex?: string | null;
  price: number;
  currencyCode: string;
  availableForSale: boolean;
  preorder: boolean;
};

type ProductPurchaseProps = {
  locale: "es" | "en";
  hideSingleColor?: boolean;
  product: {
    id: string;
    handle: string;
    title: string;
    image: string;
    variants: Variant[];
  };
};

export default function ProductPurchase({ locale, product, hideSingleColor = false }: ProductPurchaseProps) {
  const { addLine } = useCart();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [color, setColor] = useState(product.variants[0]?.color || "");

  const colors = useMemo(() => Array.from(new Map(product.variants
    .filter((variant) => variant.color)
    .map((variant) => [variant.color, { value: variant.color || "", hex: variant.colorHex || getProductColor(variant.color)?.hex || "#D8D6D1" }])).values()), [product.variants]);
  const sizeVariants = useMemo(() => color
    ? product.variants.filter((variant) => variant.color === color)
    : product.variants, [color, product.variants]);

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
          color: "Color",
          add: "Agregar al carrito",
          preorder: "Agregar al carrito",
          unavailable: "No disponible",
        }
      : {
          variants: "Size",
          color: "Color",
          add: "Add to cart",
          preorder: "Add to cart",
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
        preorder: selected.preorder,
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

  const onColorChange = (nextColor: string) => {
    setColor(nextColor);
    const nextVariant = product.variants.find((variant) => variant.color === nextColor && variant.availableForSale)
      || product.variants.find((variant) => variant.color === nextColor);
    if (nextVariant) setVariantId(nextVariant.id);
  };

  return (
    <Space orientation="vertical" size={14} className="slowfit-product-purchase">
      {colors.length && (!hideSingleColor || colors.length > 1) ? (
        <>
          <Typography.Text>{labels.color}: {locale === "es" ? getProductColor(color)?.labelEs || color : getProductColor(color)?.labelEn || color}</Typography.Text>
          <div className="slowfit-color-options">
            {colors.map((option) => (
              <button key={option.value} type="button" className={`slowfit-color-option${color === option.value ? " is-selected" : ""}`}
                style={{ backgroundColor: option.hex }} onClick={() => onColorChange(option.value)}
                aria-label={locale === "es" ? getProductColor(option.value)?.labelEs || option.value : getProductColor(option.value)?.labelEn || option.value}
                aria-pressed={color === option.value} />
            ))}
          </div>
        </>
      ) : null}
      <Typography.Text>{labels.variants}</Typography.Text>
      <Select
        value={selected.id}
        onChange={(value) => setVariantId(value)}
        options={sizeVariants.map((variant) => ({
          value: variant.id,
          label: `${variant.size || variant.title} - ${money.format(variant.price)}`,
          disabled: !variant.availableForSale,
        }))}
      />
      <Button type="primary" className="slowfit-secondary-cta" onClick={onAdd} disabled={!selected.availableForSale}>
        {selected.availableForSale ? (selected.preorder ? labels.preorder : labels.add) : labels.unavailable}
      </Button>
    </Space>
  );
}
