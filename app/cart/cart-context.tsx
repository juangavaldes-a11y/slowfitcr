"use client";

import { DeleteOutlined, MinusOutlined, PlusOutlined, ShoppingOutlined } from "@ant-design/icons";
import { Button, Drawer, Space, Typography, message } from "antd";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { trackEvent } from "../lib/analytics";
import { apiRequest, formatApiError } from "../lib/api-client";

export type CartLine = {
  productId: string;
  variantId: string;
  title: string;
  handle: string;
  image: string;
  price: number;
  currencyCode: string;
  quantity: number;
};

type CartContextValue = {
  lines: CartLine[];
  cartId?: string;
  setCartId: (cartId?: string) => void;
  totalItems: number;
  subtotal: number;
  addLine: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  updateLineQuantity: (variantId: string, nextQuantity: number) => void;
  removeLine: (variantId: string) => void;
  clearCart: () => void;
};

const STORAGE_KEY = "slowfit_cart_v1";

type PersistedCart = {
  lines: CartLine[];
  cartId?: string;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: PropsWithChildren) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [cartId, setCartId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return;
        }
        const parsed = JSON.parse(raw) as CartLine[] | PersistedCart;
        if (Array.isArray(parsed)) {
          setLines(parsed);
          return;
        }

        setLines(parsed.lines ?? []);
        setCartId(parsed.cartId);
      } catch {
        setLines([]);
        setCartId(undefined);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const payload: PersistedCart = {
      lines,
      cartId,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [lines, cartId]);

  const value = useMemo<CartContextValue>(() => {
    const addLine: CartContextValue["addLine"] = (line, quantity = 1) => {
      setLines((current) => {
        const existing = current.find((item) => item.variantId === line.variantId);
        if (existing) {
          return current.map((item) =>
            item.variantId === line.variantId ? { ...item, quantity: item.quantity + quantity } : item,
          );
        }

        return [...current, { ...line, quantity }];
      });
    };

    const updateLineQuantity: CartContextValue["updateLineQuantity"] = (variantId, nextQuantity) => {
      setLines((current) =>
        current
          .map((item) => (item.variantId === variantId ? { ...item, quantity: nextQuantity } : item))
          .filter((item) => item.quantity > 0),
      );
    };

    const removeLine: CartContextValue["removeLine"] = (variantId) => {
      setLines((current) => current.filter((item) => item.variantId !== variantId));
    };

    const clearCart = () => setLines([]);

    const totalItems = lines.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

    return {
      lines,
      cartId,
      setCartId,
      totalItems,
      subtotal,
      addLine,
      updateLineQuantity,
      removeLine,
      clearCart,
    };
  }, [cartId, lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }

  return context;
}

function currencyFormatter(currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  });
}

export function CartDock() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pathname = usePathname();
  const [api, contextHolder] = message.useMessage();
  const { lines, cartId, setCartId, totalItems, subtotal, updateLineQuantity, removeLine, clearCart } = useCart();
  const locale = pathname.startsWith("/es") ? "es" : "en";
  const labels =
    locale === "es"
      ? {
          cart: "Carrito",
          empty: "Tu carrito esta vacio.",
          checkout: "Ir al checkout",
          clear: "Vaciar",
          subtotal: "Subtotal",
        }
      : {
          cart: "Cart",
          empty: "Your cart is empty.",
          checkout: "Go to checkout",
          clear: "Clear",
          subtotal: "Subtotal",
        };

  const currency = lines[0]?.currencyCode ?? "USD";
  const money = currencyFormatter(currency);

  const handleCheckout = async () => {
    if (!lines.length || submitting) {
      return;
    }

    try {
      setSubmitting(true);
      const payload = await apiRequest<{ checkout?: { checkoutUrl: string; cartId: string } }>("/api/cart/checkout", {
        method: "POST",
        body: JSON.stringify({
          locale,
          cartId,
          lines: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
        }),
      });

      const checkoutUrl = payload.checkout?.checkoutUrl;
      const nextCartId = payload.checkout?.cartId;
      if (!checkoutUrl) {
        throw new Error("checkout_missing_url");
      }

      if (nextCartId) {
        setCartId(nextCartId);
      }

      trackEvent("begin_checkout", { totalItems, subtotal, currency });
      window.location.assign(checkoutUrl);
    } catch (error) {
      api.error(formatApiError(error, locale, {
        fallback: locale === "es" ? "No fue posible iniciar checkout" : "Could not start checkout",
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {contextHolder}
      <Button
        className="slowfit-cart-fab"
        type="primary"
        icon={<ShoppingOutlined />}
        onClick={() => setOpen(true)}
      >
        {labels.cart} ({totalItems})
      </Button>
      <Drawer
        title={`${labels.cart} (${totalItems})`}
        open={open}
        onClose={() => setOpen(false)}
        size="default"
      >
        {lines.length === 0 ? (
          <Typography.Paragraph>{labels.empty}</Typography.Paragraph>
        ) : (
          <div className="slowfit-cart-list">
            {lines.map((line) => (
              <article key={line.variantId} className="slowfit-cart-line">
                <div>
                  <Typography.Text strong>{line.title}</Typography.Text>
                  <Typography.Paragraph className="slowfit-cart-price">
                    {money.format(line.price)}
                  </Typography.Paragraph>
                </div>
                <Space>
                  <Button
                    icon={<MinusOutlined />}
                    onClick={() => updateLineQuantity(line.variantId, line.quantity - 1)}
                  />
                  <span>{line.quantity}</span>
                  <Button
                    icon={<PlusOutlined />}
                    onClick={() => updateLineQuantity(line.variantId, line.quantity + 1)}
                  />
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeLine(line.variantId)}
                  />
                </Space>
              </article>
            ))}
            <div className="slowfit-cart-footer">
              <Typography.Text>{labels.subtotal}</Typography.Text>
              <Typography.Text strong>{money.format(subtotal)}</Typography.Text>
            </div>
            <Space>
              <Button onClick={() => clearCart()}>{labels.clear}</Button>
              <Button type="primary" onClick={handleCheckout} loading={submitting}>
                {labels.checkout}
              </Button>
            </Space>
          </div>
        )}
      </Drawer>
    </>
  );
}
