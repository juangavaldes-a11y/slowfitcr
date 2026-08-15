"use client";

import { Button, Input, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import AdminShell from "./admin-shell";

type AuditRow = {
  id: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  createdAt: string;
};

type WebhookRow = {
  id: string;
  topic: string;
  shop: string;
  orderId?: string | null;
  status: "PROCESSED" | "FAILED";
  errorMessage?: string | null;
  createdAt: string;
  processedAt?: string | null;
  replayedAt?: string | null;
};

type AdminOpsPanelProps = {
  locale: "es" | "en";
};

type AuditQuery = {
  page: number;
  pageSize: number;
  search: string;
  action: string;
};

type WebhookQuery = {
  page: number;
  pageSize: number;
  search: string;
  status: string;
};

const DEFAULT_AUDIT_QUERY: AuditQuery = {
  page: 1,
  pageSize: 8,
  search: "",
  action: "all",
};

const DEFAULT_WEBHOOK_QUERY: WebhookQuery = {
  page: 1,
  pageSize: 8,
  search: "",
  status: "all",
};

const AUDIT_ACTION_OPTIONS = [
  "admin.login",
  "admin.login.failed",
  "admin.logout",
  "checkout.created",
  "contact.received",
  "event.ingested",
  "order.webhook.failed",
  "order.webhook.processed",
  "order.webhook.replayed",
  "review.moderated",
  "review.submitted",
].map((action) => ({ value: action, label: action }));

const WEBHOOK_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "PROCESSED", label: "Processed" },
  { value: "FAILED", label: "Failed" },
];

