"use client";

import { Button, Form, Input, Rate, Space, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";
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
            author: "Name",
            email: "Email",
            comment: "Comment",
          },
    [locale],
  );

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/reviews?productHandle=${encodeURIComponent(productHandle)}&locale=${locale}`);
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { reviews: Review[]; average: number; count: number };
        if (!active) {
          return;
        }

        setReviews(data.reviews);
        setAverage(data.average);
        setCount(data.count);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [locale, productHandle]);

  const onSubmit = async (values: ReviewFormValues) => {
    const response = await fetch("/api/reviews/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productHandle,
        locale,
        rating: values.rating,
        author: values.author,
        email: values.email,
        content: values.content,
      }),
    });

    if (!response.ok) {
      api.error(labels.error);
      return;
    }

    trackEvent("review_submitted", { product_handle: productHandle, locale });
    form.resetFields();
    api.success(labels.pending);
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
      {loading ? (
        <Typography.Paragraph>Loading...</Typography.Paragraph>
      ) : reviews.length ? (
        reviews.slice(0, 4).map((review) => (
          <Typography.Paragraph key={review.id} className="slowfit-review-quote">
            "{review.content}" - {review.author}
          </Typography.Paragraph>
        ))
      ) : (
        <Typography.Paragraph className="slowfit-review-quote">{labels.empty}</Typography.Paragraph>
      )}

      <Typography.Title level={5}>{labels.submitTitle}</Typography.Title>
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
          <Button type="primary" htmlType="submit">
            {labels.submit}
          </Button>
        </Space>
      </Form>
    </section>
  );
}
