"use client";

import { Button, Checkbox, Input, Modal, Pagination, Select, Space, Tag, Typography, message } from "antd";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import AdminShell from "./admin-shell";

type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

type Review = {
  id: string;
  productHandle: string;
  locale: "es" | "en";
  rating: number;
  author: string;
  email?: string | null;
  content: string;
  createdAt: string;
  status: ReviewStatus;
  moderatedAt?: string | null;
  moderatedBy?: string | null;
};

type ReviewModerationPanelProps = { locale: "es" | "en" };
type ReviewQuery = {
  page: number;
  pageSize: number;
  search: string;
  status: ReviewStatus | "all";
  locale: "es" | "en" | "all";
  rating: number | "all";
  createdFrom: string;
  createdTo: string;
};

const DEFAULT_QUERY: ReviewQuery = { page: 1, pageSize: 12, search: "", status: "PENDING", locale: "all", rating: "all", createdFrom: "", createdTo: "" };

export default function ReviewModerationPanel({ locale }: ReviewModerationPanelProps) {
  const [api, contextHolder] = message.useMessage();
  const [sessionReady, setSessionReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<ReviewQuery>(DEFAULT_QUERY);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [detailReview, setDetailReview] = useState<Review | null>(null);

  const labels = useMemo(() => locale === "es" ? {
    title: "Moderacion de resenas",
    subtitle: "Busca resenas, revisa el historial y gestiona las pendientes.",
    refresh: "Actualizar", approve: "Aprobar", reject: "Rechazar",
    empty: "No hay resenas para estos filtros.", loginError: "Credenciales invalidas",
    actionError: "No se pudo aplicar la accion", search: "Buscar producto, cliente o contenido",
    allStatuses: "Todos los estados", pending: "Pendientes", approved: "Aprobadas",
    rejected: "Rechazadas", moderatedBy: "Moderada por",
    locale: "Idioma", rating: "Calificacion", from: "Desde", to: "Hasta", all: "Todos",
    selectPage: "Seleccionar pagina", selected: "seleccionadas", bulkApprove: "Aprobar seleccionadas",
    bulkReject: "Rechazar seleccionadas", confirmBulk: "Confirma la moderacion de las resenas seleccionadas.",
    details: "Detalles", reset: "Limpiar filtros", bulkSuccess: "Resenas actualizadas",
  } : {
    title: "Review moderation",
    subtitle: "Search reviews, inspect moderation history, and manage pending submissions.",
    refresh: "Refresh", approve: "Approve", reject: "Reject",
    empty: "No reviews match these filters.", loginError: "Invalid credentials",
    actionError: "Could not apply action", search: "Search product, customer, or content",
    allStatuses: "All statuses", pending: "Pending", approved: "Approved",
    rejected: "Rejected", moderatedBy: "Moderated by",
    locale: "Language", rating: "Rating", from: "From", to: "To", all: "All",
    selectPage: "Select page", selected: "selected", bulkApprove: "Approve selected",
    bulkReject: "Reject selected", confirmBulk: "Confirm moderation of the selected reviews.",
    details: "Details", reset: "Reset filters", bulkSuccess: "Reviews updated",
  }, [locale]);

  const loadReviews = async (nextQuery: ReviewQuery) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextQuery.page),
        pageSize: String(nextQuery.pageSize),
        status: nextQuery.status,
      });
      if (nextQuery.search) params.set("search", nextQuery.search);
      if (nextQuery.locale !== "all") params.set("locale", nextQuery.locale);
      if (nextQuery.rating !== "all") params.set("rating", String(nextQuery.rating));
      if (nextQuery.createdFrom) params.set("createdFrom", new Date(`${nextQuery.createdFrom}T00:00:00`).toISOString());
      if (nextQuery.createdTo) params.set("createdTo", new Date(`${nextQuery.createdTo}T23:59:59`).toISOString());

      const response = await fetch(`/api/reviews/pending?${params}`, { cache: "no-store" });
      if (response.status === 401) {
        setAuthorized(false);
        setReviews([]);
        setTotal(0);
        return false;
      }
      if (!response.ok) throw new Error("load_failed");

      const payload = (await response.json()) as { reviews: Review[]; total: number };
      setReviews(payload.reviews);
      setTotal(payload.total);
      setSelectedIds([]);
      setAuthorized(true);
      return true;
    } catch {
      api.error(labels.actionError);
      return false;
    } finally {
      setLoading(false);
      setSessionReady(true);
    }
  };

  const loadInitialReviews = useEffectEvent(() => loadReviews(DEFAULT_QUERY));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadInitialReviews().catch(() => undefined);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const onLogin = async ({ token }: { token: string }) => {
    setLoginLoading(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      });
      if (!response.ok) { api.error(labels.loginError); return; }
      await loadReviews(query);
    } finally {
      setLoginLoading(false);
      setSessionReady(true);
    }
  };

  const onLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthorized(false);
    setReviews([]);
    setTotal(0);
  };

  const updateQuery = (changes: Partial<ReviewQuery>) => {
    const next = { ...query, ...changes };
    setQuery(next);
    void loadReviews(next);
  };

  const onModerate = async (reviewId: string, action: "approve" | "reject") => {
    const response = await fetch("/api/reviews/moderate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewId, action, moderator: "slowfit-admin" }),
    });
    if (!response.ok) { api.error(labels.actionError); return; }
    await loadReviews(query);
  };

  const onBulkModerate = (action: "approve" | "reject") => {
    Modal.confirm({
      title: action === "approve" ? labels.bulkApprove : labels.bulkReject,
      content: labels.confirmBulk,
      okButtonProps: { danger: action === "reject" },
      onOk: async () => {
        setBulkLoading(true);
        try {
          const response = await fetch("/api/reviews/moderate/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reviewIds: selectedIds, action, moderator: "slowfit-admin" }),
          });
          if (!response.ok) throw new Error("bulk_failed");
          api.success(labels.bulkSuccess);
          await loadReviews(query);
        } catch {
          api.error(labels.actionError);
        } finally {
          setBulkLoading(false);
        }
      },
    });
  };

  const statusOptions = [
    { value: "PENDING", label: labels.pending }, { value: "APPROVED", label: labels.approved },
    { value: "REJECTED", label: labels.rejected }, { value: "all", label: labels.allStatuses },
  ];

  return (
    <>
      {contextHolder}
      <AdminShell locale={locale} title={labels.title} subtitle={labels.subtitle}
        sessionReady={sessionReady} authorized={authorized} loginLoading={loginLoading}
        onLogin={onLogin} onLogout={onLogout}>
        <Space className="slowfit-admin-controls" wrap>
          <Input.Search allowClear value={query.search} placeholder={labels.search}
            onChange={(event) => setQuery((current) => ({ ...current, search: event.target.value }))}
            onSearch={(search) => updateQuery({ search: search.trim(), page: 1 })} style={{ minWidth: 300 }} />
          <Select value={query.status} options={statusOptions}
            onChange={(status) => updateQuery({ status, page: 1 })} style={{ minWidth: 180 }} />
          <Select value={query.locale} aria-label={labels.locale} options={[{ value: "all", label: labels.all }, { value: "es", label: "ES" }, { value: "en", label: "EN" }]}
            onChange={(value) => updateQuery({ locale: value, page: 1 })} style={{ minWidth: 120 }} />
          <Select value={query.rating} aria-label={labels.rating} options={[{ value: "all", label: labels.all }, ...[5, 4, 3, 2, 1].map((value) => ({ value, label: `${value}/5` }))]}
            onChange={(value) => updateQuery({ rating: value, page: 1 })} style={{ minWidth: 120 }} />
          <Input type="date" aria-label={labels.from} value={query.createdFrom} onChange={(event) => updateQuery({ createdFrom: event.target.value, page: 1 })} />
          <Input type="date" aria-label={labels.to} value={query.createdTo} onChange={(event) => updateQuery({ createdTo: event.target.value, page: 1 })} />
          <Button loading={loading} onClick={() => void loadReviews(query)}>{labels.refresh}</Button>
          <Button onClick={() => { setQuery(DEFAULT_QUERY); void loadReviews(DEFAULT_QUERY); }}>{labels.reset}</Button>
        </Space>

        {reviews.some((review) => review.status === "PENDING") ? <Space className="slowfit-admin-toolbar" wrap>
          <Checkbox checked={selectedIds.length > 0 && reviews.filter((review) => review.status === "PENDING").every((review) => selectedIds.includes(review.id))}
            onChange={(event) => setSelectedIds(event.target.checked ? reviews.filter((review) => review.status === "PENDING").map((review) => review.id) : [])}>{labels.selectPage}</Checkbox>
          <Typography.Text>{selectedIds.length} {labels.selected}</Typography.Text>
          <Button type="primary" disabled={!selectedIds.length} loading={bulkLoading} onClick={() => onBulkModerate("approve")}>{labels.bulkApprove}</Button>
          <Button danger disabled={!selectedIds.length} loading={bulkLoading} onClick={() => onBulkModerate("reject")}>{labels.bulkReject}</Button>
        </Space> : null}

        {!reviews.length && !loading ? <Typography.Paragraph>{labels.empty}</Typography.Paragraph> : (
          <div className="slowfit-admin-grid">
            {reviews.map((review) => (
              <article key={review.id} className="slowfit-policy-card">
                {review.status === "PENDING" ? <Checkbox checked={selectedIds.includes(review.id)} aria-label={`${labels.selected}: ${review.author}`}
                  onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, review.id] : current.filter((id) => id !== review.id))} /> : null}
                <Space className="slowfit-admin-card-meta" wrap>
                  <Tag>{review.productHandle}</Tag><Tag>{review.locale.toUpperCase()}</Tag><Tag>{review.rating}/5</Tag>
                  <Tag color={review.status === "APPROVED" ? "success" : review.status === "REJECTED" ? "error" : "warning"}>
                    {review.status}
                  </Tag>
                </Space>
                <Typography.Title level={5}>{review.author}</Typography.Title>
                <Typography.Paragraph>{review.content}</Typography.Paragraph>
                <Typography.Text type="secondary">{review.email || "-"}</Typography.Text>
                <Typography.Paragraph type="secondary" className="slowfit-admin-review-date">
                  {new Date(review.createdAt).toLocaleString()}
                  {review.moderatedBy ? ` · ${labels.moderatedBy}: ${review.moderatedBy}` : ""}
                </Typography.Paragraph>
                {review.status === "PENDING" ? <Space>
                  <Button type="primary" onClick={() => void onModerate(review.id, "approve")}>{labels.approve}</Button>
                  <Button danger onClick={() => void onModerate(review.id, "reject")}>{labels.reject}</Button>
                  <Button onClick={() => setDetailReview(review)}>{labels.details}</Button>
                </Space> : null}
                {review.status !== "PENDING" ? <Button onClick={() => setDetailReview(review)}>{labels.details}</Button> : null}
              </article>
            ))}
          </div>
        )}
        <Pagination current={query.page} pageSize={query.pageSize} total={total} showSizeChanger
          className="slowfit-admin-pagination" onChange={(page, pageSize) => updateQuery({ page, pageSize })} />
        <Modal open={Boolean(detailReview)} title={labels.details} footer={null} onCancel={() => setDetailReview(null)}>
          {detailReview ? <Space direction="vertical">
            <Typography.Text strong>{detailReview.author} · {detailReview.email || "-"}</Typography.Text>
            <Typography.Text>{detailReview.productHandle} · {detailReview.locale.toUpperCase()} · {detailReview.rating}/5</Typography.Text>
            <Typography.Paragraph>{detailReview.content}</Typography.Paragraph>
            <Typography.Text type="secondary">{new Date(detailReview.createdAt).toLocaleString(locale)}</Typography.Text>
            {detailReview.moderatedAt ? <Typography.Text type="secondary">{labels.moderatedBy}: {detailReview.moderatedBy || "-"} · {new Date(detailReview.moderatedAt).toLocaleString(locale)}</Typography.Text> : null}
          </Space> : null}
        </Modal>
      </AdminShell>
    </>
  );
}
