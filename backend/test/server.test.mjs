import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";

process.env.REVIEW_MODERATION_TOKEN = "integration-token";
process.env.REVIEW_MODERATION_SESSION_SECRET = "integration-session-secret";
process.env.SHOPIFY_WEBHOOK_SECRET = "integration-webhook-secret";
process.env.RATE_LIMIT_MAX = "2";
process.env.RATE_LIMIT_AUTH_MAX = "20";
process.env.HOST = "127.0.0.1";
process.env.PORT = "0";

const prisma = new PrismaClient();
let route;
let disconnectDatabase;
let startServer;
let requestSequence = 1;

function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("x-forwarded-for")) {
    headers.set("x-forwarded-for", `198.51.100.${requestSequence}`);
    requestSequence += 1;
  }
  return new Request(`http://integration.test${path}`, { ...init, headers });
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
  ({ route, disconnectDatabase, startServer } = await import("../server.mjs"));
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

test("health and unknown routes return their documented responses", async () => {
  const live = await route(request("/health/live"));
  assert.deepEqual(await json(live), { ok: true, service: "slowfit-backend" });

  const ready = await route(request("/health/ready"));
  assert.equal(ready.status, 200);
  assert.deepEqual(await json(ready), { ok: true, db: "ready" });

  const missing = await route(request("/missing"));
  assert.equal(missing.status, 404);
  assert.deepEqual(await json(missing), { error: "Not found" });
});

test("contact and analytics endpoints validate and persist accepted payloads", async () => {
  const invalidContact = await route(request("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "A", email: "invalid", message: "short" }),
  }));
  assert.equal(invalidContact.status, 400);

  const contact = await route(request("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Customer", email: "customer@example.com", message: "Please help with sizing", locale: "en" }),
  }));
  assert.equal(contact.status, 200);

  const invalidEvent = await route(request("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }));
  assert.equal(invalidEvent.status, 400);

  const event = await route(request("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName: "product_viewed", page: "/en/product/test", locale: "en" }),
  }));
  assert.equal(event.status, 200);
  assert.equal(await prisma.auditLog.count(), 2);
});

test("checkout validates empty carts and returns fallback sessions without Shopify credentials", async () => {
  const empty = await route(request("/api/cart/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale: "en", lines: [] }),
  }));
  assert.equal(empty.status, 400);

  const checkout = await route(request("/api/cart/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale: "en", lines: [{ variantId: "performance-collection-1-s", quantity: 1 }] }),
  }));
  const payload = await json(checkout);
  assert.equal(checkout.status, 200);
  assert.equal(payload.checkout.cartId, "fallback");
  assert.match(payload.checkout.checkoutUrl, /slowfitcr\.com\/en/);
});

test("reviews validate submissions and support the complete moderation lifecycle", async () => {
  const invalidRead = await route(request("/api/reviews?locale=en"));
  assert.equal(invalidRead.status, 400);

  const invalidSubmission = await route(request("/api/reviews/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productHandle: "top", locale: "en", rating: 6, author: "A", email: "bad", content: "short" }),
  }));
  assert.equal(invalidSubmission.status, 400);

  const submission = await route(request("/api/reviews/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productHandle: "performance-collection-1",
      locale: "en",
      rating: 4,
      author: "Taylor",
      email: "taylor@example.com",
      content: "Comfortable material and reliable fit.",
    }),
  }));
  const submitted = await json(submission);
  assert.equal(submission.status, 200);

  const unauthorized = await route(request("/api/reviews/pending"));
  assert.equal(unauthorized.status, 401);

  const invalidModeration = await route(request("/api/reviews/moderate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-moderation-token": "integration-token" },
    body: JSON.stringify({ reviewId: submitted.reviewId, action: "invalid" }),
  }));
  assert.equal(invalidModeration.status, 400);

  const moderation = await route(request("/api/reviews/moderate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-moderation-token": "integration-token" },
    body: JSON.stringify({ reviewId: submitted.reviewId, action: "approve", moderator: "integration-admin" }),
  }));
  assert.equal(moderation.status, 200);

  const duplicateModeration = await route(request("/api/reviews/moderate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-moderation-token": "integration-token" },
    body: JSON.stringify({ reviewId: submitted.reviewId, action: "reject" }),
  }));
  assert.equal(duplicateModeration.status, 404);

  const approved = await route(request("/api/reviews?productHandle=performance-collection-1&locale=en"));
  const approvedPayload = await json(approved);
  assert.equal(approved.status, 200);
  assert.ok(approvedPayload.reviews.some((review) => review.author === "Taylor"));
  assert.ok(approvedPayload.average > 0);
});

test("admin listings paginate and replay rejects missing identifiers", async () => {
  await prisma.auditLog.createMany({
    data: [
      { action: "review.submitted", actor: "customer", details: { id: 1 } },
      { action: "review.moderated", actor: "admin", details: { id: 2 } },
    ],
  });
  await prisma.orderWebhookEvent.create({
    data: {
      idempotencyKey: "orders/create:list:1",
      topic: "orders/create",
      shop: "slowfit-test.myshopify.com",
      orderId: "list-order",
      payload: { id: "list-order" },
      status: "FAILED",
      errorMessage: "delivery failed",
    },
  });
  const cookie = await loginCookie();

  const logs = await route(request("/api/admin/audit-logs?page=1&pageSize=1&action=review.submitted&search=customer", { headers: { Cookie: cookie } }));
  const logsPayload = await json(logs);
  assert.equal(logsPayload.total, 1);
  assert.equal(logsPayload.logs.length, 1);

  const events = await route(request("/api/admin/webhooks/orders?page=1&pageSize=1&status=FAILED&search=list-order", { headers: { Cookie: cookie } }));
  const eventsPayload = await json(events);
  assert.equal(eventsPayload.total, 1);
  assert.equal(eventsPayload.events[0].status, "FAILED");

  const missingId = await route(request("/api/admin/webhooks/orders/replay", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }));
  assert.equal(missingId.status, 400);

  const missingEvent = await route(request("/api/admin/webhooks/orders/replay", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: "missing" }),
  }));
  assert.equal(missingEvent.status, 404);
});

test("HTTP server adapter translates requests and contains route errors", async () => {
  const server = startServer();
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const live = await fetch(`${origin}/health/live`);
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), { ok: true, service: "slowfit-backend" });

    const malformed = await fetch(`${origin}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid-json",
    });
    assert.equal(malformed.status, 500);
    assert.equal((await malformed.json()).error, "Internal server error");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
