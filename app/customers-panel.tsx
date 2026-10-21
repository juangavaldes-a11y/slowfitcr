"use client";

import { DownloadOutlined } from "@ant-design/icons";
import { Button, Input, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import AdminShell from "./admin-shell";
import { apiRequest, formatApiError, isApiErrorStatus } from "./lib/api-client";

type CustomerRow = {
  id: string;
  email: string;
  phone?: string | null;
  name?: string | null;
  marketingConsent: boolean;
  ordersCount: number;
  firstOrderAt: string;
  lastOrderAt: string;
};

const PAGE_SIZE = 20;
const EXPORT_PAGE_SIZE = 500;

function csvCell(value: string | number | boolean | null | undefined) {
  const text = String(value ?? "");
  // A leading formula character would run as a formula when the file is opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function CustomersPanel({ locale }: { locale: "es" | "en" }) {
  const [api, contextHolder] = message.useMessage();
  const [sessionReady, setSessionReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const es = locale === "es";

  const labels = useMemo(() => es ? {
    title: "Clientes",
    subtitle: "Contactos guardados de quienes hicieron una orden.",
    search: "Buscar por correo, nombre o telefono",
    email: "Correo",
    name: "Nombre",
    phone: "Telefono",
    consent: "Acepta novedades",
    yes: "Si",
    no: "No",
    orders: "Ordenes",
    lastOrder: "Ultima orden",
    export: "Exportar CSV",
    empty: "Aun no hay clientes guardados.",
    loadFail: "No pudimos cargar los clientes.",
    exportFail: "No pudimos exportar los clientes.",
  } : {
    title: "Customers",
    subtitle: "Saved contacts of people who placed an order.",
    search: "Search by email, name or phone",
    email: "Email",
    name: "Name",
    phone: "Phone",
    consent: "Accepts updates",
    yes: "Yes",
    no: "No",
    orders: "Orders",
    lastOrder: "Last order",
    export: "Export CSV",
    empty: "No saved customers yet.",
    loadFail: "We could not load customers.",
    exportFail: "We could not export customers.",
  }, [es]);

  const fetchPage = (nextPage: number, search: string, pageSize: number) => {
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
    if (search) params.set("q", search);
    return apiRequest<{ customers: CustomerRow[]; total: number }>(`/api/admin/customers?${params}`, { cache: "no-store" });
  };

  const load = async (nextPage = page, search = query) => {
    setLoading(true);
    try {
      const payload = await fetchPage(nextPage, search, PAGE_SIZE);
      setCustomers(payload.customers);
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

  const loadInitial = useEffectEvent(() => load(1, ""));
  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInitial(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const onLogin = async (credentials: { token?: string; email?: string; password?: string; otp?: string }) => {
    setLoginLoading(true);
    try {
      await apiRequest("/api/admin/login", { method: "POST", body: JSON.stringify(credentials) });
      await load(1, query);
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
    setCustomers([]);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: CustomerRow[] = [];
      for (let nextPage = 1; ; nextPage += 1) {
        const payload = await fetchPage(nextPage, query, EXPORT_PAGE_SIZE);
        rows.push(...payload.customers);
        if (rows.length >= payload.total || !payload.customers.length) break;
      }
      const header = [labels.email, labels.name, labels.phone, labels.consent, labels.orders, labels.lastOrder];
      const lines = rows.map((row) => [
        row.email,
        row.name,
        row.phone,
        row.marketingConsent ? labels.yes : labels.no,
        row.ordersCount,
        row.lastOrderAt,
      ].map(csvCell).join(","));
      const blob = new Blob([`﻿${[header.map(csvCell).join(","), ...lines].join("\r\n")}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `slowfit-customers-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      if (isApiErrorStatus(error, 401)) setAuthorized(false);
      else api.error(formatApiError(error, locale, { fallback: labels.exportFail }));
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnsType<CustomerRow> = [
    { title: labels.email, dataIndex: "email", width: 240 },
    { title: labels.name, dataIndex: "name", width: 180, render: (value?: string | null) => value || "-" },
    { title: labels.phone, dataIndex: "phone", width: 150, render: (value?: string | null) => value || "-" },
    {
      title: labels.consent,
      dataIndex: "marketingConsent",
      width: 140,
      render: (value: boolean) => <Tag color={value ? "success" : "default"}>{value ? labels.yes : labels.no}</Tag>,
    },
    { title: labels.orders, dataIndex: "ordersCount", width: 90, align: "right" },
    {
      title: labels.lastOrder,
      dataIndex: "lastOrderAt",
      width: 180,
      render: (value: string) => new Date(value).toLocaleString(es ? "es-CR" : "en-US"),
    },
  ];

  return (
    <>
      {contextHolder}
      <AdminShell locale={locale} title={labels.title} subtitle={labels.subtitle}
        sessionReady={sessionReady} authorized={authorized} loginLoading={loginLoading}
        onLogin={onLogin} onLogout={onLogout}>
        <section className="slowfit-policy-card slowfit-admin-card">
          <Space className="slowfit-admin-controls" wrap>
            <Input.Search
              aria-label={labels.search}
              placeholder={labels.search}
              allowClear
              onSearch={(value) => {
                const search = value.trim();
                setQuery(search);
                setPage(1);
                void load(1, search);
              }}
              style={{ minWidth: 280 }}
            />
            <Button icon={<DownloadOutlined />} loading={exporting} disabled={!total} onClick={() => void exportCsv()}>
              {labels.export}
            </Button>
          </Space>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={customers}
            loading={loading}
            locale={{ emptyText: labels.empty }}
            scroll={{ x: 980 }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              showSizeChanger: false,
              onChange: (nextPage) => {
                setPage(nextPage);
                void load(nextPage, query);
              },
            }}
          />
        </section>
      </AdminShell>
    </>
  );
}
