import "server-only";

import { randomUUID } from "node:crypto";
import type { Locale } from "../i18n";
import { fallbackApprovedReviews } from "../data/reviews";

export type ApprovedReview = {
  id: string;
  productHandle: string;
  locale: Locale | "all";
  rating: number;
  author: string;
  content: string;
  createdAt: string;
  source: "judge-me" | "manual";
};

export type PendingReview = {
  id: string;
  productHandle: string;
  locale: Locale;
  rating: number;
  author: string;
  email: string;
  content: string;
  createdAt: string;
  status: "pending";
};

const runtimeApproved: ApprovedReview[] = [];
const runtimePending: PendingReview[] = [];

type JudgeMeResponse = {
  reviews: Array<{
    id: number;
    product_handle?: string;
    rating: number;
    reviewer: {
      name: string;
    };
    body: string;
    created_at: string;
  }>;
};

async function getJudgeMeReviews(productHandle: string): Promise<ApprovedReview[]> {
  const domain = process.env.JUDGEME_SHOP_DOMAIN;
  const token = process.env.JUDGEME_PRIVATE_API_TOKEN;

  if (!domain || !token) {
    return [];
  }

  const url = new URL(`https://judge.me/api/v1/reviews`);
  url.searchParams.set("api_token", token);
  url.searchParams.set("shop_domain", domain);
  url.searchParams.set("product_handle", productHandle);
  url.searchParams.set("per_page", "20");
  url.searchParams.set("published", "true");

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as JudgeMeResponse;
  return payload.reviews
    .filter((item) => item.body)
    .map((item) => ({
      id: `jm-${item.id}`,
      productHandle,
      locale: "all",
      rating: item.rating,
      author: item.reviewer?.name || "Verified buyer",
      content: item.body,
      createdAt: item.created_at,
      source: "judge-me",
    }));
}

export async function getApprovedReviews(productHandle: string, locale: Locale): Promise<ApprovedReview[]> {
  const external = await getJudgeMeReviews(productHandle);
  if (external.length) {
    return external;
  }

  const staticReviews = fallbackApprovedReviews.filter(
    (review) => review.productHandle === productHandle && (review.locale === "all" || review.locale === locale),
  );

  const runtime = runtimeApproved.filter(
    (review) => review.productHandle === productHandle && (review.locale === "all" || review.locale === locale),
  );

  return [...runtime, ...staticReviews];
}

export function listPendingReviews() {
  return runtimePending;
}

export async function submitReview(input: {
  productHandle: string;
  locale: Locale;
  rating: number;
  author: string;
  email: string;
  content: string;
}) {
  const pending: PendingReview = {
    id: randomUUID(),
    productHandle: input.productHandle,
    locale: input.locale,
    rating: input.rating,
    author: input.author,
    email: input.email,
    content: input.content,
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  runtimePending.push(pending);

  const webhook = process.env.REVIEWS_MODERATION_WEBHOOK_URL;
  if (webhook) {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "review.submitted", review: pending }),
    });
  }

  return pending;
}

export async function moderateReview(input: { reviewId: string; action: "approve" | "reject"; moderator?: string }) {
  const index = runtimePending.findIndex((review) => review.id === input.reviewId);
  if (index === -1) {
    return { ok: false as const, reason: "not_found" };
  }

  const pending = runtimePending[index];
  runtimePending.splice(index, 1);

  if (input.action === "approve") {
    runtimeApproved.unshift({
      id: pending.id,
      productHandle: pending.productHandle,
      locale: pending.locale,
      rating: pending.rating,
      author: pending.author,
      content: pending.content,
      createdAt: pending.createdAt,
      source: "manual",
    });
  }

  const webhook = process.env.REVIEWS_MODERATION_WEBHOOK_URL;
  if (webhook) {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "review.moderated", action: input.action, review: pending, moderator: input.moderator }),
    });
  }

  return { ok: true as const };
}
