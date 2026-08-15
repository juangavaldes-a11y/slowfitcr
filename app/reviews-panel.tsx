"use client";

import { Alert, Button, Empty, Form, Input, Rate, Skeleton, Space, Typography, message } from "antd";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { trackEvent } from "./lib/analytics";

type Review = {
  id: string;
  rating: number;
  author: string;
  content: string;
  createdAt: string;
};

type ReviewsPanelProps = {
  locale: "es" | "en";
  productHandle: string;
};

type ReviewFormValues = {
  author: string;
  email: string;
  rating: number;
  content: string;
};

export default function ReviewsPanel({ locale, productHandle }: ReviewsPanelProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(4);
  const [submissionId, setSubmissionId] = useState("");
  const [api, contextHolder] = message.useMessage();
  const [form] = Form.useForm<ReviewFormValues>();

  const labels = useMemo(
    () =>
      locale === "es"
        ? {
            title: "Resenas",
            empty: "Aun no hay resenas aprobadas para este producto.",
            submitTitle: "Comparte tu experiencia",
            submit: "Enviar resena",
            pending: "Resena enviada para moderacion.",
            error: "No fue posible enviar tu resena.",
            loadError: "No fue posible cargar las resenas.",
            retry: "Reintentar",
            showMore: "Ver mas resenas",
            reference: "Referencia",
            author: "Nombre",
            email: "Correo",
            comment: "Comentario",
          }
        : {
            title: "Reviews",
            empty: "No approved reviews yet for this product.",
            submitTitle: "Share your experience",
            submit: "Submit review",
            pending: "Review submitted for moderation.",
            error: "Could not submit your review.",
            loadError: "Could not load reviews.",
            retry: "Retry",
            showMore: "Show more reviews",
            reference: "Reference",
            author: "Name",
            email: "Email",
            comment: "Comment",
          },
    [locale],
  );

  const loadReviews = async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const response = await fetch(`/api/reviews?productHandle=${encodeURIComponent(productHandle)}&locale=${locale}`);
      if (!response.ok) throw new Error("load_failed");
      const data = (await response.json()) as { reviews: Review[]; average: number; count: number };
      setReviews(data.reviews);
      setAverage(data.average);
      setCount(data.count);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const loadInitialData = useEffectEvent(() => {
    void loadReviews();
    fetch("/api/auth/session")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (payload?.customer) {
          form.setFieldsValue({ author: payload.customer.firstName, email: payload.customer.email });
        }
      })
      .catch(() => undefined);
  });

  useEffect(() => {
    const timeout = window.setTimeout(loadInitialData, 0);
    return () => window.clearTimeout(timeout);
  }, [locale, productHandle]);

  const onSubmit = async (values: ReviewFormValues) => {
    setSubmitting(true);
    setSubmissionId("");
    try {
      const response = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productHandle, locale, ...values }),
      });
      if (!response.ok) throw new Error("submit_failed");
      const payload = (await response.json()) as { reviewId: string };
      setSubmissionId(payload.reviewId);
      trackEvent("review_submitted", { product_handle: productHandle, locale });
      form.resetFields(["rating", "content"]);
      api.success(labels.pending);
    } catch {
      api.error(labels.error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="slowfit-review-panel">
      {contextHolder}
      <Typography.Title level={4}>{labels.title}</Typography.Title>
      <div className="slowfit-review-summary">
        <Rate disabled allowHalf value={average} />
        <Typography.Text>
          {average ? average.toFixed(1) : "0.0"} ({count})
        </Typography.Text>
      </div>
      {loading ? <Skeleton active paragraph={{ rows: 3 }} /> : loadFailed ? (
        <Alert type="error" showIcon message={labels.loadError} action={<Button size="small" onClick={() => void loadReviews()}>{labels.retry}</Button>} />
      ) : reviews.length ? (
        <>
          {reviews.slice(0, visibleCount).map((review) => (
            <article key={review.id} className="slowfit-review-quote">
              <Rate disabled value={review.rating} />
              <Typography.Paragraph>&ldquo;{review.content}&rdquo;</Typography.Paragraph>
              <Typography.Text strong>{review.author}</Typography.Text>{" "}
              <Typography.Text type="secondary">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(review.createdAt))}</Typography.Text>
            </article>
          ))}
          {visibleCount < reviews.length ? <Button onClick={() => setVisibleCount((value) => value + 4)}>{labels.showMore}</Button> : null}
        </>
      ) : (
        <Empty description={labels.empty} />
      )}

      <Typography.Title level={5}>{labels.submitTitle}</Typography.Title>
      {submissionId ? <Alert type="success" showIcon message={labels.pending} description={`${labels.reference}: ${submissionId}`} /> : null}
      <Form form={form} layout="vertical" onFinish={onSubmit} className="slowfit-review-form">
        <Form.Item name="author" label={labels.author} rules={[{ required: true, min: 2 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="email" label={labels.email} rules={[{ required: true, type: "email" }]}>
          <Input />
        </Form.Item>
        <Form.Item name="rating" rules={[{ required: true }]}>
          <Rate />
        </Form.Item>
        <Form.Item name="content" label={labels.comment} rules={[{ required: true, min: 12 }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting}>
            {labels.submit}
          </Button>
        </Space>
      </Form>
    </section>
  );
}