export default function AdminOpsPanel({ locale }: AdminOpsPanelProps) {
  const [api, contextHolder] = message.useMessage();
  const [sessionReady, setSessionReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditQuery, setAuditQuery] = useState<AuditQuery>(DEFAULT_AUDIT_QUERY);
  const [events, setEvents] = useState<WebhookRow[]>([]);
  const [webhookTotal, setWebhookTotal] = useState(0);
  const [webhookQuery, setWebhookQuery] = useState<WebhookQuery>(DEFAULT_WEBHOOK_QUERY);

  const labels = useMemo(
    () =>
      locale === "es"
        ? {
            title: "Operaciones",
            subtitle: "Inicia sesion para revisar auditoria, filtrar eventos y reenviar webhooks de pedidos.",
            authTitle: "Acceso de moderacion",
            authCopy: "La sesion queda guardada en una cookie segura hasta que expire o cierres sesion.",
            refresh: "Actualizar",
            logout: "Salir",
            replay: "Reenviar",
            replayOk: "Webhook reenviado",
            replayFail: "No se pudo reenviar",
            loadFail: "No se pudo cargar la informacion",
            loginFail: "Credenciales invalidas",
            unauthorized: "Debes autenticarte para continuar.",
            signIn: "Entrar",
            tokenLabel: "Token de moderacion",
            sessionChecking: "Verificando sesion...",
            auditTitle: "Registro de auditoria",
            webhookTitle: "Eventos de webhook",
            auditSearch: "Buscar accion o actor",
            auditAction: "Filtrar por accion",
            webhookSearch: "Buscar topic, tienda u orden",
            webhookStatus: "Filtrar por estado",
            tableEmpty: "No hay resultados para esta busqueda.",
          }
        : {
            title: "Operations",
            subtitle: "Sign in to review the audit trail, filter events, and replay order webhooks.",
            authTitle: "Moderation access",
            authCopy: "The session is stored in a secure cookie until it expires or you sign out.",
            refresh: "Refresh",
            logout: "Sign out",
            replay: "Replay",
            replayOk: "Webhook replayed",
            replayFail: "Could not replay webhook",
            loadFail: "Could not load data",
            loginFail: "Invalid credentials",
            unauthorized: "Authentication is required.",
            signIn: "Sign in",
            tokenLabel: "Moderation token",
            sessionChecking: "Checking session...",
            auditTitle: "Audit log",
            webhookTitle: "Webhook events",
            auditSearch: "Search action or actor",
            auditAction: "Filter by action",
            webhookSearch: "Search topic, shop, or order",
            webhookStatus: "Filter by status",
            tableEmpty: "No results for this search.",
          },
    [locale],
  );

  const buildUrl = (path: string, params: Record<string, string | number | undefined>) => {
    const url = new URL(path, window.location.origin);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === "" || value === "all") {
        continue;
      }

      url.searchParams.set(key, String(value));
    }

    return `${url.pathname}${url.search}`;
  };

  const loadAuditLogs = async (query: AuditQuery) => {
    setAuditLoading(true);
    try {
      const response = await fetch(
        buildUrl("/api/admin/audit-logs", {
          page: query.page,
          pageSize: query.pageSize,
          search: query.search,
          action: query.action,
        }),
        { cache: "no-store" },
      );

      if (response.status === 401) {
        setAuthorized(false);
        setLogs([]);
        setAuditTotal(0);
        return false;
      }

      if (!response.ok) {
        throw new Error("load_failed");
      }

      const payload = (await response.json()) as { logs: AuditRow[]; total: number };
      setAuthorized(true);
      setLogs(payload.logs);
      setAuditTotal(payload.total);
      return true;
    } catch {
      api.error(labels.loadFail);
      return false;
    } finally {
      setAuditLoading(false);
      setSessionReady(true);
    }
  };

  const loadWebhookEvents = async (query: WebhookQuery) => {
    setWebhookLoading(true);
    try {
      const response = await fetch(
        buildUrl("/api/admin/webhooks/orders", {
          page: query.page,
          pageSize: query.pageSize,
          search: query.search,
          status: query.status,
        }),
        { cache: "no-store" },
      );

      if (response.status === 401) {
        setAuthorized(false);
        setEvents([]);
        setWebhookTotal(0);
        return false;
      }

      if (!response.ok) {
        throw new Error("load_failed");
      }

      const payload = (await response.json()) as { events: WebhookRow[]; total: number };
      setAuthorized(true);
      setEvents(payload.events);
      setWebhookTotal(payload.total);
      return true;
    } catch {
      api.error(labels.loadFail);
      return false;
    } finally {
      setWebhookLoading(false);
      setSessionReady(true);
    }
  };

  const refreshAll = async () => {
    const auditOk = await loadAuditLogs(auditQuery);
    if (!auditOk) {
      return;
    }

    await loadWebhookEvents(webhookQuery);
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      refreshAll().catch(() => undefined);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const onLogin = async ({ token }: { token: string }) => {
    setLoginLoading(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        api.error(labels.loginFail);
        return;
      }

      await refreshAll();
    } finally {
      setLoginLoading(false);
      setSessionReady(true);
    }
  };

  const onLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthorized(false);
    setLogs([]);
    setEvents([]);
    setAuditTotal(0);
    setWebhookTotal(0);
  };

  const replayWebhook = async (eventId: string) => {
    const response = await fetch("/api/admin/webhooks/orders/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, actor: "slowfit-admin" }),
    });

    if (!response.ok) {
      api.error(labels.replayFail);
      return;
    }

    api.success(labels.replayOk);
    await refreshAll();
  };

  const logColumns: ColumnsType<AuditRow> = [
    {
      title: "Action",
      dataIndex: "action",
      key: "action",
      width: 260,
    },
    {
      title: "Actor",
      dataIndex: "actor",
      key: "actor",
      width: 160,
    },
    {
      title: "When",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 220,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: "Details",
      dataIndex: "details",
      key: "details",
      render: (value: Record<string, unknown>) => (
        <pre className="slowfit-admin-json">{JSON.stringify(value, null, 2)}</pre>
      ),
    },
  ];

  const eventColumns: ColumnsType<WebhookRow> = [
    {
      title: "Topic",
      dataIndex: "topic",
      key: "topic",
      width: 180,
    },
    {
      title: "Order",
      dataIndex: "orderId",
      key: "orderId",
      width: 120,
      render: (value: string | null | undefined) => value || "-",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (value: string) => <Tag color={value === "FAILED" ? "error" : "success"}>{value}</Tag>,
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 220,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: "Replayed",
      dataIndex: "replayedAt",
      key: "replayedAt",
      width: 220,
      render: (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : "-"),
    },
    {
      title: "Action",
      key: "action",
      width: 140,
      render: (_value, record) => (
        <Button size="small" onClick={() => replayWebhook(record.id)}>
          {labels.replay}
        </Button>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <AdminShell
        locale={locale}
        title={labels.title}
        subtitle={labels.subtitle}
        sessionReady={sessionReady}
        authorized={authorized}
        loginLoading={loginLoading}
        onLogin={onLogin}
        onLogout={onLogout}
      >
            <Space className="slowfit-admin-toolbar" wrap>
              <Button onClick={() => refreshAll()} loading={auditLoading || webhookLoading}>
                {labels.refresh}
              </Button>
            </Space>

            <section className="slowfit-policy-card slowfit-admin-card">
              <Space className="slowfit-admin-controls" wrap>
                <Input.Search
                  allowClear
                  placeholder={labels.webhookSearch}
                  value={webhookQuery.search}
                  onSearch={(value) => {
                    const next = { ...webhookQuery, search: value.trim(), page: 1 };
                    setWebhookQuery(next);
                    void loadWebhookEvents(next);
                  }}
                  onChange={(event) => setWebhookQuery((current) => ({ ...current, search: event.target.value }))}
                  style={{ minWidth: 260 }}
                />
                <Select
                  value={webhookQuery.status}
                  onChange={(value) => {
                    const next = { ...webhookQuery, status: value, page: 1 };
                    setWebhookQuery(next);
                    void loadWebhookEvents(next);
                  }}
                  options={WEBHOOK_STATUS_OPTIONS}
                  style={{ minWidth: 180 }}
                />
              </Space>
              <Typography.Title level={4}>{labels.webhookTitle}</Typography.Title>
              <Table
                rowKey="id"
                columns={eventColumns}
                dataSource={events}
                loading={webhookLoading}
                locale={{ emptyText: labels.tableEmpty }}
                pagination={{
                  current: webhookQuery.page,
                  pageSize: webhookQuery.pageSize,
                  total: webhookTotal,
                  showSizeChanger: true,
                  onChange: (page, pageSize) => {
                    const next = { ...webhookQuery, page, pageSize: pageSize || webhookQuery.pageSize };
                    setWebhookQuery(next);
                    void loadWebhookEvents(next);
                  },
                }}
                scroll={{ x: 980 }}
                className="slowfit-admin-table"
              />
            </section>

            <section className="slowfit-policy-card slowfit-admin-card">
              <Space className="slowfit-admin-controls" wrap>
                <Input.Search
                  allowClear
                  placeholder={labels.auditSearch}
                  value={auditQuery.search}
                  onSearch={(value) => {
                    const next = { ...auditQuery, search: value.trim(), page: 1 };
                    setAuditQuery(next);
                    void loadAuditLogs(next);
                  }}
                  onChange={(event) => setAuditQuery((current) => ({ ...current, search: event.target.value }))}
                  style={{ minWidth: 260 }}
                />
                <Select
                  value={auditQuery.action}
                  onChange={(value) => {
                    const next = { ...auditQuery, action: value, page: 1 };
                    setAuditQuery(next);
                    void loadAuditLogs(next);
                  }}
                  options={[{ value: "all", label: "All actions" }, ...AUDIT_ACTION_OPTIONS]}
                  style={{ minWidth: 220 }}
                />
              </Space>
              <Typography.Title level={4}>{labels.auditTitle}</Typography.Title>
              <Table
                rowKey="id"
                columns={logColumns}
                dataSource={logs}
                loading={auditLoading}
                locale={{ emptyText: labels.tableEmpty }}
                pagination={{
                  current: auditQuery.page,
                  pageSize: auditQuery.pageSize,
                  total: auditTotal,
                  showSizeChanger: true,
                  onChange: (page, pageSize) => {
                    const next = { ...auditQuery, page, pageSize: pageSize || auditQuery.pageSize };
                    setAuditQuery(next);
                    void loadAuditLogs(next);
                  },
                }}
                scroll={{ x: 1100 }}
                className="slowfit-admin-table"
              />
            </section>
      </AdminShell>
    </>
  );
}
