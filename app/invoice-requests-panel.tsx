"use client";

import { Select, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import AdminShell from "./admin-shell";
import { apiRequest, formatApiError, isApiErrorStatus } from "./lib/api-client";

type InvoiceRequestRow = {
  id: string;
  status: "REQUESTED" | "ISSUED" | "FAILED" | "CANCELLED";
  idType: string;
  idNumber: string;
  name: string;
  email: string;
  economicActivity?: string | null;
  createdAt: string;
  order: { orderNumber?: string | null; name?: string | null; total?: string | null; currency?: string | null; externalPaymentId: string };
};

const PAGE_SIZE = 20;
const STATUS_COLORS: Record<InvoiceRequestRow["status"], string> = { REQUESTED: "warning", ISSUED: "success", FAILED: "error", CANCELLED: "default" };

export default function InvoiceRequestsPanel({ locale }: { locale: "es" | "en" }) {
  const [api, contextHolder] = message.useMessage();
  const [sessionReady, setSessionReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [rows, setRows] = useState<InvoiceRequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const es = locale === "es";

  const labels = useMemo(() => es ? {
    title: "Facturas electronicas",
    subtitle: "Solicitudes de factura de clientes con orden pagada.",
    allStatuses: "Todos los estados",
    REQUESTED: "Solicitada",
    ISSUED: "Emitida",
    FAILED: "Con error",
    CANCELLED: "Cancelada",
    order: "Orden",
    customer: "Cliente",
    idType: "Identificacion",
    email: "Correo",
    activity: "Actividad",
    status: "Estado",
    created: "Solicitada el",
    types: { "01": "Cedula fisica", "02": "Cedula juridica", "03": "DIMEX", "04": "NITE" } as Record<string, string>,
    empty: "No hay solicitudes de factura.",
    loadFail: "No pudimos cargar las solicitudes.",
  } : {
    title: "Electronic invoices",
    subtitle: "Invoice requests from customers with a paid order.",
    allStatuses: "All statuses",
    REQUESTED: "Requested",
    ISSUED: "Issued",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
    order: "Order",
    customer: "Customer",
    idType: "Identification",
    email: "Email",
    activity: "Activity",
    status: "Status",
    created: "Requested",
    types: { "01": "Individual ID", "02": "Company ID", "03": "DIMEX", "04": "NITE" } as Record<string, string>,
    empty: "No invoice requests.",
    loadFail: "We could not load the requests.",
  }, [es]);

  const load = async (nextPage = page, nextStatus = status) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) });
      if (nextStatus !== "all") params.set("status", nextStatus);
      const payload = await apiRequest<{ invoiceRequests: InvoiceRequestRow[]; total: number }>(`/api/admin/invoice-requests?${params}`, { cache: "no-store" });
      setRows(payload.invoiceRequests);
      setTotal(payload.total);
      setAuthorized(true);
    } catch (error) {
      if (isApiErrorStatus(error, 401)) setAuthorized(false);
      else api.error(formatApiError(error, locale, { fallback: labels.loadFail }));
    } finally {
      setLoading(false);
      setSessionReady(true);
    }
  };

  const loadInitial = useEffectEvent(() => load(1, "all"));
  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInitial(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const onLogin = async (credentials: { token?: string; email?: string; password?: string; otp?: string }) => {
    setLoginLoading(true);
    try {
      await apiRequest("/api/admin/login", { method: "POST", body: JSON.stringify(credentials) });
      await load(1, status);
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
    setRows([]);
  };

  const columns: ColumnsType<InvoiceRequestRow> = [
    { title: labels.order, width: 150, render: (_value, row) => row.order.name || (row.order.orderNumber ? `#${row.order.orderNumber}` : row.order.externalPaymentId.slice(0, 8)) },
    {
      title: labels.customer,
      width: 240,
      render: (_value, row) => <Space orientation="vertical" size={0}><strong>{row.name}</strong><span>{row.email}</span></Space>,
    },
    { title: labels.idType, width: 200, render: (_value, row) => `${labels.types[row.idType] ?? row.idType} ${row.idNumber}` },
    { title: labels.activity, dataIndex: "economicActivity", width: 110, render: (value?: string | null) => value || "-" },
    { title: labels.status, dataIndex: "status", width: 130, render: (value: InvoiceRequestRow["status"]) => <Tag color={STATUS_COLORS[value]}>{labels[value]}</Tag> },
    { title: labels.created, dataIndex: "createdAt", width: 180, render: (value: string) => new Date(value).toLocaleString(es ? "es-CR" : "en-US") },
  ];

  return (
    <>
      {contextHolder}
      <AdminShell locale={locale} title={labels.title} subtitle={labels.subtitle}
        sessionReady={sessionReady} authorized={authorized} loginLoading={loginLoading}
        onLogin={onLogin} onLogout={onLogout}>
        <section className="slowfit-policy-card slowfit-admin-card">
          <Space className="slowfit-admin-controls" wrap>
            <Select
              aria-label={labels.status}
              value={status}
              style={{ minWidth: 220 }}
              options={[
                { value: "all", label: labels.allStatuses },
                ...(["REQUESTED", "ISSUED", "FAILED", "CANCELLED"] as const).map((value) => ({ value, label: labels[value] })),
              ]}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
                void load(1, value);
              }}
            />
          </Space>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={loading}
            locale={{ emptyText: labels.empty }}
            scroll={{ x: 1010 }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              showSizeChanger: false,
              onChange: (nextPage) => {
                setPage(nextPage);
                void load(nextPage, status);
              },
            }}
          />
        </section>
      </AdminShell>
    </>
  );
}
