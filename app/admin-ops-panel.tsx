"use client";

import { Button, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";

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

export default function AdminOpsPanel({ locale }: AdminOpsPanelProps) {
  const [api, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [events, setEvents] = useState<WebhookRow[]>([]);

  const labels = useMemo(
    () =>
      locale === "es"
        ? {
            title: "Operaciones",
            subtitle: "Auditoria del sistema y replay manual de webhooks de pedidos.",
            refresh: "Actualizar",
            replay: "Reenviar",
            replayOk: "Webhook reenviado",
            replayFail: "No se pudo reenviar",
            loadFail: "No se pudo cargar la informacion",
            auditTitle: "Registro de auditoria",
            webhookTitle: "Eventos de webhook",
          }
        : {
            title: "Operations",
            subtitle: "System audit trail and manual replay of order webhook events.",
            refresh: "Refresh",
            replay: "Replay",
            replayOk: "Webhook replayed",
            replayFail: "Could not replay webhook",
            loadFail: "Could not load data",
            auditTitle: "Audit log",
            webhookTitle: "Webhook events",
          },
    [locale],
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const [logsRes, eventsRes] = await Promise.all([
        fetch("/api/admin/audit-logs?limit=200", { cache: "no-store" }),
        fetch("/api/admin/webhooks/orders?limit=100", { cache: "no-store" }),
      ]);

      if (!logsRes.ok || !eventsRes.ok) {
        throw new Error("load_failed");
      }

      const logsPayload = (await logsRes.json()) as { logs: AuditRow[] };
      const eventsPayload = (await eventsRes.json()) as { events: WebhookRow[] };

      setLogs(logsPayload.logs);
      setEvents(eventsPayload.events);
    } catch {
      api.error(labels.loadFail);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData().catch(() => undefined);
  }, []);

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
    await loadData();
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
      render: (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : "-") ,
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
    <main className="slowfit-policy-page">
      {contextHolder}
      <section className="slowfit-shell slowfit-policy-hero">
        <span className="slowfit-kicker">Slow Fit Admin</span>
        <Typography.Title className="slowfit-display slowfit-section-title">{labels.title}</Typography.Title>
        <Typography.Paragraph className="slowfit-policy-lead">{labels.subtitle}</Typography.Paragraph>
      </section>
      <section className="slowfit-shell slowfit-policy-section">
        <Space className="slowfit-admin-toolbar" wrap>
          <Button onClick={() => loadData()} loading={loading}>
            {labels.refresh}
          </Button>
        </Space>
        <Typography.Title level={4}>{labels.webhookTitle}</Typography.Title>
        <Table
          rowKey="id"
          columns={eventColumns}
          dataSource={events}
          loading={loading}
          pagination={{ pageSize: 8 }}
          scroll={{ x: 980 }}
          className="slowfit-admin-table"
        />
        <Typography.Title level={4}>{labels.auditTitle}</Typography.Title>
        <Table
          rowKey="id"
          columns={logColumns}
          dataSource={logs}
          loading={loading}
          pagination={{ pageSize: 8 }}
          scroll={{ x: 1100 }}
          className="slowfit-admin-table"
        />
      </section>
    </main>
  );
}
