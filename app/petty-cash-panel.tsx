"use client";

import { PlusOutlined } from "@ant-design/icons";
import { Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Statistic, Switch, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import AdminShell from "./admin-shell";
import { ApiError, apiRequest, formatApiError, isApiErrorStatus } from "./lib/api-client";

const CATEGORIES = ["FIXED_SERVICE", "UNEXPECTED", "TECH_SERVICE", "OTHER"] as const;
type Category = (typeof CATEGORIES)[number];
type Entry = { id: string; date: string; type: "EXPENSE" | "FUND"; amountCrc: number; category: Category; description: string; recurringId: string | null; voidedAt: string | null };
type Recurring = { id: string; amountCrc: number; category: Category; description: string; dayOfMonth: number; active: boolean };
type Summary = { expenses: number; funds: number; balance: number; byCategory: Partial<Record<Category, number>> };
type PettyCash = { month: string; entries: Entry[]; monthSummary: Summary; cashBalance: number; recurring: Recurring[] };
type EntryForm = { type: "EXPENSE" | "FUND"; amountCrc: number; category?: Category; description?: string; date: Dayjs };
type RecurringForm = { amountCrc: number; category: Category; description: string; dayOfMonth: number };

export default function PettyCashPanel({ locale }: { locale: "es" | "en" }) {
  const [api, contextHolder] = message.useMessage();
  const [sessionReady, setSessionReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [data, setData] = useState<PettyCash | null>(null);
  const [month, setMonth] = useState(dayjs());
  const [entryOpen, setEntryOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [entryForm] = Form.useForm<EntryForm>();
  const [recurringForm] = Form.useForm<RecurringForm>();
  const entryType = Form.useWatch("type", entryForm);
  const es = locale === "es";

  const labels = useMemo(() => es ? {
    title: "Caja chica",
    subtitle: "Gastos fijos, imprevistos y servicios tecnicos que se restan de la utilidad en el balance.",
    cash: "Saldo de caja", expenses: "Gastos del mes", funds: "Fondeos del mes", add: "Registrar movimiento", addRecurring: "Nuevo cargo recurrente",
    entries: "Movimientos", recurring: "Cargos recurrentes (se generan cada mes)", date: "Fecha", type: "Tipo", category: "Categoria", description: "Descripcion",
    amount: "Monto (CRC)", expense: "Gasto", fund: "Fondeo (entra a la caja)", day: "Dia del mes", active: "Activo", void: "Anular", voided: "anulado",
    voidConfirm: "Anular este movimiento? Deja de contar en el balance.", save: "Guardar", cancel: "Cancelar", required: "Campo obligatorio.",
    saved: "Movimiento guardado.", voidedOk: "Movimiento anulado.", recurringSaved: "Cargo recurrente guardado.", auto: "automatico", empty: "Sin movimientos este mes.",
    loadFail: "No pudimos cargar la caja chica.",
    FIXED_SERVICE: "Servicios fijos", UNEXPECTED: "Gastos inesperados", TECH_SERVICE: "Servicio tecnico", OTHER: "Otro",
    errors: { INVALID_AMOUNT: "El monto debe ser mayor a 0.", INVALID_CATEGORY: "Categoria no valida.", INVALID_DESCRIPTION: "Escribe una descripcion.", INVALID_DATE: "Fecha no valida.", INVALID_DAY: "El dia debe estar entre 1 y 31.", INVALID_TYPE: "Tipo no valido.", NOT_FOUND: "El registro ya no existe.", ALREADY_VOIDED: "Ya estaba anulado." } as Record<string, string>,
  } : {
    title: "Petty cash",
    subtitle: "Fixed services, unexpected costs and technical services that are subtracted from profit in the balance.",
    cash: "Cash balance", expenses: "Expenses this month", funds: "Funds this month", add: "Add entry", addRecurring: "New recurring charge",
    entries: "Entries", recurring: "Recurring charges (generated every month)", date: "Date", type: "Type", category: "Category", description: "Description",
    amount: "Amount (CRC)", expense: "Expense", fund: "Fund (adds to the cash)", day: "Day of month", active: "Active", void: "Void", voided: "voided",
    voidConfirm: "Void this entry? It stops counting in the balance.", save: "Save", cancel: "Cancel", required: "Required field.",
    saved: "Entry saved.", voidedOk: "Entry voided.", recurringSaved: "Recurring charge saved.", auto: "automatic", empty: "No entries this month.",
    loadFail: "We could not load petty cash.",
    FIXED_SERVICE: "Fixed services", UNEXPECTED: "Unexpected costs", TECH_SERVICE: "Technical service", OTHER: "Other",
    errors: { INVALID_AMOUNT: "The amount must be above 0.", INVALID_CATEGORY: "Invalid category.", INVALID_DESCRIPTION: "Enter a description.", INVALID_DATE: "Invalid date.", INVALID_DAY: "The day must be between 1 and 31.", INVALID_TYPE: "Invalid type.", NOT_FOUND: "The record no longer exists.", ALREADY_VOIDED: "It was already voided." } as Record<string, string>,
  }, [es]);
  const categoryLabel: Record<Category, string> = { FIXED_SERVICE: labels.FIXED_SERVICE, UNEXPECTED: labels.UNEXPECTED, TECH_SERVICE: labels.TECH_SERVICE, OTHER: labels.OTHER };
  const categoryOptions = CATEGORIES.map((value) => ({ value, label: categoryLabel[value] }));
  const crc = useMemo(() => new Intl.NumberFormat(es ? "es-CR" : "en-US", { style: "currency", currency: "CRC", maximumFractionDigits: 0 }), [es]);

  const fail = (error: unknown, fallback: string) => {
    if (error instanceof ApiError && labels.errors[error.message]) api.error(labels.errors[error.message]);
    else api.error(formatApiError(error, locale, { fallback }));
  };

  const load = async (target: Dayjs = month) => {
    try {
      setData(await apiRequest<PettyCash>(`/api/admin/petty-cash?month=${target.format("YYYY-MM")}`, { cache: "no-store" }));
      setAuthorized(true);
    } catch (error) {
      if (isApiErrorStatus(error, 401)) setAuthorized(false);
      else api.error(formatApiError(error, locale, { fallback: labels.loadFail }));
    } finally {
      setSessionReady(true);
    }
  };
  const loadInitial = useEffectEvent(() => load());
  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInitial(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const mutate = async (path: string, method: string, body: unknown, success: string) => {
    try {
      setData(await apiRequest<PettyCash>(path, { method, body: JSON.stringify(body) }));
      api.success(success);
      return true;
    } catch (error) {
      fail(error, labels.loadFail);
      return false;
    }
  };

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

  const submitEntry = async (values: EntryForm) => {
    const body = { ...values, date: values.date.toISOString() };
    if (await mutate("/api/admin/petty-cash", "POST", body, labels.saved)) {
      setEntryOpen(false);
      // The entry may belong to another month than the one on screen.
      if (!values.date.isSame(month, "month")) {
        setMonth(values.date);
        await load(values.date);
      }
    }
  };
  const submitRecurring = async (values: RecurringForm) => {
    if (await mutate("/api/admin/petty-cash/recurring", "POST", values, labels.recurringSaved)) setRecurringOpen(false);
  };

  const entryColumns: ColumnsType<Entry> = [
    { title: labels.date, dataIndex: "date", width: 110, render: (value: string) => dayjs(value).format("DD/MM/YYYY") },
    { title: labels.type, dataIndex: "type", width: 100, render: (value: Entry["type"]) => <Tag color={value === "FUND" ? "green" : "volcano"}>{value === "FUND" ? labels.fund.split(" ")[0] : labels.expense}</Tag> },
    { title: labels.category, dataIndex: "category", render: (value: Category, row) => (row.type === "FUND" ? "-" : categoryLabel[value]) },
    { title: labels.description, dataIndex: "description", render: (value: string, row) => <>{value || "-"}{row.recurringId ? <Tag style={{ marginInlineStart: 8 }}>{labels.auto}</Tag> : null}{row.voidedAt ? <Tag color="red" style={{ marginInlineStart: 8 }}>{labels.voided}</Tag> : null}</> },
    { title: labels.amount, dataIndex: "amountCrc", align: "right", render: (value: number, row) => <span style={row.voidedAt ? { textDecoration: "line-through" } : undefined}>{row.type === "FUND" ? "+" : "-"}{crc.format(value)}</span> },
    {
      title: "", width: 90,
      render: (_, row) => row.voidedAt ? null : (
        <Popconfirm title={labels.voidConfirm} okText={labels.void} cancelText={labels.cancel} okButtonProps={{ danger: true }} onConfirm={() => void mutate(`/api/admin/petty-cash/${row.id}/void`, "POST", {}, labels.voidedOk)}>
          <Button size="small" danger>{labels.void}</Button>
        </Popconfirm>
      ),
    },
  ];

  const recurringColumns: ColumnsType<Recurring> = [
    { title: labels.description, dataIndex: "description" },
    { title: labels.category, dataIndex: "category", render: (value: Category) => categoryLabel[value] },
    { title: labels.day, dataIndex: "dayOfMonth", align: "right", width: 110 },
    { title: labels.amount, dataIndex: "amountCrc", align: "right", render: (value: number) => crc.format(value) },
    { title: labels.active, dataIndex: "active", width: 90, render: (value: boolean, row) => <Switch checked={value} onChange={(active) => void mutate(`/api/admin/petty-cash/recurring/${row.id}`, "PATCH", { active }, labels.saved)} /> },
  ];

  const summary = data?.monthSummary;
  return (
    <>
      {contextHolder}
      <AdminShell locale={locale} title={labels.title} subtitle={labels.subtitle}
        sessionReady={sessionReady} authorized={authorized} loginLoading={loginLoading}
        onLogin={onLogin} onLogout={onLogout}>
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={24} md={8}><Card><Statistic title={labels.cash} value={crc.format(data?.cashBalance ?? 0)} styles={{ content: { color: (data?.cashBalance ?? 0) < 0 ? "#cf1322" : undefined } }} /></Card></Col>
          <Col xs={12} md={8}><Card><Statistic title={labels.expenses} value={crc.format(summary?.expenses ?? 0)} /></Card></Col>
          <Col xs={12} md={8}><Card><Statistic title={labels.funds} value={crc.format(summary?.funds ?? 0)} /></Card></Col>
        </Row>
        {summary && Object.keys(summary.byCategory).length ? (
          <Space wrap style={{ marginBottom: 16 }}>
            {CATEGORIES.filter((value) => summary.byCategory[value]).map((value) => <Tag key={value}>{categoryLabel[value]}: {crc.format(summary.byCategory[value] ?? 0)}</Tag>)}
          </Space>
        ) : null}

        <Card title={labels.entries} extra={
          <Space wrap>
            <DatePicker picker="month" allowClear={false} value={month} onChange={(value) => { if (value) { setMonth(value); void load(value); } }} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { entryForm.setFieldsValue({ type: "EXPENSE", category: "UNEXPECTED", description: "", amountCrc: undefined, date: dayjs() }); setEntryOpen(true); }}>{labels.add}</Button>
          </Space>
        }>
          <Table<Entry> rowKey="id" size="small" pagination={false} dataSource={data?.entries ?? []} columns={entryColumns} locale={{ emptyText: labels.empty }} scroll={{ x: 640 }} />
        </Card>

        <Card title={labels.recurring} style={{ marginTop: 16 }} extra={<Button icon={<PlusOutlined />} onClick={() => { recurringForm.setFieldsValue({ category: "FIXED_SERVICE", dayOfMonth: 1, description: "", amountCrc: undefined }); setRecurringOpen(true); }}>{labels.addRecurring}</Button>}>
          <Table<Recurring> rowKey="id" size="small" pagination={false} dataSource={data?.recurring ?? []} columns={recurringColumns} locale={{ emptyText: labels.empty }} scroll={{ x: 560 }} />
        </Card>

        <Modal title={labels.add} open={entryOpen} onCancel={() => setEntryOpen(false)} okText={labels.save} cancelText={labels.cancel} onOk={() => entryForm.submit()} destroyOnHidden forceRender>
          <Form form={entryForm} layout="vertical" onFinish={(values) => void submitEntry(values)}>
            <Form.Item name="type" label={labels.type}><Select options={[{ value: "EXPENSE", label: labels.expense }, { value: "FUND", label: labels.fund }]} /></Form.Item>
            <Form.Item name="date" label={labels.date} rules={[{ required: true, message: labels.required }]}><DatePicker style={{ width: "100%" }} allowClear={false} /></Form.Item>
            {entryType !== "FUND" ? <Form.Item name="category" label={labels.category} rules={[{ required: true, message: labels.required }]}><Select options={categoryOptions} /></Form.Item> : null}
            <Form.Item name="amountCrc" label={labels.amount} rules={[{ required: true, message: labels.required }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="description" label={labels.description} rules={entryType === "FUND" ? [] : [{ required: true, message: labels.required }]}><Input maxLength={300} /></Form.Item>
          </Form>
        </Modal>

        <Modal title={labels.addRecurring} open={recurringOpen} onCancel={() => setRecurringOpen(false)} okText={labels.save} cancelText={labels.cancel} onOk={() => recurringForm.submit()} destroyOnHidden forceRender>
          <Form form={recurringForm} layout="vertical" onFinish={(values) => void submitRecurring(values)}>
            <Form.Item name="description" label={labels.description} rules={[{ required: true, message: labels.required }]}><Input maxLength={300} /></Form.Item>
            <Form.Item name="category" label={labels.category} rules={[{ required: true, message: labels.required }]}><Select options={categoryOptions} /></Form.Item>
            <Form.Item name="amountCrc" label={labels.amount} rules={[{ required: true, message: labels.required }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="dayOfMonth" label={labels.day} rules={[{ required: true, message: labels.required }]}><InputNumber min={1} max={31} style={{ width: "100%" }} /></Form.Item>
            <Typography.Text type="secondary">{es ? "Si el mes tiene menos dias, se cobra el ultimo dia del mes." : "If the month is shorter, it is charged on its last day."}</Typography.Text>
          </Form>
        </Modal>
      </AdminShell>
    </>
  );
}
