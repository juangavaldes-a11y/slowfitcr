"use client";

import { Button, Input, Pagination, Select, Space, Tag, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";
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
type ReviewQuery = { page: number; pageSize: number; search: string; status: ReviewStatus | "all" };

const DEFAULT_QUERY: ReviewQuery = { page: 1, pageSize: 12, search: "", status: "PENDING" };

export default function ReviewModerationPanel({ locale }: ReviewModerationPanelProps) {
  const [api, contextHolder] = message.useMessage();
  const [sessionReady, setSessionReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<ReviewQuery>(DEFAULT_QUERY);

  const labels = useMemo(() => locale === "es" ? {
    title: "Moderacion de resenas",
    subtitle: "Busca resenas, revisa el historial y gestiona las pendientes.",
    refresh: "Actualizar", approve: "Aprobar", reject: "Rechazar",
    empty: "No hay resenas para estos filtros.", loginError: "Credenciales invalidas",
    actionError: "No se pudo aplicar la accion", search: "Buscar producto, cliente o contenido",
    allStatuses: "Todos los estados", pending: "Pendientes", approved: "Aprobadas",
    rejected: "Rechazadas", moderatedBy: "Moderada por",
  } : {
    title: "Review moderation",
    subtitle: "Search reviews, inspect moderation history, and manage pending submissions.",
    refresh: "Refresh", approve: "Approve", reject: "Reject",
    empty: "No reviews match these filters.", loginError: "Invalid credentials",
    actionError: "Could not apply action", search: "Search product, customer, or content",
    allStatuses: "All statuses", pending: "Pending", approved: "Approved",
    rejected: "Rejected", moderatedBy: "Moderated by",
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

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadReviews(DEFAULT_QUERY).catch(() => undefined);
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
          <Button loading={loading} onClick={() => void loadReviews(query)}>{labels.refresh}</Button>
        </Space>

        {!reviews.length && !loading ? <Typography.Paragraph>{labels.empty}</Typography.Paragraph> : (
          <div className="slowfit-admin-grid">
            {reviews.map((review) => (
              <article key={review.id} className="slowfit-policy-card">
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
                </Space> : null}
              </article>
            ))}
          </div>
        )}
        <Pagination current={query.page} pageSize={query.pageSize} total={total} showSizeChanger
          className="slowfit-admin-pagination" onChange={(page, pageSize) => updateQuery({ page, pageSize })} />
      </AdminShell>
    </>
  );
}
