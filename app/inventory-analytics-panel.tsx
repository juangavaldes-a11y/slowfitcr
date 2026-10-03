"use client";

import { Alert, Card, Col, Empty, Row, Segmented, Space, Statistic, Table, Tag, Typography, message } from "antd";
import dynamic from "next/dynamic";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import AdminShell from "./admin-shell";
import { apiRequest, formatApiError, isApiErrorStatus } from "./lib/api-client";

const Line = dynamic(() => import("@ant-design/charts").then((module) => module.Line), { ssr: false });
const Column = dynamic(() => import("@ant-design/charts").then((module) => module.Column), { ssr: false });
const Bar = dynamic(() => import("@ant-design/charts").then((module) => module.Bar), { ssr: false });

type Scenario = {
  name: "worst" | "base" | "best";
  weeklyRevenue: number;
  weeksToPayback: number | null;
  paybackDate: string | null;
  roiAtSellOut: number | null;
  curve: Array<{ week: number; date: string; recovered: number }>;
};
type Analytics = {
  crReady: boolean;
  totals: {
    units: number; revenue: number; commission: number; cost: number; profit: number; netRevenue: number;
    invested: number; recoveredPct: number | null; roi: number | null; remainingUnits: number;
    remainingCost: number; remainingNetRevenue: number;
  };
  daily: Array<{ date: string; units: number; revenue: number; profit: number; cumulativeNetRevenue: number; cumulativeProfit: number }>;
  byMethod: Array<{ method: string; units: number; revenue: number }>;
  byProduct: Array<{ product: string; units: number; revenue: number; profit: number }>;
  projection: { scenarios: Scenario[]; weeksOfHistory: number };
};

