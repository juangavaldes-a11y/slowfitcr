"use client";

import { EyeOutlined, RedoOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Grid,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import AdminShell from "./admin-shell";
import DeliveryOpsPanel from "./delivery-ops-panel";
import { apiRequest, formatApiError, isApiErrorStatus } from "./lib/api-client";

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
  provider: string;
  orderId?: string | null;
  payload: Record<string, unknown>;
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

type OutboxRow = {
  id: string;
  kind: string;
  destination: string;
  status: "PENDING" | "PROCESSING" | "DELIVERED" | "FAILED";
  attempts: number;
  lastError?: string | null;
  createdAt: string;
};

type OrderRow = {
  id: string;
  orderNumber?: string | null;
  name?: string | null;
  email: string;
  financialStatus?: string | null;
  fulfillmentStatus?: string | null;
  total?: string | null;
  currency?: string | null;
  preorderStatus?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  paymentCreatedAt?: string | null;
  updatedAt: string;
  delivery?: { id: string; status: string; provider: string } | null;
};

type OrderQuery = {
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

const DEFAULT_ORDER_QUERY: OrderQuery = {
  page: 1,
  pageSize: 10,
  search: "",
  status: "all",
};

const ORDER_STATUS_OPTIONS = [
  { value: "all", label: "All orders" },
  { value: "active", label: "Active" },
  { value: "cancelled", label: "Cancelled" },
];

const AUDIT_ACTION_OPTIONS = [
  "admin.login",
  "admin.login.failed",
  "admin.logout",
  "checkout.created",
  "contact.received",
  "customer.login",
  "customer.login.failed",
  "customer.registered",
  "event.ingested",
  "order.cancelled",
  "payment.webhook.failed",
  "payment.webhook.processed",
  "payment.webhook.replayed",
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
  const screens = Grid.useBreakpoint();
  const [sessionReady, setSessionReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditQuery, setAuditQuery] = useState<AuditQuery>(DEFAULT_AUDIT_QUERY);
  const [selectedAudit, setSelectedAudit] = useState<AuditRow | null>(null);
  const [events, setEvents] = useState<WebhookRow[]>([]);
  const [webhookTotal, setWebhookTotal] = useState(0);
  const [webhookQuery, setWebhookQuery] = useState<WebhookQuery>(DEFAULT_WEBHOOK_QUERY);
  const [selectedEvent, setSelectedEvent] = useState<WebhookRow | null>(null);
  const [replayingEventId, setReplayingEventId] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<OutboxRow[]>([]);
  const [outboxLoading, setOutboxLoading] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderQuery, setOrderQuery] = useState<OrderQuery>(DEFAULT_ORDER_QUERY);
  const [orderLoading, setOrderLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<OrderRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const labels = useMemo(
    () =>
      locale === "es"
        ? {
            title: "Operaciones",
            subtitle: "Inicia sesion para revisar auditoria, filtrar eventos y reenviar webhooks de pago.",
            authTitle: "Acceso de moderacion",
            authCopy: "La sesion queda guardada en una cookie segura hasta que expire o cierres sesion.",
            refresh: "Actualizar",
            logout: "Salir",
            replay: "Reenviar",
            replayConfirm: "¿Reenviar este webhook a las integraciones configuradas?",
            cancel: "Cancelar",
            replayOk: "Webhook reenviado",
            replayFail: "No se pudo reenviar",
            sessionExpired: "La sesion expiro. Inicia sesion de nuevo.",
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
            auditDetails: "Detalle de auditoria",
            webhookSearch: "Buscar topic, proveedor u orden",
            webhookStatus: "Filtrar por estado",
            webhookDetails: "Detalle del webhook",
            viewDetails: "Ver detalle",
            action: "Accion",
            actor: "Actor",
            when: "Fecha",
            details: "Detalles",
            topic: "Topic",
            provider: "Proveedor",
            order: "Orden",
            status: "Estado",
            created: "Creado",
            processed: "Procesado",
            replayed: "Reenviado",
            error: "Error",
            payload: "Payload",
            notAvailable: "No disponible",
            tableEmpty: "No hay resultados para esta busqueda.",
            ordersTitle: "Ordenes",
            ordersSearch: "Buscar por numero, cliente o correo",
            ordersStatus: "Filtrar por estado",
            orderNumber: "Orden",
            customer: "Cliente",
            total: "Total",
            orderStatus: "Estado",
            placed: "Creada",
            cancelOrder: "Anular",
            cancelTitle: "Anular orden",
            cancelConfirm: "Esta accion restaura el inventario reservado y registra la anulacion. El reembolso se gestiona manualmente.",
            cancelReasonLabel: "Motivo (opcional)",
            cancelReasonPlaceholder: "Motivo de la anulacion",
            cancelOk: "Orden anulada",
            cancelFail: "No se pudo anular la orden",
            cancelled: "Anulada",
          }
        : {
            title: "Operations",
            subtitle: "Sign in to review the audit trail, filter events, and replay payment webhooks.",
            authTitle: "Moderation access",
            authCopy: "The session is stored in a secure cookie until it expires or you sign out.",
            refresh: "Refresh",
            logout: "Sign out",
            replay: "Replay",
            replayConfirm: "Replay this webhook to the configured integrations?",
            cancel: "Cancel",
            replayOk: "Webhook replayed",
            replayFail: "Could not replay webhook",
            sessionExpired: "Your session expired. Sign in again.",
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
            auditDetails: "Audit details",
            webhookSearch: "Search topic, provider, or order",
            webhookStatus: "Filter by status",
            webhookDetails: "Webhook details",
            viewDetails: "View details",
            action: "Action",
            actor: "Actor",
            when: "When",
            details: "Details",
            topic: "Topic",
            provider: "Provider",
            order: "Order",
            status: "Status",
            created: "Created",
            processed: "Processed",
            replayed: "Replayed",
            error: "Error",
            payload: "Payload",
            notAvailable: "Not available",
            tableEmpty: "No results for this search.",
            ordersTitle: "Orders",
            ordersSearch: "Search by number, customer, or email",
            ordersStatus: "Filter by status",
            orderNumber: "Order",
            customer: "Customer",
            total: "Total",
            orderStatus: "Status",
            placed: "Placed",
            cancelOrder: "Cancel",
            cancelTitle: "Cancel order",
            cancelConfirm: "This restores reserved inventory and records the cancellation. Refunds are handled manually.",
            cancelReasonLabel: "Reason (optional)",
            cancelReasonPlaceholder: "Cancellation reason",
            cancelOk: "Order cancelled",
            cancelFail: "Could not cancel the order",
            cancelled: "Cancelled",
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
      const payload = await apiRequest<{ logs: AuditRow[]; total: number }>(
        buildUrl("/api/admin/audit-logs", {
          page: query.page,
          pageSize: query.pageSize,
          search: query.search,
          action: query.action,
        }),
        { cache: "no-store" },
      );
      setAuthorized(true);
      setLogs(payload.logs);
      setAuditTotal(payload.total);
      return true;
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setAuthorized(false);
        setLogs([]);
        setAuditTotal(0);
        return false;
      }
      api.error(formatApiError(error, locale, { fallback: labels.loadFail }));
      return false;
    } finally {
      setAuditLoading(false);
      setSessionReady(true);
    }
  };

  const loadWebhookEvents = async (query: WebhookQuery) => {
    setWebhookLoading(true);
    try {
      const payload = await apiRequest<{ events: WebhookRow[]; total: number }>(
        buildUrl("/api/admin/webhooks/payments", {
          page: query.page,
          pageSize: query.pageSize,
          search: query.search,
          status: query.status,
        }),
        { cache: "no-store" },
      );

      setAuthorized(true);
      setEvents(payload.events);
      setWebhookTotal(payload.total);
      return true;
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setAuthorized(false);
        setEvents([]);
        setWebhookTotal(0);
        return false;
      }
      api.error(formatApiError(error, locale, { fallback: labels.loadFail }));
      return false;
    } finally {
      setWebhookLoading(false);
      setSessionReady(true);
    }
  };

  const loadOutbox = async () => {
    setOutboxLoading(true);
    try {
      const payload = await apiRequest<{ events: OutboxRow[] }>("/api/admin/outbox?status=FAILED&pageSize=20", { cache: "no-store" });
      setOutbox(payload.events);
      return true;
    } catch (error) {
      if (isApiErrorStatus(error, 401)) setAuthorized(false);
      else api.error(formatApiError(error, locale, { fallback: labels.loadFail }));
      return false;
    } finally {
      setOutboxLoading(false);
    }
  };

  const loadOrders = async (query: OrderQuery) => {
    setOrderLoading(true);
    try {
      const payload = await apiRequest<{ orders: OrderRow[]; total: number }>(
        buildUrl("/api/admin/orders", {
          page: query.page,
          pageSize: query.pageSize,
          search: query.search,
          status: query.status,
        }),
        { cache: "no-store" },
      );
      setAuthorized(true);
      setOrders(payload.orders);
      setOrderTotal(payload.total);
      return true;
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setAuthorized(false);
        setOrders([]);
        setOrderTotal(0);
        return false;
      }
      api.error(formatApiError(error, locale, { fallback: labels.loadFail }));
      return false;
    } finally {
      setOrderLoading(false);
      setSessionReady(true);
    }
  };

  const refreshAll = async () => {
    const auditOk = await loadAuditLogs(auditQuery);
    if (!auditOk) {
      return;
    }

    await loadWebhookEvents(webhookQuery);
    await loadOutbox();
    await loadOrders(orderQuery);
  };

  const loadInitialData = useEffectEvent(() => refreshAll());

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadInitialData().catch(() => undefined);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const onLogin = async (credentials: { token?: string; email?: string; password?: string; otp?: string }) => {
    setLoginLoading(true);
    try {
      await apiRequest<{ ok: true }>("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      await refreshAll();
    } catch (error) {
      api.error(formatApiError(error, locale, { fallback: labels.loginFail, preserveClientMessage: false }));
    } finally {
      setLoginLoading(false);
      setSessionReady(true);
    }
  };

  const onLogout = async () => {
    await apiRequest<{ ok: true }>("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    setAuthorized(false);
    setLogs([]);
    setEvents([]);
    setAuditTotal(0);
    setWebhookTotal(0);
    setOutbox([]);
  };

  const replayOutbox = async (eventId: string) => {
    setReplayingEventId(eventId);
    try {
      await apiRequest("/api/admin/outbox/replay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId }) });
      await loadOutbox();
    } catch (error) {
      api.error(formatApiError(error, locale, { fallback: labels.replayFail }));
    } finally {
      setReplayingEventId(null);
    }
  };

  const replayWebhook = async (eventId: string) => {
    setReplayingEventId(eventId);
    try {
      await apiRequest<{ ok: true }>("/api/admin/webhooks/payments/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, actor: "slowfit-admin" }),
      });

      api.success(labels.replayOk);
      setSelectedEvent(null);
      await refreshAll();
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setAuthorized(false);
        api.warning(formatApiError(error, locale));
        return;
      }
      api.error(formatApiError(error, locale, { fallback: labels.replayFail }));
    } finally {
      setReplayingEventId(null);
    }
  };

  const confirmCancelOrder = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await apiRequest<{ ok: true }>(`/api/admin/orders/${encodeURIComponent(cancelTarget.id)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
      });
      api.success(labels.cancelOk);
      setCancelTarget(null);
      setCancelReason("");
      await loadOrders(orderQuery);
      await loadAuditLogs(auditQuery);
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setAuthorized(false);
        api.warning(formatApiError(error, locale));
        return;
      }
      api.error(formatApiError(error, locale, { fallback: labels.cancelFail }));
    } finally {
      setCancelling(false);
    }
  };

  const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleString(locale === "es" ? "es-CR" : "en-US") : labels.notAvailable;

  const replayAction = (record: WebhookRow, block = false) => (
    <Popconfirm
      title={labels.replayConfirm}
      okText={labels.replay}
      cancelText={labels.cancel}
      onConfirm={() => replayWebhook(record.id)}
      disabled={replayingEventId !== null}
    >
      <Button
        icon={<RedoOutlined />}
        size={block ? "middle" : "small"}
        block={block}
        loading={replayingEventId === record.id}
        disabled={replayingEventId !== null && replayingEventId !== record.id}
      >
        {labels.replay}
      </Button>
    </Popconfirm>
  );

  const logColumns: ColumnsType<AuditRow> = [
    {
      title: labels.action,
      dataIndex: "action",
      key: "action",
      width: 260,
    },
    {
      title: labels.actor,
      dataIndex: "actor",
      key: "actor",
      width: 160,
    },
    {
      title: labels.when,
      dataIndex: "createdAt",
      key: "createdAt",
      width: 220,
      render: (value: string) => formatDate(value),
    },
    {
      title: "",
      key: "details",
      width: 150,
      render: (_value, record) => (
        <Button icon={<EyeOutlined />} size="small" onClick={() => setSelectedAudit(record)}>
          {labels.viewDetails}
        </Button>
      ),
    },
  ];

  const eventColumns: ColumnsType<WebhookRow> = [
    {
      title: labels.topic,
      dataIndex: "topic",
      key: "topic",
      width: 180,
    },
    {
      title: labels.order,
      dataIndex: "orderId",
      key: "orderId",
      width: 120,
      render: (value: string | null | undefined) => value || "-",
    },
    {
      title: labels.status,
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (value: string) => <Tag color={value === "FAILED" ? "error" : "success"}>{value}</Tag>,
    },
    {
      title: labels.created,
      dataIndex: "createdAt",
      key: "createdAt",
      width: 220,
      render: (value: string) => formatDate(value),
    },
    {
      title: labels.replayed,
      dataIndex: "replayedAt",
      key: "replayedAt",
      width: 220,
      render: (value: string | null | undefined) => formatDate(value),
    },
    {
      title: "",
      key: "action",
      width: 210,
      render: (_value, record) => (
        <Space>
          <Button icon={<EyeOutlined />} size="small" onClick={() => setSelectedEvent(record)}>
            {labels.viewDetails}
          </Button>
          {replayAction(record)}
        </Space>
      ),
    },
  ];

  const orderColumns: ColumnsType<OrderRow> = [
    {
      title: labels.orderNumber,
      dataIndex: "orderNumber",
      key: "orderNumber",
      width: 120,
      render: (value: string | null | undefined, record) => value || record.id.slice(0, 8),
    },
    {
      title: labels.customer,
      key: "customer",
      width: 220,
      render: (_value, record) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text>{record.name || "-"}</Typography.Text>
          <Typography.Text type="secondary">{record.email}</Typography.Text>
        </Space>
      ),
    },
    {
      title: labels.total,
      key: "total",
      width: 130,
      render: (_value, record) => (record.total ? `${record.total} ${record.currency || ""}`.trim() : "-"),
    },
    {
      title: labels.orderStatus,
      key: "orderStatus",
      width: 150,
      render: (_value, record) =>
        record.cancelledAt ? (
          <Tag color="error">{labels.cancelled}</Tag>
        ) : (
          <Tag color="success">{record.financialStatus || labels.orderStatus}</Tag>
        ),
    },
    {
      title: labels.placed,
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 200,
      render: (value: string) => formatDate(value),
    },
    {
      title: "",
      key: "action",
      width: 130,
      render: (_value, record) =>
        record.cancelledAt ? null : (
          <Button
            danger
            size="small"
            onClick={() => {
              setCancelReason("");
              setCancelTarget(record);
            }}
          >
            {labels.cancelOrder}
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

            <DeliveryOpsPanel locale={locale} onUnauthorized={() => setAuthorized(false)} />

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
              {screens.md ? (
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
                  scroll={{ x: 1040 }}
                  className="slowfit-admin-table"
                />
              ) : (
                <Spin spinning={webhookLoading}>
                  <div className="slowfit-webhook-list">
                    {events.length === 0 ? <Empty description={labels.tableEmpty} /> : null}
                    {events.map((event) => (
                      <article className="slowfit-webhook-item" key={event.id}>
                        <Space className="slowfit-webhook-item-heading">
                          <Typography.Text strong>{event.topic}</Typography.Text>
                          <Tag color={event.status === "FAILED" ? "error" : "success"}>{event.status}</Tag>
                        </Space>
                        <Typography.Text type="secondary">{event.orderId || event.provider}</Typography.Text>
                        <Typography.Text type="secondary">{formatDate(event.createdAt)}</Typography.Text>
                        {event.errorMessage ? <Alert type="error" showIcon title={event.errorMessage} /> : null}
                        <Space.Compact block>
                          <Button icon={<EyeOutlined />} block onClick={() => setSelectedEvent(event)}>
                            {labels.viewDetails}
                          </Button>
                          {replayAction(event, true)}
                        </Space.Compact>
                      </article>
                    ))}
                  </div>
                  {webhookTotal > webhookQuery.pageSize ? (
                    <Pagination
                      className="slowfit-admin-pagination"
                      align="center"
                      current={webhookQuery.page}
                      pageSize={webhookQuery.pageSize}
                      total={webhookTotal}
                      size="small"
                      onChange={(page) => {
                      const next = { ...webhookQuery, page };
                      setWebhookQuery(next);
                      void loadWebhookEvents(next);
                      }}
                    />
                  ) : null}
                </Spin>
              )}
            </section>

            <section className="slowfit-policy-card slowfit-admin-card">
              <Typography.Title level={4}>Failed outbox jobs</Typography.Title>
              <Button onClick={() => void loadOutbox()} loading={outboxLoading}>Refresh</Button>
              <Table
                rowKey="id"
                columns={[
                  { title: "Type", dataIndex: "kind", key: "kind" },
                  { title: "Destination", dataIndex: "destination", key: "destination" },
                  { title: "Attempts", dataIndex: "attempts", key: "attempts" },
                  { title: "Error", dataIndex: "lastError", key: "lastError" },
                  {
                    title: "",
                    key: "replay",
                    render: (_value: unknown, record: OutboxRow) => (
                      <Button size="small" icon={<RedoOutlined />} loading={replayingEventId === record.id} onClick={() => void replayOutbox(record.id)}>
                        Replay
                      </Button>
                    ),
                  },
                ]}
                dataSource={outbox}
                loading={outboxLoading}
                pagination={false}
                locale={{ emptyText: labels.tableEmpty }}
                scroll={{ x: 800 }}
              />
            </section>

            <section className="slowfit-policy-card slowfit-admin-card">
              <Space className="slowfit-admin-controls" wrap>
                <Input.Search
                  allowClear
                  placeholder={labels.ordersSearch}
                  value={orderQuery.search}
                  onSearch={(value) => {
                    const next = { ...orderQuery, search: value.trim(), page: 1 };
                    setOrderQuery(next);
                    void loadOrders(next);
                  }}
                  onChange={(event) => setOrderQuery((current) => ({ ...current, search: event.target.value }))}
                  style={{ minWidth: 260 }}
                />
                <Select
                  value={orderQuery.status}
                  onChange={(value) => {
                    const next = { ...orderQuery, status: value, page: 1 };
                    setOrderQuery(next);
                    void loadOrders(next);
                  }}
                  options={ORDER_STATUS_OPTIONS}
                  style={{ minWidth: 180 }}
                />
              </Space>
              <Typography.Title level={4}>{labels.ordersTitle}</Typography.Title>
              {screens.md ? (
                <Table
                  rowKey="id"
                  columns={orderColumns}
                  dataSource={orders}
                  loading={orderLoading}
                  locale={{ emptyText: labels.tableEmpty }}
                  pagination={{
                    current: orderQuery.page,
                    pageSize: orderQuery.pageSize,
                    total: orderTotal,
                    showSizeChanger: true,
                    onChange: (page, pageSize) => {
                      const next = { ...orderQuery, page, pageSize: pageSize || orderQuery.pageSize };
                      setOrderQuery(next);
                      void loadOrders(next);
                    },
                  }}
                  scroll={{ x: 1040 }}
                  className="slowfit-admin-table"
                />
              ) : (
                <Spin spinning={orderLoading}>
                  <div className="slowfit-webhook-list">
                    {orders.length === 0 ? <Empty description={labels.tableEmpty} /> : null}
                    {orders.map((order) => (
                      <article className="slowfit-webhook-item" key={order.id}>
                        <Space className="slowfit-webhook-item-heading">
                          <Typography.Text strong>{order.orderNumber || order.id.slice(0, 8)}</Typography.Text>
                          {order.cancelledAt ? <Tag color="error">{labels.cancelled}</Tag> : null}
                        </Space>
                        <Typography.Text type="secondary">{order.name || order.email}</Typography.Text>
                        <Typography.Text type="secondary">{formatDate(order.updatedAt)}</Typography.Text>
                        {order.cancelledAt ? null : (
                          <Button danger block onClick={() => { setCancelReason(""); setCancelTarget(order); }}>
                            {labels.cancelOrder}
                          </Button>
                        )}
                      </article>
                    ))}
                  </div>
                  {orderTotal > orderQuery.pageSize ? (
                    <Pagination
                      className="slowfit-admin-pagination"
                      align="center"
                      current={orderQuery.page}
                      pageSize={orderQuery.pageSize}
                      total={orderTotal}
                      size="small"
                      onChange={(page) => {
                        const next = { ...orderQuery, page };
                        setOrderQuery(next);
                        void loadOrders(next);
                      }}
                    />
                  ) : null}
                </Spin>
              )}
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
              {screens.md ? (
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
                  className="slowfit-admin-table"
                />
              ) : (
                <Spin spinning={auditLoading}>
                  <div className="slowfit-webhook-list">
                    {logs.length === 0 ? <Empty description={labels.tableEmpty} /> : null}
                    {logs.map((log) => (
                      <article className="slowfit-webhook-item" key={log.id}>
                        <Typography.Text strong>{log.action}</Typography.Text>
                        <Typography.Text type="secondary">{log.actor}</Typography.Text>
                        <Typography.Text type="secondary">{formatDate(log.createdAt)}</Typography.Text>
                        <Button icon={<EyeOutlined />} block onClick={() => setSelectedAudit(log)}>
                          {labels.viewDetails}
                        </Button>
                      </article>
                    ))}
                  </div>
                  {auditTotal > auditQuery.pageSize ? (
                    <Pagination
                      className="slowfit-admin-pagination"
                      align="center"
                      current={auditQuery.page}
                      pageSize={auditQuery.pageSize}
                      total={auditTotal}
                      size="small"
                      onChange={(page) => {
                        const next = { ...auditQuery, page };
                        setAuditQuery(next);
                        void loadAuditLogs(next);
                      }}
                    />
                  ) : null}
                </Spin>
              )}
            </section>
      </AdminShell>
      <Drawer
        title={labels.webhookDetails}
        open={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
        size={screens.md ? 620 : "100%"}
        extra={selectedEvent ? replayAction(selectedEvent) : null}
      >
        {selectedEvent ? (
          <Space orientation="vertical" size="large" className="slowfit-webhook-detail">
            {selectedEvent.errorMessage ? (
              <Alert type="error" showIcon title={labels.error} description={selectedEvent.errorMessage} />
            ) : null}
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label={labels.topic}>{selectedEvent.topic}</Descriptions.Item>
              <Descriptions.Item label={labels.provider}>{selectedEvent.provider}</Descriptions.Item>
              <Descriptions.Item label={labels.order}>
                {selectedEvent.orderId || labels.notAvailable}
              </Descriptions.Item>
              <Descriptions.Item label={labels.status}>
                <Tag color={selectedEvent.status === "FAILED" ? "error" : "success"}>
                  {selectedEvent.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={labels.created}>{formatDate(selectedEvent.createdAt)}</Descriptions.Item>
              <Descriptions.Item label={labels.processed}>
                {formatDate(selectedEvent.processedAt)}
              </Descriptions.Item>
              <Descriptions.Item label={labels.replayed}>{formatDate(selectedEvent.replayedAt)}</Descriptions.Item>
            </Descriptions>
            <div>
              <Typography.Title level={5}>{labels.payload}</Typography.Title>
              <pre className="slowfit-admin-json slowfit-webhook-payload">
                {JSON.stringify(selectedEvent.payload, null, 2)}
              </pre>
            </div>
          </Space>
        ) : null}
      </Drawer>
      <Drawer
        title={labels.auditDetails}
        open={selectedAudit !== null}
        onClose={() => setSelectedAudit(null)}
        size={screens.md ? 560 : "100%"}
      >
        {selectedAudit ? (
          <Space orientation="vertical" size="large" className="slowfit-webhook-detail">
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label={labels.action}>{selectedAudit.action}</Descriptions.Item>
              <Descriptions.Item label={labels.actor}>{selectedAudit.actor}</Descriptions.Item>
              <Descriptions.Item label={labels.when}>{formatDate(selectedAudit.createdAt)}</Descriptions.Item>
            </Descriptions>
            <div>
              <Typography.Title level={5}>{labels.details}</Typography.Title>
              <pre className="slowfit-admin-json slowfit-webhook-payload">
                {JSON.stringify(selectedAudit.details, null, 2)}
              </pre>
            </div>
          </Space>
        ) : null}
      </Drawer>
      <Modal
        title={labels.cancelTitle}
        open={cancelTarget !== null}
        onCancel={() => {
          if (!cancelling) {
            setCancelTarget(null);
            setCancelReason("");
          }
        }}
        onOk={() => void confirmCancelOrder()}
        okText={labels.cancelOrder}
        cancelText={labels.cancel}
        okButtonProps={{ danger: true, loading: cancelling }}
        cancelButtonProps={{ disabled: cancelling }}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
          <Typography.Paragraph>{labels.cancelConfirm}</Typography.Paragraph>
          {cancelTarget ? (
            <Typography.Text type="secondary">
              {cancelTarget.orderNumber || cancelTarget.id.slice(0, 8)} · {cancelTarget.name || cancelTarget.email}
            </Typography.Text>
          ) : null}
          <div>
            <Typography.Text>{labels.cancelReasonLabel}</Typography.Text>
            <Input.TextArea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder={labels.cancelReasonPlaceholder}
              maxLength={280}
              rows={3}
              disabled={cancelling}
            />
          </div>
        </Space>
      </Modal>
    </>
  );
}
