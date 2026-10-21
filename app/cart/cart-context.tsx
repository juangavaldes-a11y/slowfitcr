"use client";

import { DeleteOutlined, MinusOutlined, PlusOutlined, ShoppingOutlined } from "@ant-design/icons";
import { Alert, Button, Checkbox, Drawer, Form, Input, Modal, Radio, Select, Space, Typography, message } from "antd";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { trackEvent } from "../lib/analytics";
import { apiRequest, formatApiError } from "../lib/api-client";
import { crProvinces, findCanton, findDistrict, findProvince } from "../lib/cr-locations";

export type CartLine = {
  productId: string;
  variantId: string;
  title: string;
  handle: string;
  image: string;
  price: number;
  currencyCode: string;
  preorder?: boolean;
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

const AUTH_CHANGED_EVENT = "slowfit:auth-changed";
const CartContext = createContext<CartContextValue | null>(null);

function readPersistedCart(): PersistedCart {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lines: [] };
    const parsed = JSON.parse(raw) as CartLine[] | PersistedCart;
    return Array.isArray(parsed) ? { lines: parsed } : { lines: parsed.lines ?? [], cartId: parsed.cartId };
  } catch {
    return { lines: [] };
  }
}

function mergeCartLines(remoteLines: CartLine[], localLines: CartLine[]) {
  const merged = new Map(remoteLines.map((line) => [line.variantId, line]));
  localLines.forEach((line) => merged.set(line.variantId, line));
  return Array.from(merged.values());
}

