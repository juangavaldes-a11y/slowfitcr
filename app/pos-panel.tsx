"use client";

import { CameraOutlined, CarOutlined, DeleteOutlined, LinkOutlined, PrinterOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { Button, Card, Col, Empty, Input, InputNumber, Modal, Row, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import AdminShell from "./admin-shell";
import BarcodeScanner, { cameraScanSupported } from "./barcode-scanner";
import PosShippingGuide from "./pos-shipping-guide";
import { apiRequest, formatApiError, isApiErrorStatus } from "./lib/api-client";
import { addToCart, cartTotals, checkoutBody, lineTotal, looksLikeCode, setDiscount, setQuantity, type CartLine, type SellableVariant } from "./lib/pos-cart";
import { receiptHtml, type PosReceipt } from "./lib/pos-receipt";

// Loyverse sends X-Frame-Options: sameorigin on its login, so it cannot be embedded; its back office opens in its own tab.
const LOYVERSE_BACK_OFFICE_URL = "https://r.loyverse.com/dashboard/";

type CatalogVariant = { id?: string; title: string; size?: string | null; color?: string | null; sku?: string | null; price: number; inventoryQuantity: number };
type CatalogProduct = { id: string; title: string; variants: CatalogVariant[] };
type LookupResult = { variantId: string; sku: string; productTitle: string; size: string; color: string; price: number; inventoryQuantity: number };

export default function PosPanel({ locale }: { locale: "es" | "en" }) {
  const [api, contextHolder] = message.useMessage();
  const [sessionReady, setSessionReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string | undefined>();
  const [checkingOut, setCheckingOut] = useState(false);
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const es = locale === "es";
  const money = useMemo(() => new Intl.NumberFormat(es ? "es-CR" : "en-US", { style: "currency", currency: "CRC", maximumFractionDigits: 0 }), [es]);

  const labels = useMemo(() => es ? {
    title: "Punto de venta",
    subtitle: "Ventas en tienda con lector de código de barras, sincronizadas con el inventario del sitio.",
    search: "Escanea el código o busca por nombre",
    scan: "Cámara",
    cartTitle: "Venta actual",
    emptyCart: "Escanea o busca un producto para empezar la venta.",
    emptyResults: "Sin resultados",
    product: "Producto", qty: "Cant.", price: "Precio", discount: "Desc.", total: "Total", remove: "Quitar",
    stock: "disp.", payment: "Forma de pago", charge: "Cobrar", units: "unidades", subtotal: "Subtotal", discountTotal: "Descuento",
    notFound: "No encontramos ese código.", outOfStock: "Sin existencias.", limit: "No hay más existencias de esa variante.",
    sold: "Venta registrada", print: "Imprimir comprobante", close: "Cerrar", openLoyverse: "Abrir Loyverse", guide: "Crear guía de Correos de CR",
    noCamera: "La cámara no está disponible en este navegador; usa un lector USB o escribe el código.",
    selectPayment: "Elige la forma de pago.",
  } : {
    title: "Point of sale",
    subtitle: "In-store sales with a barcode scanner, kept in sync with the site inventory.",
    search: "Scan the code or search by name",
    scan: "Camera",
    cartTitle: "Current sale",
    emptyCart: "Scan or search a product to start the sale.",
    emptyResults: "No results",
    product: "Product", qty: "Qty", price: "Price", discount: "Disc.", total: "Total", remove: "Remove",
    stock: "left", payment: "Payment method", charge: "Charge", units: "units", subtotal: "Subtotal", discountTotal: "Discount",
    notFound: "We could not find that code.", outOfStock: "Out of stock.", limit: "No more stock for that variant.",
    sold: "Sale recorded", print: "Print receipt", close: "Close", openLoyverse: "Open Loyverse", guide: "Create Correos de CR guide",
    noCamera: "The camera is not available in this browser; use a USB scanner or type the code.",
    selectPayment: "Choose a payment method.",
  }, [es]);

  const totals = cartTotals(cart);

  const checkSession = useCallback(async () => {
    try {
      const session = await apiRequest<{ authenticated: boolean }>("/api/admin/session", { cache: "no-store" });
      setAuthorized(session.authenticated);
      if (session.authenticated) {
        const view = await apiRequest<{ paymentMethods: Array<{ name: string; active: boolean }> }>("/api/admin/inventory", { cache: "no-store" });
        const names = view.paymentMethods.filter((method) => method.active).map((method) => method.name);
        setPaymentMethods(names);
        setPaymentMethod((current) => current ?? names[0]);
      }
    } catch {
      setAuthorized(false);
    } finally {
      setSessionReady(true);
    }
  }, []);

  const checkInitial = useEffectEvent(() => checkSession());
  useEffect(() => {
    const timeout = window.setTimeout(() => void checkInitial(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const onLogin = async (credentials: { token?: string; email?: string; password?: string; otp?: string }) => {
    setLoginLoading(true);
    try {
      await apiRequest("/api/admin/login", { method: "POST", body: JSON.stringify(credentials) });
      await checkSession();
    } catch (error) {
      api.error(formatApiError(error, locale, { preserveClientMessage: false }));
    } finally {
      setLoginLoading(false);
      setSessionReady(true);
    }
  };

  const onLogout = async () => {
    await apiRequest("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    setAuthorized(false);
  };

  const addVariant = useCallback((variant: SellableVariant) => {
    setCart((current) => {
      const result = addToCart(current, variant);
      if (result.status === "out_of_stock") api.warning(labels.outOfStock);
      if (result.status === "limit_reached") api.warning(labels.limit);
      return result.cart;
    });
    searchRef.current?.focus();
  }, [api, labels.limit, labels.outOfStock]);

  const lookupCode = useCallback(async (code: string) => {
    try {
      const found = await apiRequest<LookupResult>(`/api/admin/pos/lookup?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      addVariant({ variantId: found.variantId, sku: found.sku, name: found.productTitle, color: found.color, size: found.size, unitPriceCrc: found.price, stock: found.inventoryQuantity });
      return true;
    } catch (error) {
      if (isApiErrorStatus(error, 404)) api.warning(labels.notFound);
      else api.error(formatApiError(error, locale));
      return false;
    }
  }, [addVariant, api, labels.notFound, locale]);

  const searchProducts = async (text: string) => {
    setSearching(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "24", status: "ACTIVE", search: text });
      const payload = await apiRequest<{ products: CatalogProduct[] }>(`/api/admin/catalog/products?${params}`, { cache: "no-store" });
      setResults(payload.products);
    } catch (error) {
      api.error(formatApiError(error, locale));
    } finally {
      setSearching(false);
    }
  };

  const onSubmit = async (value: string) => {
    const text = value.trim();
    if (!text) return;
    if (looksLikeCode(text)) {
      setQuery("");
      if (await lookupCode(text)) return;
      setQuery(text);
    }
    await searchProducts(text);
  };

  const onCameraCode = useCallback((code: string) => { void lookupCode(code); }, [lookupCode]);

  const charge = async () => {
    if (!paymentMethod) { api.warning(labels.selectPayment); return; }
    setCheckingOut(true);
    try {
      const done = await apiRequest<PosReceipt>("/api/admin/pos/checkout", { method: "POST", body: JSON.stringify(checkoutBody(cart, paymentMethod)) });
      setReceipt(done);
      setCart([]);
      setResults([]);
      api.success(labels.sold);
    } catch (error) {
      api.error(formatApiError(error, locale));
    } finally {
      setCheckingOut(false);
    }
  };

  const printReceipt = () => {
    if (!receipt) return;
    const popup = window.open("", "_blank", "width=420,height=640");
    if (!popup) return;
    popup.document.write(receiptHtml(receipt, locale));
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const columns: ColumnsType<CartLine> = [
    { title: labels.product, key: "product", render: (_, line) => (<><div>{line.name}</div><Typography.Text type="secondary">{line.color} · {line.size} · {line.sku}</Typography.Text></>) },
    { title: labels.qty, key: "qty", width: 90, render: (_, line) => (<InputNumber size="small" min={0} max={line.maxQuantity} value={line.quantity} onChange={(value) => setCart((current) => setQuantity(current, line.variantId, Number(value ?? 0)))} />) },
    { title: labels.price, key: "price", width: 100, render: (_, line) => money.format(line.unitPriceCrc) },
    { title: labels.discount, key: "discount", width: 110, render: (_, line) => (<InputNumber size="small" min={0} value={line.discountCrc} onChange={(value) => setCart((current) => setDiscount(current, line.variantId, Number(value ?? 0)))} />) },
    { title: labels.total, key: "total", width: 110, render: (_, line) => money.format(lineTotal(line)) },
    { key: "remove", width: 44, render: (_, line) => (<Button type="text" danger aria-label={labels.remove} icon={<DeleteOutlined />} onClick={() => setCart((current) => setQuantity(current, line.variantId, 0))} />) },
  ];

  return (
    <>
      {contextHolder}
      <AdminShell locale={locale} title={labels.title} subtitle={labels.subtitle}
        sessionReady={sessionReady} authorized={authorized} loginLoading={loginLoading}
        onLogin={onLogin} onLogout={onLogout}>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={11}>
            <Card>
              <Space.Compact style={{ width: "100%" }}>
                <Input.Search
                  ref={searchRef as never}
                  autoFocus
                  size="large"
                  allowClear
                  placeholder={labels.search}
                  value={query}
                  loading={searching}
                  onChange={(event) => setQuery(event.target.value)}
                  onSearch={(value) => void onSubmit(value)}
                  data-testid="pos-search"
                />
                <Button size="large" icon={<CameraOutlined />} onClick={() => (cameraScanSupported() ? setScannerOpen(true) : api.info(labels.noCamera))}>{labels.scan}</Button>
              </Space.Compact>
              <div style={{ marginTop: 16 }}>
                {results.length ? results.map((product) => (
                  <Card key={product.id} size="small" title={product.title} style={{ marginBottom: 8 }}>
                    <Space wrap>
                      {product.variants.map((variant) => (
                        <Button key={variant.id ?? variant.title} size="small" disabled={!variant.id || variant.inventoryQuantity < 1}
                          onClick={() => variant.id && addVariant({ variantId: variant.id, sku: variant.sku ?? "", name: product.title, color: variant.color ?? "", size: variant.size ?? "", unitPriceCrc: variant.price, stock: variant.inventoryQuantity })}>
                          {variant.color} · {variant.size} <Tag style={{ marginInlineEnd: 0 }}>{variant.inventoryQuantity} {labels.stock}</Tag>
                        </Button>
                      ))}
                    </Space>
                  </Card>
                )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={searching ? "…" : labels.emptyResults} />}
              </div>
              <Typography.Link href={LOYVERSE_BACK_OFFICE_URL} target="_blank" rel="noopener noreferrer"><LinkOutlined /> {labels.openLoyverse}</Typography.Link>
            </Card>
          </Col>
          <Col xs={24} lg={13}>
            <Card title={<><ShoppingCartOutlined /> {labels.cartTitle}</>}>
              {cart.length ? (
                <Table<CartLine> size="small" rowKey="variantId" columns={columns} dataSource={cart} pagination={false} scroll={{ x: true }} />
              ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={labels.emptyCart} />}
              <div style={{ marginTop: 16, textAlign: "right" }}>
                <div>{labels.subtotal}: {money.format(totals.subtotalCrc)} ({totals.units} {labels.units})</div>
                {totals.discountCrc ? <div>{labels.discountTotal}: -{money.format(totals.discountCrc)}</div> : null}
                <Typography.Title level={3} style={{ margin: "4px 0 12px" }}>{money.format(totals.totalCrc)}</Typography.Title>
                <Space>
                  <Select style={{ minWidth: 180 }} placeholder={labels.payment} value={paymentMethod} onChange={setPaymentMethod}
                    options={paymentMethods.map((name) => ({ value: name, label: name }))} />
                  <Button type="primary" size="large" disabled={!cart.length} loading={checkingOut} onClick={() => void charge()} data-testid="pos-charge">{labels.charge}</Button>
                </Space>
              </div>
            </Card>
          </Col>
        </Row>
        <BarcodeScanner open={scannerOpen} locale={locale} onClose={() => setScannerOpen(false)} onDetect={onCameraCode} />
        <Modal open={Boolean(receipt)} title={labels.sold} onCancel={() => setReceipt(null)}
          footer={[<Button key="print" type="primary" icon={<PrinterOutlined />} onClick={printReceipt}>{labels.print}</Button>, <Button key="guide" icon={<CarOutlined />} onClick={() => setGuideOpen(true)}>{labels.guide}</Button>, <Button key="close" onClick={() => setReceipt(null)}>{labels.close}</Button>]}>
          {receipt ? (<><Typography.Paragraph strong>{receipt.receipt}</Typography.Paragraph><Typography.Title level={3}>{money.format(receipt.totalCrc)}</Typography.Title><Typography.Text type="secondary">{receipt.paymentMethod}</Typography.Text></>) : null}
        </Modal>
        <PosShippingGuide open={guideOpen} locale={locale} receipt={receipt} onClose={() => setGuideOpen(false)} />
      </AdminShell>
    </>
  );
}