export default function InventoryAnalyticsPanel({ locale }: { locale: "es" | "en" }) {
  const [api, contextHolder] = message.useMessage();
  const [sessionReady, setSessionReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [data, setData] = useState<Analytics | null>(null);
  const [range, setRange] = useState<"30" | "90" | "all">("all");
  const es = locale === "es";

  const labels = useMemo(() => es ? {
    title: "Ventas y proyecciones",
    subtitle: "Ventas, margen, recuperacion de la inversion y proyecciones de retorno.",
    revenue: "Ingresos", profit: "Utilidad", units: "Prendas vendidas", invested: "Inversion", recovered: "Recuperado",
    roi: "ROI actual", remaining: "Inventario restante (a precio, neto)", range30: "30 dias", range90: "90 dias", all: "Todo",
    salesOverTime: "Ingresos diarios", cumulative: "Utilidad acumulada", byMethod: "Ventas por metodo de pago", byProduct: "Mejores productos",
    projection: "Proyeccion de recuperacion", scenario: "Escenario", worst: "Pesimista", base: "Base", best: "Optimista",
    weekly: "Ingreso semanal", payback: "Fecha de recuperacion", weeks: "Semanas", roiEnd: "ROI al agotar inventario",
    never: "No alcanza con el inventario actual", noSales: "Aun no hay ventas registradas.", pending: "Completa los supuestos de importacion para calcular la inversion.",
    thinData: "Hay menos de 4 semanas de historial: los escenarios usan estimaciones amplias.",
    investedLine: "Inversion", date: "Fecha", amount: "CRC", product: "Producto", method: "Metodo", scenarioKey: "Escenario",
  } : {
    title: "Sales & projections",
    subtitle: "Sales, margin, investment recovery and return projections.",
    revenue: "Revenue", profit: "Profit", units: "Units sold", invested: "Investment", recovered: "Recovered",
    roi: "Current ROI", remaining: "Remaining inventory (at price, net)", range30: "30 days", range90: "90 days", all: "All",
    salesOverTime: "Daily revenue", cumulative: "Cumulative profit", byMethod: "Sales by payment method", byProduct: "Top products",
    projection: "Recovery projection", scenario: "Scenario", worst: "Worst", base: "Base", best: "Best",
    weekly: "Weekly revenue", payback: "Payback date", weeks: "Weeks", roiEnd: "ROI at sell-out",
    never: "Not reachable with current stock", noSales: "No sales recorded yet.", pending: "Complete the import assumptions to compute the investment.",
    thinData: "Less than 4 weeks of history: scenarios use wide estimates.",
    investedLine: "Investment", date: "Date", amount: "CRC", product: "Product", method: "Method", scenarioKey: "Scenario",
  }, [es]);

  const crc = useMemo(() => new Intl.NumberFormat(es ? "es-CR" : "en-US", { style: "currency", currency: "CRC", maximumFractionDigits: 0 }), [es]);
  const percent = (value: number | null) => (value === null ? "-" : `${(value * 100).toFixed(1)}%`);

  const load = async () => {
    try {
      setData(await apiRequest<Analytics>("/api/admin/inventory/analytics", { cache: "no-store" }));
      setAuthorized(true);
    } catch (error) {
      if (isApiErrorStatus(error, 401)) setAuthorized(false);
      else api.error(formatApiError(error, locale, { fallback: es ? "No pudimos cargar las ventas." : "We could not load sales." }));
    } finally {
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
    setData(null);
  };

  const daily = useMemo(() => {
    if (!data) return [];
    if (range === "all") return data.daily;
    const lastDay = data.daily.at(-1)?.date ?? "";
    const cutoff = new Date(new Date(lastDay).getTime() - Number(range) * 86_400_000).toISOString().slice(0, 10);
    return data.daily.filter((day) => day.date >= cutoff);
  }, [data, range]);

  const projectionSeries = useMemo(() => {
    if (!data) return [];
    const scenarioLabel = (name: Scenario["name"]) => labels[name];
    const points = data.projection.scenarios.flatMap((scenario) => scenario.curve.map((point) => ({
      date: point.date, value: point.recovered, series: scenarioLabel(scenario.name),
    })));
    const dates = data.projection.scenarios[0]?.curve.map((point) => point.date) ?? [];
    return [...points, ...dates.map((date) => ({ date, value: data.totals.invested, series: labels.investedLine }))];
  }, [data, labels]);

  const totals = data?.totals;
  const hasSales = (data?.daily.length ?? 0) > 0;
  const axisMoney = { labelFormatter: (value: number) => `${Math.round(value / 1000)}k` };

  return (
    <>
      {contextHolder}
      <AdminShell locale={locale} title={labels.title} subtitle={labels.subtitle}
        sessionReady={sessionReady} authorized={authorized} loginLoading={loginLoading}
        onLogin={onLogin} onLogout={onLogout}>
        {data && !data.crReady ? <Alert type="warning" showIcon title={labels.pending} style={{ marginBottom: 16 }} /> : null}
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={12} md={6}><Card><Statistic title={labels.invested} value={crc.format(totals?.invested ?? 0)} /></Card></Col>
          <Col xs={12} md={6}><Card><Statistic title={labels.recovered} value={`${crc.format(totals?.netRevenue ?? 0)} (${percent(totals?.recoveredPct ?? null)})`} /></Card></Col>
          <Col xs={12} md={6}><Card><Statistic title={labels.profit} value={crc.format(totals?.profit ?? 0)} /></Card></Col>
          <Col xs={12} md={6}><Card><Statistic title={labels.roi} value={percent(totals?.roi ?? null)} /></Card></Col>
          <Col xs={12} md={6}><Card><Statistic title={labels.revenue} value={crc.format(totals?.revenue ?? 0)} /></Card></Col>
          <Col xs={12} md={6}><Card><Statistic title={labels.units} value={totals?.units ?? 0} /></Card></Col>
          <Col xs={24} md={12}><Card><Statistic title={labels.remaining} value={crc.format(totals?.remainingNetRevenue ?? 0)} suffix={`/ ${totals?.remainingUnits ?? 0}`} /></Card></Col>
        </Row>

        {!hasSales ? <Empty description={labels.noSales} style={{ margin: "24px 0" }} /> : (
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Segmented value={range} onChange={(value) => setRange(value as typeof range)}
              options={[{ value: "30", label: labels.range30 }, { value: "90", label: labels.range90 }, { value: "all", label: labels.all }]} />
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card title={labels.salesOverTime}>
                  <Column data={daily} xField="date" yField="revenue" height={280} axis={{ y: axisMoney }} />
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title={labels.cumulative}>
                  <Line data={daily} xField="date" yField="cumulativeProfit" height={280} axis={{ y: axisMoney }} />
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title={labels.byMethod}>
                  <Column data={data?.byMethod ?? []} xField="method" yField="revenue" height={280} axis={{ y: axisMoney }} />
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title={labels.byProduct}>
                  <Bar data={data?.byProduct ?? []} xField="product" yField="revenue" height={280} axis={{ y: axisMoney }} />
                </Card>
              </Col>
            </Row>
          </Space>
        )}

        <Card title={labels.projection} style={{ marginTop: 16 }}>
          {data && data.projection.weeksOfHistory < 4 ? <Alert type="info" showIcon title={labels.thinData} style={{ marginBottom: 12 }} /> : null}
          <Line data={projectionSeries} xField="date" yField="value" colorField="series" height={320} axis={{ y: axisMoney }} />
          <Table<Scenario> rowKey="name" size="small" pagination={false} style={{ marginTop: 16 }} dataSource={data?.projection.scenarios ?? []}
            columns={[
              { title: labels.scenario, dataIndex: "name", render: (name: Scenario["name"]) => <Tag color={name === "best" ? "green" : name === "worst" ? "red" : "blue"}>{labels[name]}</Tag> },
              { title: labels.weekly, dataIndex: "weeklyRevenue", align: "right", render: (value: number) => crc.format(value) },
              { title: labels.weeks, dataIndex: "weeksToPayback", align: "right", render: (value: number | null) => (value === null ? "-" : value.toFixed(1)) },
              { title: labels.payback, dataIndex: "paybackDate", render: (value: string | null) => value ?? <Typography.Text type="secondary">{labels.never}</Typography.Text> },
              { title: labels.roiEnd, dataIndex: "roiAtSellOut", align: "right", render: (value: number | null) => percent(value) },
            ]} />
        </Card>
      </AdminShell>
    </>
  );
}
