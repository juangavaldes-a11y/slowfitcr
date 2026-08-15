import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";

process.env.REVIEW_MODERATION_TOKEN = "integration-token";
process.env.REVIEW_MODERATION_SESSION_SECRET = "integration-session-secret";
process.env.SHOPIFY_WEBHOOK_SECRET = "integration-webhook-secret";
process.env.RATE_LIMIT_MAX = "2";
process.env.RATE_LIMIT_AUTH_MAX = "20";

const prisma = new PrismaClient();
let route;
let disconnectDatabase;

function request(path, init = {}) {
  return new Request(`http://integration.test${path}`, init);
}

async function json(response) {
  return response.json();
}

async function loginCookie() {
  const response = await route(request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "integration-token" }),
  }));
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}

before(async () => {
  ({ route, disconnectDatabase } = await import("../server.mjs"));
});

beforeEach(async () => {
  await prisma.orderWebhookEvent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.review.deleteMany();
});

after(async () => {
  await prisma.$disconnect();
  await disconnectDatabase();
});

test("admin login creates a reusable session and logout clears it", async () => {
  const invalid = await route(request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "wrong" }),
  }));
  assert.equal(invalid.status, 401);

  const cookie = await loginCookie();
  const protectedResponse = await route(request("/api/admin/audit-logs?page=1&pageSize=5", {
    headers: { Cookie: cookie },
  }));
  assert.equal(protectedResponse.status, 200);
  assert.equal((await json(protectedResponse)).pageSize, 5);

  const logout = await route(request("/api/admin/logout", { method: "POST", headers: { Cookie: cookie } }));
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
});

test("review history supports status filters, search, and pagination", async () => {
  await prisma.review.createMany({
    data: [
      { productHandle: "performance-top", locale: "en", rating: 5, author: "Alex", email: "alex@example.com", content: "Excellent training top", status: "APPROVED" },
      { productHandle: "performance-top", locale: "en", rating: 3, author: "Sam", email: "sam@example.com", content: "Pending review content", status: "PENDING" },
      { productHandle: "accessory-bag", locale: "es", rating: 2, author: "Maria", email: "maria@example.com", content: "Review already rejected", status: "REJECTED" },
    ],
  });

  const cookie = await loginCookie();
  const response = await route(request("/api/reviews/pending?page=1&pageSize=1&status=APPROVED&search=alex", {
    headers: { Cookie: cookie },
  }));
  const payload = await json(response);

  assert.equal(response.status, 200);
  assert.equal(payload.total, 1);
  assert.equal(payload.pageSize, 1);
  assert.equal(payload.reviews[0].author, "Alex");
});

test("rate limiting returns 429 after the configured request budget", async () => {
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify({ eventName: "integration.event" }),
  };

  assert.equal((await route(request("/api/events", init))).status, 200);
  assert.equal((await route(request("/api/events", init))).status, 200);
  const limited = await route(request("/api/events", init));
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("retry-after"));
});

test("Shopify webhooks verify signatures and ignore duplicate deliveries", async () => {
  const body = JSON.stringify({ id: 991, order_number: 42, updated_at: "2026-08-15T00:00:00Z", line_items: [] });
  const signature = createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET).update(body, "utf8").digest("base64");
  const headers = {
    "Content-Type": "application/json",
    "x-forwarded-for": "203.0.113.21",
    "x-shopify-hmac-sha256": signature,
    "x-shopify-topic": "orders/create",
    "x-shopify-shop-domain": "slowfit-test.myshopify.com",
  };

  const invalid = await route(request("/api/webhooks/shopify/orders", {
    method: "POST",
    headers: { ...headers, "x-forwarded-for": "203.0.113.20", "x-shopify-hmac-sha256": "invalid" },
    body,
  }));
  assert.equal(invalid.status, 401);

  const first = await route(request("/api/webhooks/shopify/orders", { method: "POST", headers, body }));
  assert.equal(first.status, 200);

  const duplicate = await route(request("/api/webhooks/shopify/orders", { method: "POST", headers, body }));
  assert.deepEqual(await json(duplicate), { ok: true, duplicate: true });
  assert.equal(await prisma.orderWebhookEvent.count(), 1);
});

test("authenticated moderators can replay a stored webhook event", async () => {
  const event = await prisma.orderWebhookEvent.create({
    data: {
      idempotencyKey: "orders/create:replay:1",
      topic: "orders/create",
      shop: "slowfit-test.myshopify.com",
      orderId: "replay-order",
      payload: { id: "replay-order", line_items: [] },
      status: "PROCESSED",
    },
  });
  const cookie = await loginCookie();
  const response = await route(request("/api/admin/webhooks/orders/replay", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: event.id, actor: "integration-admin" }),
  }));

  assert.equal(response.status, 200);
  const updated = await prisma.orderWebhookEvent.findUnique({ where: { id: event.id } });
  assert.ok(updated.replayedAt);
});
