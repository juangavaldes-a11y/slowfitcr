"use client";

import { Alert, Button, Modal, Radio, Select, Space, Typography } from "antd";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCart } from "./cart/cart-context";
import { apiRequest, ApiError } from "./lib/api-client";
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
  const [layawayOpen, setLayawayOpen] = useState(false);
  const [layawayMode, setLayawayMode] = useState<"online" | "request">("online");
  const [layawaySaving, setLayawaySaving] = useState(false);
  const [layawayMessage, setLayawayMessage] = useState<{ type: "success" | "error" | "warning"; text: string; signIn?: boolean } | null>(null);

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

  const deposit = Math.ceil(Number((selected.price * 0.2).toFixed(6)));
  const layawayLabels = locale === "es"
    ? {
        button: "Apartar con 20%", title: "Apartar esta pieza",
        intro: `Separa esta pieza por mes y medio (45 días) con un depósito del 20%: ${money.format(deposit)}. Sale del inventario mientras está apartada.`,
        online: "Pagar el depósito en línea", request: "Pagar el depósito directamente con la tienda",
        requestHint: "Separamos la pieza por 48 horas mientras la tienda confirma tu depósito.",
        confirm: "Apartar", cancel: "Cerrar",
        requested: "Listo. La pieza quedó separada por 48 horas; la tienda confirmará tu depósito y empezará tu plazo de 45 días.",
        signIn: "Inicia sesión para apartar una pieza.", signInLink: "Ir a mi cuenta",
        errors: { UNAVAILABLE: "Esta pieza ya no está disponible.", NOT_LAYAWAY_ELIGIBLE: "Esta pieza no se puede apartar en línea.", LIMIT_REACHED: "Tienes demasiadas solicitudes pendientes de depósito.", generic: "No pudimos crear el apartado. Intenta de nuevo." } as Record<string, string>,
      }
    : {
        button: "Reserve with 20%", title: "Reserve this piece",
        intro: `Hold this piece for a month and a half (45 days) with a 20% deposit: ${money.format(deposit)}. It leaves the inventory while reserved.`,
        online: "Pay the deposit online", request: "Pay the deposit directly with the store",
        requestHint: "We hold the piece for 48 hours while the store confirms your deposit.",
        confirm: "Reserve", cancel: "Close",
        requested: "Done. The piece is held for 48 hours; the store will confirm your deposit and your 45 days start then.",
        signIn: "Sign in to reserve a piece.", signInLink: "Go to my account",
        errors: { UNAVAILABLE: "This piece is no longer available.", NOT_LAYAWAY_ELIGIBLE: "This piece cannot be reserved online.", LIMIT_REACHED: "You have too many reservations waiting for a deposit.", generic: "We could not create the layaway. Try again." } as Record<string, string>,
      };

  const submitLayaway = async () => {
    setLayawaySaving(true);
    setLayawayMessage(null);
    try {
      const result = await apiRequest<{ checkoutUrl: string | null }>("/api/account/layaways", {
        method: "POST",
        body: JSON.stringify({ variantId: selected.id, mode: layawayMode, locale }),
      });
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      setLayawayMessage({ type: "success", text: layawayLabels.requested });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setLayawayMessage({ type: "warning", text: layawayLabels.signIn, signIn: true });
      else setLayawayMessage({ type: "error", text: (error instanceof Error && layawayLabels.errors[error.message]) || layawayLabels.errors.generic });
    } finally {
      setLayawaySaving(false);
    }
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
      {selected.availableForSale && !selected.preorder ? (
        <>
          <Button onClick={() => { setLayawayMessage(null); setLayawayOpen(true); }}>{layawayLabels.button}</Button>
          <Modal title={layawayLabels.title} open={layawayOpen} onCancel={() => setLayawayOpen(false)} destroyOnHidden
            okText={layawayLabels.confirm} cancelText={layawayLabels.cancel} confirmLoading={layawaySaving}
            okButtonProps={{ disabled: layawayMessage?.type === "success" }} onOk={() => void submitLayaway()}>
            <div className="slowfit-layaway-cta">
              <Typography.Text>{product.title} · {selected.title}</Typography.Text>
              <Typography.Paragraph>{layawayLabels.intro}</Typography.Paragraph>
              <Radio.Group value={layawayMode} onChange={(event) => setLayawayMode(event.target.value)}>
                <Space orientation="vertical">
                  <Radio value="online">{layawayLabels.online}</Radio>
                  <Radio value="request">{layawayLabels.request}</Radio>
                </Space>
              </Radio.Group>
              {layawayMode === "request" ? <Typography.Text className="slowfit-layaway-note">{layawayLabels.requestHint}</Typography.Text> : null}
              {layawayMessage ? (
                <Alert type={layawayMessage.type} showIcon title={layawayMessage.text}
                  action={layawayMessage.signIn ? <Link href={`/${locale}/account`}>{layawayLabels.signInLink}</Link> : undefined} />
              ) : null}
            </div>
          </Modal>
        </>
      ) : null}
    </Space>
  );
}
