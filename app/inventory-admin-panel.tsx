"use client";

import { DollarOutlined, HistoryOutlined, SettingOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import {
  Button, Card, Col, DatePicker, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Row, Select,
  Space, Statistic, Table, Tag, Typography, message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import AdminShell from "./admin-shell";
import { apiRequest, formatApiError, isApiErrorStatus } from "./lib/api-client";

const SIZES = ["S", "M", "L", "XL", "OS"] as const;
type Size = (typeof SIZES)[number];
type SizeMap = Record<Size, number>;

type Cost = {
  paidInvestmentUsd: number;
  totalInventoryCostCrc: number | null;
  costPerUnitCrc: number | null;
  salePriceCrc: number | null;
  contributionPerUnitCrc: number | null;
  contributionMargin: number | null;
};
type Line = {
  id: string;
  code: string;
  productName: string;
  color: string;
  sizes: SizeMap;
  remaining: SizeMap;
  soldQuantity: number;
  remainingQuantity: number;
  unitPriceUsd: number;
  piecesPerGarment: number;
  cost: Cost;
};
type Settings = Record<string, number | null>;
type View = {
  settings: Settings;
  crReady: boolean;
  lines: Line[];
  totals: {
    quantity: number;
    paidInvestmentUsd: number;
    totalInventoryCostCrc: number | null;
    expectedSalesCrc: number | null;
    totalContributionCrc: number | null;
    contributionMargin: number | null;
  };
  paymentMethods: Array<{ id: string; name: string; active: boolean }>;
};
type SaleRow = {
  id: string;
  size: string;
  quantity: number;
  unitPriceCrc: string;
  discountCrc: string;
  soldAt: string;
  paymentMethod: string;
  source: string;
  note: string;
  voidedAt: string | null;
  line: { code: string; productName: string; color: string };
};
type SaleForm = { size: Size; quantity: number; unitPriceCrc: number; discountCrc: number; soldAt: dayjs.Dayjs; paymentMethod: string; note?: string };

const SETTING_FIELDS: Array<{ key: string; es: string; en: string }> = [
  { key: "fxRate", es: "Tipo de cambio CRC/USD", en: "Exchange rate CRC/USD" },
  { key: "hkShippingUsd", es: "Envio HK USD", en: "HK shipping USD" },
  { key: "invoiceAdjustmentUsd", es: "Ajuste pago/factura USD", en: "Payment/invoice adjustment USD" },
  { key: "crShippingUsd", es: "Envio CR USD", en: "CR shipping USD" },
  { key: "nationalizationCrc", es: "Nacionalizacion CRC", en: "Customs clearance CRC" },
  { key: "otherImportCrc", es: "Otros de importacion CRC", en: "Other import costs CRC" },
  { key: "extraUnitCrc", es: "Extra por prenda CRC", en: "Extra per unit CRC" },
  { key: "cardCommissionRate", es: "Comision tarjeta (0.0195 = 1.95%)", en: "Card commission (0.0195 = 1.95%)" },
  { key: "customizationPerPieceUsd", es: "Personalizacion por pieza USD", en: "Customization per piece USD" },
];

export default function InventoryAdminPanel({ locale }: { locale: "es" | "en" }) {
  const [api, contextHolder] = message.useMessage();
  const [settingsForm] = Form.useForm<Settings>();
  const [saleForm] = Form.useForm<SaleForm>();
  const [sessionReady, setSessionReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saleLine, setSaleLine] = useState<Line | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sales, setSales] = useState<SaleRow[]>([]);

  const es = locale === "es";
  const labels = useMemo(() => es ? {
    title: "Inventario y costos",
    subtitle: "Precios, costos de importacion, existencias y ventas por prenda, color y talla.",
    search: "Buscar codigo, producto o color",
    settings: "Supuestos de costo",
    history: "Historial de ventas",
    code: "Codigo", product: "Producto", color: "Color", stock: "Disponible por talla", unitUsd: "Costo USD",
    costCrc: "Costo/prenda CRC", price: "Precio venta CRC", margin: "Margen", sold: "Vendidas", left: "Quedan",
    sell: "Vender", save: "Guardar", cancel: "Cancelar", actions: "Acciones",
    investment: "Inversion total CRC", expected: "Venta esperada CRC", contribution: "Contribucion esperada CRC", units: "Prendas",
    pending: "Pendiente (completa los supuestos de importacion)",
    saleTitle: "Registrar venta", size: "Talla", quantity: "Cantidad", unitPrice: "Precio unitario CRC",
    discount: "Descuento total CRC", date: "Fecha", method: "Metodo de pago", note: "Nota",
    required: "Obligatorio", saved: "Guardado.", saleSaved: "Venta registrada.", voided: "Venta anulada.",
    void: "Anular", voidConfirm: "Anular esta venta y devolver el inventario?", status: "Estado", active: "Activa", voidedTag: "Anulada",
    total: "Total", loadFail: "No pudimos cargar el inventario.", saveFail: "No pudimos guardar los cambios.",
  } : {
    title: "Inventory & costs",
    subtitle: "Prices, import costs, stock and sales by garment, color and size.",
    search: "Search code, product or color",
    settings: "Cost assumptions",
    history: "Sales history",
    code: "Code", product: "Product", color: "Color", stock: "Available by size", unitUsd: "Cost USD",
    costCrc: "Cost/unit CRC", price: "Sale price CRC", margin: "Margin", sold: "Sold", left: "Left",
    sell: "Sell", save: "Save", cancel: "Cancel", actions: "Actions",
    investment: "Total investment CRC", expected: "Expected sales CRC", contribution: "Expected contribution CRC", units: "Units",
    pending: "Pending (complete the import assumptions)",
    saleTitle: "Record sale", size: "Size", quantity: "Quantity", unitPrice: "Unit price CRC",
    discount: "Total discount CRC", date: "Date", method: "Payment method", note: "Note",
    required: "Required", saved: "Saved.", saleSaved: "Sale recorded.", voided: "Sale voided.",
    void: "Void", voidConfirm: "Void this sale and restore stock?", status: "Status", active: "Active", voidedTag: "Voided",
    total: "Total", loadFail: "We could not load the inventory.", saveFail: "We could not save the changes.",
  }, [es]);

  const crc = useMemo(() => new Intl.NumberFormat(es ? "es-CR" : "en-US", { style: "currency", currency: "CRC", maximumFractionDigits: 0 }), [es]);
  const money = (value: number | null | undefined) => (value === null || value === undefined ? "-" : crc.format(value));

  const handleError = (error: unknown, fallback: string) => {
    if (isApiErrorStatus(error, 401)) {
      setAuthorized(false);
      return;
    }
    api.error(formatApiError(error, locale, { fallback }));
  };

  const load = async () => {
    setLoading(true);
    try {
      const payload = await apiRequest<View>("/api/admin/inventory", { cache: "no-store" });
      setView(payload);
      setAuthorized(true);
    } catch (error) {
      if (isApiErrorStatus(error, 401)) setAuthorized(false);
      else api.error(formatApiError(error, locale, { fallback: labels.loadFail }));
    } finally {
      setLoading(false);
      setSessionReady(true);
    }
  };

  const loadInitial = useEffectEvent(() => load());
  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInitial(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const onLogin = async (credentials: { token?: string; email?: string; password?: string; otp?: string }) => {
    setLoginLoading(true);
    try {
      await apiRequest("/api/admin/login", { method: "POST", body: JSON.stringify(credentials) });
      await load();
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
    setView(null);
  };

  const mutate = async (path: string, method: string, body: unknown, success: string) => {
    try {
      const payload = await apiRequest<View>(path, { method, body: JSON.stringify(body) });
      setView(payload);
      api.success(success);
      return true;
    } catch (error) {
      handleError(error, labels.saveFail);
      return false;
    }
  };

  const updatePrice = (line: Line, value: number | null) => {
    if (value === line.cost.salePriceCrc) return;
    void mutate(`/api/admin/inventory/lines/${line.id}`, "PATCH", { salePriceCrc: value }, labels.saved);
  };

  const openSettings = () => {
    settingsForm.setFieldsValue(view?.settings ?? {});
    setSettingsOpen(true);
  };

  const saveSettings = async (values: Settings) => {
    if (await mutate("/api/admin/inventory/settings", "PUT", values, labels.saved)) setSettingsOpen(false);
  };

  const openSale = (line: Line) => {
    setSaleLine(line);
    const firstSize = SIZES.find((size) => line.remaining[size] > 0) ?? "M";
    saleForm.setFieldsValue({
      size: firstSize,
      quantity: 1,
      unitPriceCrc: line.cost.salePriceCrc ?? 0,
      discountCrc: 0,
      soldAt: dayjs(),
      paymentMethod: view?.paymentMethods.find((method) => method.active)?.name,
      note: "",
    });
  };

  const submitSale = async (values: SaleForm) => {
    if (!saleLine) return;
    const ok = await mutate("/api/admin/inventory/sales", "POST", {
      ...values,
      lineId: saleLine.id,
      soldAt: values.soldAt.toISOString(),
    }, labels.saleSaved);
    if (ok) setSaleLine(null);
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    try {
      const payload = await apiRequest<{ sales: SaleRow[] }>("/api/admin/inventory/sales", { cache: "no-store" });
      setSales(payload.sales);
    } catch (error) {
      handleError(error, labels.loadFail);
    }
  };

  const voidSale = async (saleId: string) => {
    try {
      setView(await apiRequest<View>(`/api/admin/inventory/sales/${saleId}/void`, { method: "POST" }));
      api.success(labels.voided);
      const payload = await apiRequest<{ sales: SaleRow[] }>("/api/admin/inventory/sales", { cache: "no-store" });
      setSales(payload.sales);
    } catch (error) {
      handleError(error, labels.saveFail);
    }
  };

  const lines = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (view?.lines ?? []).filter((line) => !term || `${line.code} ${line.productName} ${line.color}`.toLowerCase().includes(term));
  }, [view, search]);

  const columns: ColumnsType<Line> = [
    { title: labels.code, dataIndex: "code", sorter: (a, b) => a.code.localeCompare(b.code), width: 150 },
    { title: labels.product, dataIndex: "productName", sorter: (a, b) => a.productName.localeCompare(b.productName) },
    { title: labels.color, dataIndex: "color" },
    {
      title: labels.stock,
      render: (_, line) => (
        <Space size={4} wrap>
          {SIZES.filter((size) => line.sizes[size] > 0).map((size) => (
            <Tag key={size} color={line.remaining[size] > 0 ? "green" : "default"}>{size}: {line.remaining[size]}/{line.sizes[size]}</Tag>
          ))}
        </Space>
      ),
    },
    { title: labels.left, dataIndex: "remainingQuantity", align: "right", sorter: (a, b) => a.remainingQuantity - b.remainingQuantity },
    { title: labels.sold, dataIndex: "soldQuantity", align: "right", sorter: (a, b) => a.soldQuantity - b.soldQuantity },
    { title: labels.unitUsd, dataIndex: "unitPriceUsd", align: "right", render: (value: number) => `$${value.toFixed(2)}` },
    {
      title: labels.costCrc,
      align: "right",
      sorter: (a, b) => (a.cost.costPerUnitCrc ?? 0) - (b.cost.costPerUnitCrc ?? 0),
      render: (_, line) => money(line.cost.costPerUnitCrc),
    },
    {
      title: labels.price,
      align: "right",
      width: 150,
      render: (_, line) => (
        <InputNumber
          key={`${line.id}-${line.cost.salePriceCrc}`}
          min={0}
          step={50}
          style={{ width: 120 }}
          defaultValue={line.cost.salePriceCrc ?? undefined}
          onBlur={(event) => {
            const raw = event.target.value.replace(/[^\d.]/g, "");
            updatePrice(line, raw === "" ? null : Number(raw));
          }}
          onPressEnter={(event) => (event.target as HTMLInputElement).blur()}
        />
      ),
    },
    {
      title: labels.margin,
      align: "right",
      sorter: (a, b) => (a.cost.contributionMargin ?? -1) - (b.cost.contributionMargin ?? -1),
      render: (_, line) => (line.cost.contributionMargin === null ? "-" : `${(line.cost.contributionMargin * 100).toFixed(1)}%`),
    },
    {
      title: labels.actions,
      fixed: "right",
      render: (_, line) => (
        <Button size="small" icon={<ShoppingCartOutlined />} disabled={line.remainingQuantity < 1} onClick={() => openSale(line)}>{labels.sell}</Button>
      ),
    },
  ];

  const totals = view?.totals;
  const saleColumns: ColumnsType<SaleRow> = [
    { title: labels.date, dataIndex: "soldAt", render: (value: string) => dayjs(value).format("YYYY-MM-DD") },
    { title: labels.product, render: (_, row) => `${row.line.code} ${row.line.color} (${row.size})` },
    { title: labels.quantity, dataIndex: "quantity", align: "right" },
    { title: labels.total, align: "right", render: (_, row) => money(Number(row.unitPriceCrc) * row.quantity - Number(row.discountCrc)) },
    { title: labels.method, dataIndex: "paymentMethod" },
    { title: labels.status, render: (_, row) => <Tag color={row.voidedAt ? "red" : "green"}>{row.voidedAt ? labels.voidedTag : labels.active}</Tag> },
    {
      title: labels.actions,
      render: (_, row) => row.voidedAt ? null : (
        <Popconfirm title={labels.voidConfirm} okText={labels.void} cancelText={labels.cancel} onConfirm={() => void voidSale(row.id)}>
          <Button size="small" danger>{labels.void}</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <AdminShell locale={locale} title={labels.title} subtitle={labels.subtitle}
        sessionReady={sessionReady} authorized={authorized} loginLoading={loginLoading}
        onLogin={onLogin} onLogout={onLogout}>
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={12} md={6}><Card><Statistic title={labels.units} value={totals?.quantity ?? 0} /></Card></Col>
          <Col xs={12} md={6}><Card><Statistic title={labels.investment} value={totals?.totalInventoryCostCrc == null ? labels.pending : money(totals.totalInventoryCostCrc)} /></Card></Col>
          <Col xs={12} md={6}><Card><Statistic title={labels.expected} value={totals?.expectedSalesCrc == null ? "-" : money(totals.expectedSalesCrc)} /></Card></Col>
          <Col xs={12} md={6}><Card><Statistic title={labels.contribution} value={totals?.totalContributionCrc == null ? "-" : money(totals.totalContributionCrc)} /></Card></Col>
        </Row>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search allowClear placeholder={labels.search} value={search} onChange={(event) => setSearch(event.target.value)} style={{ minWidth: 300 }} />
          <Button icon={<SettingOutlined />} onClick={openSettings}>{labels.settings}</Button>
          <Button icon={<HistoryOutlined />} onClick={() => void openHistory()}>{labels.history}</Button>
        </Space>
        <Table<Line> rowKey="id" size="small" loading={loading} columns={columns} dataSource={lines}
          pagination={{ pageSize: 25, showSizeChanger: false }} scroll={{ x: 1200 }} />

        <Drawer title={labels.settings} open={settingsOpen} onClose={() => setSettingsOpen(false)} size="min(92vw, 420px)">
          <Form form={settingsForm} layout="vertical" onFinish={(values) => void saveSettings(values)}>
            {SETTING_FIELDS.map((field) => (
              <Form.Item key={field.key} name={field.key} label={es ? field.es : field.en}>
                <InputNumber min={0} style={{ width: "100%" }} prefix={<DollarOutlined />} />
              </Form.Item>
            ))}
            <Button type="primary" htmlType="submit">{labels.save}</Button>
          </Form>
        </Drawer>

        <Modal title={saleLine ? `${labels.saleTitle}: ${saleLine.code} ${saleLine.color}` : labels.saleTitle} open={Boolean(saleLine)}
          onCancel={() => setSaleLine(null)} okText={labels.save} cancelText={labels.cancel} onOk={() => saleForm.submit()} destroyOnHidden forceRender>
          <Form form={saleForm} layout="vertical" onFinish={(values) => void submitSale(values)}>
            <Form.Item name="size" label={labels.size} rules={[{ required: true, message: labels.required }]}>
              <Select options={SIZES.map((size) => ({ value: size, label: `${size} (${saleLine?.remaining[size] ?? 0})`, disabled: (saleLine?.remaining[size] ?? 0) < 1 }))} />
            </Form.Item>
            <Form.Item name="quantity" label={labels.quantity} rules={[{ required: true, message: labels.required }]}>
              <InputNumber min={1} precision={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="unitPriceCrc" label={labels.unitPrice} rules={[{ required: true, message: labels.required }]}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="discountCrc" label={labels.discount}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="soldAt" label={labels.date} rules={[{ required: true, message: labels.required }]}>
              <DatePicker style={{ width: "100%" }} disabledDate={(date) => date.isAfter(dayjs(), "day")} />
            </Form.Item>
            <Form.Item name="paymentMethod" label={labels.method} rules={[{ required: true, message: labels.required }]}>
              <Select options={(view?.paymentMethods ?? []).filter((method) => method.active).map((method) => ({ value: method.name, label: method.name }))} />
            </Form.Item>
            <Form.Item name="note" label={labels.note}>
              <Input.TextArea rows={2} maxLength={500} />
            </Form.Item>
          </Form>
        </Modal>

        <Drawer title={labels.history} open={historyOpen} onClose={() => setHistoryOpen(false)} size="min(96vw, 820px)">
          {sales.length === 0 ? <Typography.Text type="secondary">-</Typography.Text> : null}
          <Table<SaleRow> rowKey="id" size="small" columns={saleColumns} dataSource={sales} pagination={{ pageSize: 15, showSizeChanger: false }} />
        </Drawer>
      </AdminShell>
    </>
  );
}