export function CartProvider({ children }: PropsWithChildren) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [cartId, setCartId] = useState<string | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let active = true;

    const restoreCart = async () => {
      const localCart = readPersistedCart();
      if (active) {
        setLines(localCart.lines);
        setCartId(localCart.cartId);
      }

      try {
        await apiRequest("/api/auth/session");
        const payload = await apiRequest<{ cart: (PersistedCart & { updatedAt: string }) | null }>("/api/account/cart");
        const mergedLines = mergeCartLines(payload.cart?.lines ?? [], localCart.lines);
        const mergedCartId = localCart.cartId || payload.cart?.cartId;
        if (active) {
          setLines(mergedLines);
          setCartId(mergedCartId);
          setAuthenticated(true);
        }
      } catch {
        if (active) setAuthenticated(false);
      } finally {
        if (active) setHydrated(true);
      }
    };

    const handleAuthChanged = () => void restoreCart();
    void restoreCart();
    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);

    return () => {
      active = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: PersistedCart = {
      lines,
      cartId,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    if (!authenticated) return;
    const timeout = window.setTimeout(() => {
      void apiRequest("/api/account/cart", {
        method: "PUT",
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [authenticated, cartId, hydrated, lines]);

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
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quotes, setQuotes] = useState<DeliveryQuote[]>([]);
  const [unavailableProviders, setUnavailableProviders] = useState<string[]>([]);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string>();
  const [deliveryForm] = Form.useForm<DeliveryFormValues>();
  const provinceCode = Form.useWatch("provinceCode", deliveryForm);
  const cantonCode = Form.useWatch("cantonCode", deliveryForm);
  const wantsInvoice = Form.useWatch("wantsInvoice", deliveryForm);
  const invoiceIdType = Form.useWatch("invoiceIdType", deliveryForm);
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
          deliveryTitle: "Datos de entrega",
          deliveryCopy: "Ingresa una direccion precisa para consultar precio y tiempo con cada proveedor.",
          name: "Nombre de quien recibe",
          phone: "Telefono",
          email: "Correo electronico",
          emailInvalid: "Ingresa un correo valido.",
          consent: "Acepto que Slow Fit guarde mis datos de contacto y me envie novedades.",
          wantsInvoice: "Quiero factura electronica",
          invoiceIdType: "Tipo de identificacion",
          invoiceIdNumber: "Numero de identificacion",
          invoiceIdNumberHint: "Solo numeros, sin guiones.",
          invoiceIdInvalid: "El numero no coincide con el tipo de identificacion.",
          invoiceName: "Nombre o razon social",
          invoiceActivity: "Actividad economica (opcional)",
          invoiceActivityInvalid: "Usa el codigo de 4 a 6 digitos.",
          idPhysical: "Cedula fisica",
          idLegal: "Cedula juridica",
          idDimex: "DIMEX",
          idNite: "NITE",
          province: "Provincia",
          canton: "Canton",
          district: "Distrito",
          address: "Direccion exacta (senas)",
          addressExtra: "Apartamento, local o referencia adicional",
          notes: "Instrucciones para el repartidor",
          quote: "Cotizar entrega",
          quoteAgain: "Volver a cotizar",
          chooseDelivery: "Selecciona una entrega",
          providerUnavailable: "Algunos proveedores no ofrecieron cobertura para esta direccion.",
          required: "Este dato es requerido.",
          clear: "Vaciar",
          subtotal: "Subtotal",
        }
      : {
          cart: "Cart",
          empty: "Your cart is empty.",
          checkout: "Go to checkout",
          deliveryTitle: "Delivery details",
          deliveryCopy: "Enter a precise address to request price and timing from each provider.",
          name: "Recipient name",
          phone: "Phone",
          email: "Email",
          emailInvalid: "Enter a valid email.",
          consent: "I agree that Slow Fit stores my contact details and sends me updates.",
          wantsInvoice: "I want an electronic invoice",
          invoiceIdType: "ID type",
          invoiceIdNumber: "ID number",
          invoiceIdNumberHint: "Digits only, no dashes.",
          invoiceIdInvalid: "The number does not match the ID type.",
          invoiceName: "Name or company name",
          invoiceActivity: "Economic activity (optional)",
          invoiceActivityInvalid: "Use the 4 to 6 digit code.",
          idPhysical: "Individual ID (cedula fisica)",
          idLegal: "Company ID (cedula juridica)",
          idDimex: "DIMEX",
          idNite: "NITE",
          province: "Province",
          canton: "Canton",
          district: "District",
          address: "Exact address",
          addressExtra: "Apartment, suite, or additional reference",
          notes: "Courier instructions",
          quote: "Get delivery quotes",
          quoteAgain: "Quote again",
          chooseDelivery: "Choose a delivery",
          providerUnavailable: "Some providers did not offer coverage for this address.",
          required: "This field is required.",
          clear: "Clear",
          subtotal: "Subtotal",
        };

  const currency = lines[0]?.currencyCode ?? "CRC";
  const money = currencyFormatter(currency);
  const hasPreorderItems = lines.some((line) => line.preorder);

  const requestDeliveryQuotes = async (values: DeliveryFormValues) => {
    setQuoting(true);
    try {
      const payload = await apiRequest<{ quotes: DeliveryQuote[]; unavailable?: { provider: string }[] }>(
        "/api/delivery/quotes",
        {
          method: "POST",
          body: JSON.stringify({
            lines: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
            destination: {
              name: values.name,
              phone: values.phone,
              email: values.email,
              marketingConsent: values.marketingConsent,
              invoice: values.wantsInvoice ? {
                idType: values.invoiceIdType,
                idNumber: values.invoiceIdNumber,
                name: values.invoiceName,
                economicActivity: values.invoiceActivity,
              } : undefined,
              state: findProvince(values.provinceCode)?.name,
              city: findCanton(values.provinceCode, values.cantonCode)?.name,
              district: findDistrict(values.provinceCode, values.cantonCode, values.districtCode)?.name,
              postalCode: values.districtCode,
              streetAddress: values.streetAddress,
              addressLine2: values.addressLine2,
              notes: values.notes,
              country: "CR",
            },
          }),
        },
      );
      setQuotes(payload.quotes);
      setUnavailableProviders((payload.unavailable ?? []).map((item) => item.provider));
      setSelectedDeliveryId(payload.quotes[0]?.id);
    } catch (error) {
      api.error(formatApiError(error, locale, {
        fallback: locale === "es" ? "No fue posible cotizar la entrega" : "Could not quote delivery",
      }));
    } finally {
      setQuoting(false);
    }
  };

  const handleCheckout = async () => {
    if (!lines.length || submitting) {
      return;
    }
    if (hasPreorderItems) {
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

        trackEvent("begin_checkout", { totalItems, subtotal, currency, preorder: true });
        window.location.assign(checkoutUrl);
      } catch (error) {
        api.error(formatApiError(error, locale, {
          fallback: locale === "es" ? "No fue posible iniciar la preventa" : "Could not start preorder checkout",
        }));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!selectedDeliveryId) {
      setDeliveryOpen(true);
      return;
    }

    try {
      setSubmitting(true);
      const payload = await apiRequest<{ checkout?: { checkoutUrl: string; cartId: string } }>("/api/cart/checkout", {
        method: "POST",
        body: JSON.stringify({
          locale,
          cartId,
          deliveryId: selectedDeliveryId,
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

      setDeliveryOpen(false);
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
        aria-label={`${labels.cart} (${totalItems})`}
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
      <Modal
        title={labels.deliveryTitle}
        open={deliveryOpen}
        onCancel={() => setDeliveryOpen(false)}
        footer={quotes.length ? (
          <Space>
            <Button onClick={() => {
              setQuotes([]);
              setSelectedDeliveryId(undefined);
            }}>
              {labels.quoteAgain}
            </Button>
            <Button type="primary" loading={submitting} disabled={!selectedDeliveryId} onClick={handleCheckout}>
              {labels.checkout}
            </Button>
          </Space>
        ) : (
          <Button type="primary" htmlType="submit" form="slowfit-delivery-form" loading={quoting}>
            {labels.quote}
          </Button>
        )}
      >
        <Typography.Paragraph type="secondary">{labels.deliveryCopy}</Typography.Paragraph>
        {unavailableProviders.length ? <Alert type="warning" showIcon title={labels.providerUnavailable} /> : null}
        <Form
          id="slowfit-delivery-form"
          form={deliveryForm}
          layout="vertical"
          onFinish={requestDeliveryQuotes}
          requiredMark={false}
        >
          {!quotes.length ? (
            <>
              <Form.Item name="name" label={labels.name} rules={[{ required: true, message: labels.required }]}>
                <Input autoComplete="name" maxLength={100} />
              </Form.Item>
              <Form.Item name="phone" label={labels.phone} rules={[{ required: true, message: labels.required }]}>
                <Input type="tel" autoComplete="tel" placeholder="+506 8888 8888" maxLength={20} />
              </Form.Item>
              <Form.Item
                name="email"
                label={labels.email}
                rules={[
                  { required: true, message: labels.required },
                  { type: "email", message: labels.emailInvalid },
                ]}
              >
                <Input type="email" autoComplete="email" maxLength={254} />
              </Form.Item>
              <Form.Item name="marketingConsent" valuePropName="checked">
                <Checkbox>{labels.consent}</Checkbox>
              </Form.Item>
              <Form.Item name="wantsInvoice" valuePropName="checked">
                <Checkbox>{labels.wantsInvoice}</Checkbox>
              </Form.Item>
              {wantsInvoice ? (
                <>
                  <div className="slowfit-delivery-location-row">
                    <Form.Item name="invoiceIdType" label={labels.invoiceIdType} rules={[{ required: true, message: labels.required }]}>
                      <Select options={[
                        { value: "01", label: labels.idPhysical },
                        { value: "02", label: labels.idLegal },
                        { value: "03", label: labels.idDimex },
                        { value: "04", label: labels.idNite },
                      ]} />
                    </Form.Item>
                    <Form.Item
                      name="invoiceIdNumber"
                      label={labels.invoiceIdNumber}
                      extra={labels.invoiceIdNumberHint}
                      rules={[
                        { required: true, message: labels.required },
                        {
                          validator: (_rule, value?: string) => {
                            const digits = String(value ?? "").replace(/\D/g, "");
                            const allowed = invoiceIdType ? INVOICE_ID_LENGTHS[invoiceIdType] : undefined;
                            return !digits || !allowed || allowed.includes(digits.length)
                              ? Promise.resolve()
                              : Promise.reject(new Error(labels.invoiceIdInvalid));
                          },
                        },
                      ]}
                    >
                      <Input inputMode="numeric" maxLength={14} />
                    </Form.Item>
                  </div>
                  <Form.Item name="invoiceName" label={labels.invoiceName} rules={[{ required: true, message: labels.required }]}>
                    <Input maxLength={100} />
                  </Form.Item>
                  <Form.Item
                    name="invoiceActivity"
                    label={labels.invoiceActivity}
                    rules={[{ pattern: /^\s*\d{4,6}\s*$/, message: labels.invoiceActivityInvalid }]}
                  >
                    <Input inputMode="numeric" maxLength={6} />
                  </Form.Item>
                </>
              ) : null}
              <Form.Item name="provinceCode" label={labels.province} rules={[{ required: true, message: labels.required }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={crProvinces.map((province) => ({ value: province.code, label: province.name }))}
                  onChange={() => deliveryForm.setFieldsValue({ cantonCode: undefined, districtCode: undefined })}
                />
              </Form.Item>
              <div className="slowfit-delivery-location-row">
                <Form.Item name="cantonCode" label={labels.canton} rules={[{ required: true, message: labels.required }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    disabled={!provinceCode}
                    options={(findProvince(provinceCode)?.cantons ?? []).map((canton) => ({ value: canton.code, label: canton.name }))}
                    onChange={() => deliveryForm.setFieldsValue({ districtCode: undefined })}
                  />
                </Form.Item>
                <Form.Item name="districtCode" label={labels.district} rules={[{ required: true, message: labels.required }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    disabled={!cantonCode}
                    options={(findCanton(provinceCode, cantonCode)?.districts ?? []).map((district) => ({ value: district.code, label: district.name }))}
                  />
                </Form.Item>
              </div>
              <Form.Item name="streetAddress" label={labels.address} rules={[{ required: true, message: labels.required }]}>
                <Input.TextArea autoComplete="street-address" maxLength={200} rows={2} />
              </Form.Item>
              <Form.Item name="addressLine2" label={labels.addressExtra}>
                <Input maxLength={120} />
              </Form.Item>
              <Form.Item name="notes" label={labels.notes}>
                <Input.TextArea maxLength={500} rows={2} />
              </Form.Item>
            </>
          ) : (
            <Form.Item label={labels.chooseDelivery}>
              <Radio.Group
                className="slowfit-delivery-quotes"
                value={selectedDeliveryId}
                onChange={(event) => setSelectedDeliveryId(event.target.value)}
              >
                {quotes.map((quote) => (
                  <Radio.Button key={quote.id} value={quote.id}>
                    <strong>{quote.label}</strong>
                    <span>{currencyFormatter(quote.currency).format(quote.feeMinor / 100)}</span>
                    {quote.dropoffEta ? <small>{new Date(quote.dropoffEta).toLocaleString(locale === "es" ? "es-CR" : "en-US")}</small> : null}
                  </Radio.Button>
                ))}
              </Radio.Group>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}

// Digit counts per Hacienda identification type; the backend enforces the same table.
const INVOICE_ID_LENGTHS: Record<string, number[]> = { "01": [9], "02": [10], "03": [11, 12], "04": [10] };

type DeliveryFormValues = {
  name: string;
  phone: string;
  email: string;
  marketingConsent?: boolean;
  wantsInvoice?: boolean;
  invoiceIdType?: string;
  invoiceIdNumber?: string;
  invoiceName?: string;
  invoiceActivity?: string;
  provinceCode: string;
  cantonCode: string;
  districtCode: string;
  streetAddress: string;
  addressLine2?: string;
  notes?: string;
};

type DeliveryQuote = {
  id: string;
  provider: "uber" | "didi";
  label: string;
  feeMinor: number;
  currency: string;
  expiresAt: string;
  dropoffEta?: string | null;
};
