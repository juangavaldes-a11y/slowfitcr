"use client";

import { LinkOutlined, StopOutlined, TruckOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useEffectEvent, useState } from "react";
import { apiRequest, formatApiError, isApiErrorStatus } from "./lib/api-client";

type DeliveryRow = {
  id: string;
  paymentReference?: string | null;
  provider: "uber" | "didi";
  status: string;
  feeMinor: number;
  currency: string;
  contact: { name?: string; phone?: string };
  dropoff: { address?: { streetAddress?: string[]; city?: string; state?: string } };
  trackingUrl?: string | null;
  errorMessage?: string | null;
  createdAt: string;
};

const STATUS_OPTIONS = [
  "READY_TO_DISPATCH",
  "DISPATCHING",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
].map((status) => ({ value: status, label: status }));

function statusColor(status: string) {
  if (status === "COMPLETED") return "success";
  if (status === "FAILED" || status === "CANCELLED") return "error";
  if (status === "READY_TO_DISPATCH") return "warning";
  return "processing";
}

export default function DeliveryOpsPanel({ locale, onUnauthorized }: {
  locale: "es" | "en";
  onUnauthorized: () => void;
}) {
  const [api, contextHolder] = message.useMessage();
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const [mutatingId, setMutatingId] = useState<string>();
  const labels = locale === "es" ? {
    title: "Entregas",
    filter: "Filtrar por estado",
    provider: "Proveedor",
    recipient: "Destinatario",
    destination: "Destino",
    fee: "Costo",
    status: "Estado",
    created: "Creada",
    dispatch: "Aprobar y despachar",
    retry: "Reintentar",
    cancel: "Cancelar",
    cancelConfirm: "¿Cancelar esta entrega con el proveedor?",
    tracking: "Tracking",
    empty: "No hay entregas para este filtro.",
    loadFail: "No se pudieron cargar las entregas",
    actionFail: "No se pudo actualizar la entrega",
  } : {
    title: "Deliveries",
    filter: "Filter by status",
    provider: "Provider",
    recipient: "Recipient",
    destination: "Destination",
    fee: "Cost",
    status: "Status",
    created: "Created",
    dispatch: "Approve and dispatch",
    retry: "Retry",
    cancel: "Cancel",
    cancelConfirm: "Cancel this delivery with the provider?",
    tracking: "Tracking",
    empty: "No deliveries match this filter.",
    loadFail: "Could not load deliveries",
    actionFail: "Could not update delivery",
  };

  const loadDeliveries = async (nextPage = page, nextStatus = status) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: "8" });
      if (nextStatus !== "all") params.set("status", nextStatus);
      const payload = await apiRequest<{ deliveries: DeliveryRow[]; total: number }>(
        `/api/admin/deliveries?${params}`,
        { cache: "no-store" },
      );
      setDeliveries(payload.deliveries);
      setTotal(payload.total);
    } catch (error) {
      if (isApiErrorStatus(error, 401)) onUnauthorized();
      else api.error(formatApiError(error, locale, { fallback: labels.loadFail }));
    } finally {
      setLoading(false);
    }
  };

  const loadInitial = useEffectEvent(() => loadDeliveries(1, "all"));
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadInitial();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const mutate = async (delivery: DeliveryRow, action: "dispatch" | "cancel") => {
    setMutatingId(delivery.id);
    try {
      await apiRequest(`/api/admin/deliveries/${delivery.id}/${action}`, { method: "POST" });
      await loadDeliveries();
    } catch (error) {
      if (isApiErrorStatus(error, 401)) onUnauthorized();
      else api.error(formatApiError(error, locale, { fallback: labels.actionFail }));
    } finally {
      setMutatingId(undefined);
    }
  };

  const columns: ColumnsType<DeliveryRow> = [
    {
      title: labels.provider,
      dataIndex: "provider",
      width: 110,
      render: (value: string) => value === "uber" ? "Uber Direct" : "DiDi",
    },
    {
      title: labels.recipient,
      width: 190,
      render: (_value, row) => <Space orientation="vertical" size={0}>
        <Typography.Text strong>{row.contact.name || "-"}</Typography.Text>
        <Typography.Text type="secondary">{row.contact.phone || "-"}</Typography.Text>
      </Space>,
    },
    {
      title: labels.destination,
      width: 260,
      render: (_value, row) => [
        ...(row.dropoff.address?.streetAddress ?? []),
        row.dropoff.address?.city,
        row.dropoff.address?.state,
      ].filter(Boolean).join(", "),
    },
    {
      title: labels.fee,
      width: 120,
      render: (_value, row) => new Intl.NumberFormat(locale === "es" ? "es-CR" : "en-US", {
        style: "currency",
        currency: row.currency,
      }).format(row.feeMinor / 100),
    },
    {
      title: labels.status,
      dataIndex: "status",
      width: 170,
      render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>,
    },
    {
      title: labels.created,
      dataIndex: "createdAt",
      width: 180,
      render: (value: string) => new Date(value).toLocaleString(locale === "es" ? "es-CR" : "en-US"),
    },
    {
      title: "",
      width: 240,
      fixed: "right",
      render: (_value, row) => <Space>
        {["READY_TO_DISPATCH", "FAILED"].includes(row.status) ? (
          <Button
            size="small"
            type="primary"
            icon={<TruckOutlined />}
            loading={mutatingId === row.id}
            onClick={() => void mutate(row, "dispatch")}
          >
            {row.status === "FAILED" ? labels.retry : labels.dispatch}
          </Button>
        ) : null}
        {row.trackingUrl ? (
          <Button size="small" icon={<LinkOutlined />} href={row.trackingUrl} target="_blank">
            {labels.tracking}
          </Button>
        ) : null}
        {["ACTIVE", "DISPATCHING"].includes(row.status) ? (
          <Popconfirm title={labels.cancelConfirm} onConfirm={() => void mutate(row, "cancel")}>
            <Button size="small" danger icon={<StopOutlined />} loading={mutatingId === row.id}>
              {labels.cancel}
            </Button>
          </Popconfirm>
        ) : null}
      </Space>,
    },
  ];

  return <section className="slowfit-policy-card slowfit-admin-card">
    {contextHolder}
    <Space className="slowfit-admin-controls" wrap>
      <Typography.Title level={4}>{labels.title}</Typography.Title>
      <Select
        aria-label={labels.filter}
        value={status}
        options={[{ value: "all", label: labels.filter }, ...STATUS_OPTIONS]}
        onChange={(value) => {
          setStatus(value);
          setPage(1);
          void loadDeliveries(1, value);
        }}
        style={{ minWidth: 220 }}
      />
    </Space>
    <Table
      rowKey="id"
      columns={columns}
      dataSource={deliveries}
      loading={loading}
      locale={{ emptyText: labels.empty }}
      scroll={{ x: 1280 }}
      pagination={{
        current: page,
        pageSize: 8,
        total,
        showSizeChanger: false,
        onChange: (nextPage) => {
          setPage(nextPage);
          void loadDeliveries(nextPage, status);
        },
      }}
    />
  </section>;
}