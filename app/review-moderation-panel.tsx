"use client";

import { Button, Form, Input, Select, Space, Tag, Typography, message } from "antd";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type PendingReview = {
  id: string;
  productHandle: string;
  locale: "es" | "en";
  rating: number;
  author: string;
  email: string;
  content: string;
  createdAt: string;
  status: "pending";
};

type ReviewModerationPanelProps = {
  locale: "es" | "en";
};

type LoginFormValues = {
  token: string;
};

export default function ReviewModerationPanel({ locale }: ReviewModerationPanelProps) {
  const [api, contextHolder] = message.useMessage();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [filterProduct, setFilterProduct] = useState<string>("all");

  const labels = useMemo(
    () =>
      locale === "es"
        ? {
            title: "Moderacion de resenas",
            subtitle: "Inicia sesion para revisar, aprobar o rechazar resenas pendientes.",
            token: "Token de moderacion",
            login: "Entrar",
            logout: "Salir",
            refresh: "Actualizar",
            approve: "Aprobar",
            reject: "Rechazar",
            empty: "No hay resenas pendientes.",
            unauthorized: "Debes autenticarte para continuar.",
            loginError: "Credenciales invalidas",
            actionError: "No se pudo aplicar la accion",
          }
        : {
            title: "Review moderation",
            subtitle: "Sign in to review, approve, or reject pending reviews.",
            token: "Moderation token",
            login: "Sign in",
            logout: "Sign out",
            refresh: "Refresh",
            approve: "Approve",
            reject: "Reject",
            empty: "No pending reviews.",
            unauthorized: "Authentication is required.",
            loginError: "Invalid credentials",
            actionError: "Could not apply action",
          },
    [locale],
  );

  const loadPending = useCallback(async () => {
    const response = await fetch("/api/reviews/pending", { cache: "no-store" });
    if (response.status === 401) {
      setAuthorized(false);
      return;
    }

    if (!response.ok) {
      api.error(labels.actionError);
      return;
    }

    const data = (await response.json()) as { pending: PendingReview[] };
    setPending(data.pending);
    setAuthorized(true);
  }, [api, labels.actionError]);

  const onLogin = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        api.error(labels.loginError);
        return;
      }

      await loadPending();
    } finally {
      setLoading(false);
    }
  };

  const onLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthorized(false);
    setPending([]);
  };

  const onModerate = async (reviewId: string, action: "approve" | "reject") => {
    const response = await fetch("/api/reviews/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewId, action, moderator: "slowfit-admin" }),
    });

    if (!response.ok) {
      api.error(labels.actionError);
      return;
    }

    setPending((current) => current.filter((review) => review.id !== reviewId));
  };

  const products = Array.from(new Set(pending.map((review) => review.productHandle)));
  const visible = filterProduct === "all" ? pending : pending.filter((review) => review.productHandle === filterProduct);

  useEffect(() => {
    loadPending().catch(() => undefined);
  }, [loadPending]);

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
          <Link href={`/${locale}/admin/reviews`}>
            <Button type="default">Reviews</Button>
          </Link>
          <Link href={`/${locale}/admin/ops`}>
            <Button type="default">Ops</Button>
          </Link>
        </Space>
        {!authorized ? (
          <article className="slowfit-policy-card">
            <Form layout="vertical" onFinish={onLogin}>
              <Form.Item name="token" label={labels.token} rules={[{ required: true }]}>
                <Input.Password autoComplete="off" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                {labels.login}
              </Button>
            </Form>
            <Typography.Paragraph className="slowfit-policy-lead">{labels.unauthorized}</Typography.Paragraph>
          </article>
        ) : (
          <>
            <Space className="slowfit-admin-toolbar" wrap>
              <Select
                value={filterProduct}
                onChange={(value) => setFilterProduct(value)}
                options={[{ value: "all", label: "All products" }, ...products.map((product) => ({ value: product, label: product }))]}
                style={{ minWidth: 220 }}
              />
              <Button onClick={loadPending}>{labels.refresh}</Button>
              <Button onClick={onLogout}>{labels.logout}</Button>
            </Space>
            {!visible.length ? (
              <Typography.Paragraph>{labels.empty}</Typography.Paragraph>
            ) : (
              <div className="slowfit-admin-grid">
                {visible.map((review) => (
                  <article key={review.id} className="slowfit-policy-card">
                    <Space className="slowfit-admin-card-meta" wrap>
                      <Tag>{review.productHandle}</Tag>
                      <Tag>{review.locale.toUpperCase()}</Tag>
                      <Tag>{review.rating}/5</Tag>
                    </Space>
                    <Typography.Title level={5}>{review.author}</Typography.Title>
                    <Typography.Paragraph>{review.content}</Typography.Paragraph>
                    <Typography.Text type="secondary">{review.email}</Typography.Text>
                    <Space style={{ marginTop: 12 }}>
                      <Button type="primary" onClick={() => onModerate(review.id, "approve")}>
                        {labels.approve}
                      </Button>
                      <Button danger onClick={() => onModerate(review.id, "reject")}>
                        {labels.reject}
                      </Button>
                    </Space>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
