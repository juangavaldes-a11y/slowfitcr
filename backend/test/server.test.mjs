import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("Backend integration tests require an explicit TEST_DATABASE_URL");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

process.env.REVIEW_MODERATION_TOKEN = "integration-token";
process.env.REVIEW_MODERATION_SESSION_SECRET = "integration-session-secret";
process.env.PAYMENT_WEBHOOK_SECRET = "integration-webhook-secret";
process.env.RATE_LIMIT_MAX = "2";
process.env.RATE_LIMIT_AUTH_MAX = "20";
process.env.HOST = "127.0.0.1";
process.env.PORT = "0";

const prisma = new PrismaClient();
let route;
let disconnectDatabase;
let startServer;
let validateProductionConfiguration;
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
  ({ route, disconnectDatabase, startServer, validateProductionConfiguration } = await import("../server.mjs"));
});

beforeEach(async () => {
  await prisma.product.deleteMany();
  await prisma.paymentWebhookEvent.deleteMany();
  await prisma.order.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.review.deleteMany();
});

after(async () => {
  await prisma.$disconnect();
  await disconnectDatabase();
});

test("admin login creates a reusable session and logout clears it", async () => {
  const anonymousSession = await route(request("/api/admin/session"));
  assert.equal(anonymousSession.status, 401);
  assert.equal((await json(anonymousSession)).authenticated, false);

  const invalid = await route(request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "wrong" }),
  }));
  assert.equal(invalid.status, 401);

  const cookie = await loginCookie();
  const session = await route(request("/api/admin/session", { headers: { Cookie: cookie } }));
  assert.equal(session.status, 200);
  assert.equal((await json(session)).authenticated, true);
  const protectedResponse = await route(request("/api/admin/audit-logs?page=1&pageSize=5", {
    headers: { Cookie: cookie },
  }));
  assert.equal(protectedResponse.status, 200);
  assert.equal((await json(protectedResponse)).pageSize, 5);

  const logout = await route(request("/api/admin/logout", { method: "POST", headers: { Cookie: cookie } }));
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
});

test("admins manage internal products and customers filter the active catalog", async () => {
  const unauthorized = await route(request("/api/admin/catalog/products"));
  assert.equal(unauthorized.status, 401);

  const cookie = await loginCookie();
  const createResponse = await route(request("/api/admin/catalog/products", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Core Training Tee",
      handle: "core-training-tee",
      description: "Lightweight training shirt",
      status: "ACTIVE",
      published: true,
      preorderEnabled: false,
      tags: ["Training", "Women"],
      images: [{ url: "https://cdn.example.com/core-tee.jpg", altText: "Core tee" }],
      variants: [{
        title: "M / Black",
        size: "M",
        color: "Black",
        colorHex: "#111111",
        sku: "CORE-M-BLK",
        price: 48,
        compareAtPrice: 56,
        inventoryQuantity: 7,
      }],
    }),
  }));
  assert.equal(createResponse.status, 201);
  const created = (await json(createResponse)).product;
  assert.equal(created.tags[0], "training");
  assert.equal(created.variants[0].inventoryQuantity, 7);
  assert.equal(created.variants[0].size, "M");
  assert.equal(created.variants[0].color, "Black");
  assert.equal(created.variants[0].colorHex, "#111111");
  assert.equal(created.variants[0].compareAtPrice, 56);
  assert.equal(created.published, true);
  assert.equal(created.preorderEnabled, false);

  await prisma.product.create({
    data: {
      title: "Hidden Training Tee",
      handle: "hidden-training-tee",
      status: "ACTIVE",
      tags: ["clearance"],
      metric: { create: {} },
      variants: { create: { title: "M", price: 44, inventoryQuantity: 5 } },
    },
  });

  const filteredResponse = await route(request("/api/catalog/products?tag=training"));
  assert.equal(filteredResponse.status, 200);
  const filtered = await json(filteredResponse);
  assert.equal(filtered.total, 1);
  assert.equal(filtered.products[0].handle, "core-training-tee");

  const adminFilteredResponse = await route(request("/api/admin/catalog/products?tag=training&pageSize=1", { headers: { Cookie: cookie } }));
  const adminFiltered = await json(adminFilteredResponse);
  assert.deepEqual(adminFiltered.tags, ["clearance", "training", "women"]);

  const multiTagResponse = await route(request("/api/admin/catalog/products?tag=training&tag=women", { headers: { Cookie: cookie } }));
  const multiTag = await json(multiTagResponse);
  assert.equal(multiTag.total, 1);
  assert.equal(multiTag.products[0].id, created.id);

  await prisma.productMetric.update({ where: { productId: created.id }, data: { clicks: 4 } });
  const sortedByPrice = await json(await route(request("/api/admin/catalog/products?sortBy=minPrice&sortOrder=desc", { headers: { Cookie: cookie } })));
  assert.equal(sortedByPrice.products[0].id, created.id);
  const sortedByClicks = await json(await route(request("/api/admin/catalog/products?sortBy=clicks&sortOrder=desc", { headers: { Cookie: cookie } })));
  assert.equal(sortedByClicks.products[0].metric.clicks, 4);

  const updateResponse = await route(request(`/api/admin/catalog/products/${created.id}`, {
    method: "PUT",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...created,
      variants: [{ ...created.variants[0], inventoryQuantity: 3, compareAtPrice: null }],
    }),
  }));
  assert.equal(updateResponse.status, 200);
  const updated = (await json(updateResponse)).product;
  assert.equal(updated.variants[0].id, created.variants[0].id);
  assert.equal(updated.images[0].id, created.images[0].id);
  assert.equal(updated.variants[0].inventoryQuantity, 3);
  assert.equal(updated.variants[0].compareAtPrice, null);
  assert.equal(updated.variants[0].size, "M");
  assert.equal(updated.variants[0].color, "Black");
  assert.equal(updated.variants[0].colorHex, "#111111");

  const deleteResponse = await route(request(`/api/admin/catalog/products/${created.id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  }));
  assert.equal(deleteResponse.status, 200);

  const missingResponse = await route(request("/api/catalog/products/core-training-tee"));
  assert.equal(missingResponse.status, 404);
});

test("production requires strong and distinct authentication secrets", () => {
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    REVIEW_MODERATION_TOKEN: process.env.REVIEW_MODERATION_TOKEN,
    REVIEW_MODERATION_SESSION_SECRET: process.env.REVIEW_MODERATION_SESSION_SECRET,
    CUSTOMER_SESSION_SECRET: process.env.CUSTOMER_SESSION_SECRET,
  };

  try {
    process.env.NODE_ENV = "production";
    process.env.REVIEW_MODERATION_TOKEN = "short";
    delete process.env.REVIEW_MODERATION_SESSION_SECRET;
    delete process.env.CUSTOMER_SESSION_SECRET;
    assert.throws(() => validateProductionConfiguration(), /at least 32 characters/);

    const sharedSecret = "a".repeat(32);
    process.env.REVIEW_MODERATION_TOKEN = sharedSecret;
    process.env.REVIEW_MODERATION_SESSION_SECRET = sharedSecret;
    process.env.CUSTOMER_SESSION_SECRET = "b".repeat(32);
    assert.throws(() => validateProductionConfiguration(), /must be distinct/);

    process.env.REVIEW_MODERATION_TOKEN = "a".repeat(32);
    process.env.REVIEW_MODERATION_SESSION_SECRET = "b".repeat(32);
    process.env.CUSTOMER_SESSION_SECRET = "c".repeat(32);
    assert.doesNotThrow(() => validateProductionConfiguration());
  } finally {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
});

test("customers can register, sign in, and access only authenticated account data", async () => {
  const registration = await route(request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "customer@example.com",
      password: "secure-pass-123",
      firstName: "Taylor",
      lastName: "Stone",
      locale: "en",
    }),
  }));
  assert.equal(registration.status, 201);
  const registrationPayload = await json(registration);
  assert.equal(registrationPayload.customer.email, "customer@example.com");
  assert.equal(registrationPayload.customer.passwordHash, undefined);
  const cookie = registration.headers.get("set-cookie").split(";")[0];

  const duplicate = await route(request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "customer@example.com", password: "secure-pass-123", firstName: "Taylor" }),
  }));
  assert.equal(duplicate.status, 409);

  const session = await route(request("/api/auth/session", { headers: { Cookie: cookie } }));
  assert.equal(session.status, 200);
  assert.equal((await json(session)).authenticated, true);
  assert.equal((await route(request("/api/account/orders"))).status, 401);

  const logout = await route(request("/api/auth/logout", { method: "POST", headers: { Cookie: cookie } }));
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);

  const invalidLogin = await route(request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "customer@example.com", password: "wrong-password" }),
  }));
  assert.equal(invalidLogin.status, 401);

  const login = await route(request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "CUSTOMER@example.com", password: "secure-pass-123" }),
  }));
  assert.equal(login.status, 200);
});

test("customers filter preorders and persist favorites and carts", async () => {
  const registration = await route(request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "saved@example.com",
      password: "secure-pass-123",
      firstName: "Saved",
      locale: "en",
    }),
  }));
  assert.equal(registration.status, 201);
  const customerCookie = registration.headers.get("set-cookie").split(";")[0];

  const preorder = await prisma.product.create({
    data: {
      title: "Men Preorder Tee",
      handle: "men-preorder-tee",
      status: "ACTIVE",
      published: true,
      preorderEnabled: true,
      tags: ["men", "training"],
      images: { create: { url: "https://cdn.example.com/preorder.jpg", altText: "Preorder tee" } },
      variants: { create: { title: "M", size: "M", price: 42, inventoryQuantity: 0 } },
    },
    include: { variants: true },
  });
  await prisma.product.create({
    data: {
      title: "Hidden Preorder Tee",
      handle: "hidden-preorder-tee",
      status: "DRAFT",
      published: false,
      preorderEnabled: true,
      tags: ["men", "training"],
      variants: { create: { title: "M", size: "M", price: 40, inventoryQuantity: 0 } },
    },
  });

  const catalog = await json(await route(request("/api/catalog/products?preorder=true&tag=men&tag=training")));
  assert.equal(catalog.total, 1);
  assert.equal(catalog.products[0].id, preorder.id);
  assert.equal(catalog.products[0].variants[0].availableForSale, true);
  assert.equal(catalog.products[0].variants[0].preorder, true);

  assert.equal((await route(request(`/api/account/favorites/${preorder.id}`, { method: "PUT" }))).status, 401);
  const favorite = await route(request(`/api/account/favorites/${preorder.id}`, {
    method: "PUT",
    headers: { Cookie: customerCookie },
  }));
  assert.equal(favorite.status, 200);
  assert.equal((await route(request(`/api/account/favorites/${preorder.id}`, {
    method: "PUT",
    headers: { Cookie: customerCookie },
  }))).status, 200);
  const favorites = await json(await route(request("/api/account/favorites", { headers: { Cookie: customerCookie } })));
  assert.deepEqual(favorites.productIds, [preorder.id]);

  const line = {
    productId: preorder.id,
    variantId: preorder.variants[0].id,
    title: preorder.title,
    handle: preorder.handle,
    image: "https://cdn.example.com/preorder.jpg",
    price: 42,
    currencyCode: "USD",
    quantity: 2,
  };
  const savedCart = await route(request("/api/account/cart", {
    method: "PUT",
    headers: { Cookie: customerCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ lines: [line], cartId: "provider-cart-1" }),
  }));
  assert.equal(savedCart.status, 200);
  const restoredCart = await json(await route(request("/api/account/cart", { headers: { Cookie: customerCookie } })));
  assert.deepEqual(restoredCart.cart.lines, [line]);
  assert.equal(restoredCart.cart.cartId, "provider-cart-1");

  const removed = await route(request(`/api/account/favorites/${preorder.id}`, {
    method: "DELETE",
    headers: { Cookie: customerCookie },
  }));
  assert.equal(removed.status, 200);
  const emptyFavorites = await json(await route(request("/api/account/favorites", { headers: { Cookie: customerCookie } })));
  assert.deepEqual(emptyFavorites.productIds, []);
});

test("customer login locks after repeated failures and recovers after expiry", async () => {
  await route(request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "locked@example.com", password: "secure-pass-123", firstName: "Locked" }),
  }));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await route(request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "locked@example.com", password: "wrong-password" }),
    }));
    assert.equal(response.status, 401);
  }

  const customer = await prisma.customer.findUnique({ where: { email: "locked@example.com" } });
  assert.ok(customer.lockedUntil > new Date());
  const blocked = await route(request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "locked@example.com", password: "secure-pass-123" }),
  }));
  assert.equal(blocked.status, 401);

  await prisma.customer.update({ where: { id: customer.id }, data: { lockedUntil: new Date(0) } });
  const recovered = await route(request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "locked@example.com", password: "secure-pass-123" }),
  }));
  assert.equal(recovered.status, 200);
  const resetCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
  assert.equal(resetCustomer.failedLoginAttempts, 0);
  assert.equal(resetCustomer.lockedUntil, null);
});

test("password recovery is non-enumerating, hashed, expiring, and single-use", async () => {
  await route(request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "recover@example.com", password: "old-password-123", firstName: "Recover", locale: "en" }),
  }));

  const originalFetch = globalThis.fetch;
  const originalEnvironment = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    ACCOUNT_RESET_FROM: process.env.ACCOUNT_RESET_FROM,
    APP_ORIGIN: process.env.APP_ORIGIN,
  };
  const deliveries = [];
  process.env.RESEND_API_KEY = "integration-resend-key";
  process.env.ACCOUNT_RESET_FROM = "Slow Fit <accounts@example.com>";
  process.env.APP_ORIGIN = "https://slowfitcr.com";
  globalThis.fetch = async (url, init) => {
    deliveries.push({ url: String(url), init });
    return new Response(null, { status: 202 });
  };

  try {
    const known = await route(request("/api/auth/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "recover@example.com", locale: "en" }),
    }));
    const unknown = await route(request("/api/auth/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unknown@example.com", locale: "en" }),
    }));
    assert.equal(known.status, 202);
    assert.equal(unknown.status, 202);
    assert.deepEqual(await known.json(), await unknown.json());
    assert.equal(deliveries.length, 1);

    const emailPayload = JSON.parse(deliveries[0].init.body);
    const resetUrl = new URL(emailPayload.html.match(/href="([^"]+)"/)[1]);
    const rawToken = resetUrl.searchParams.get("resetToken");
    const storedToken = await prisma.passwordResetToken.findFirst();
    assert.ok(rawToken);
    assert.notEqual(storedToken.tokenHash, rawToken);
    assert.equal(storedToken.tokenHash.length, 64);

    const reset = await route(request("/api/auth/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, password: "new-password-456" }),
    }));
    assert.equal(reset.status, 200);

    const reused = await route(request("/api/auth/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, password: "another-password-789" }),
    }));
    assert.equal(reused.status, 400);

    const oldLogin = await route(request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "recover@example.com", password: "old-password-123" }),
    }));
    assert.equal(oldLogin.status, 401);
    const newLogin = await route(request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "recover@example.com", password: "new-password-456" }),
    }));
    assert.equal(newLogin.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("browser mutations reject cross-site origins", async () => {
  const crossSite = await route(request("/api/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://attacker.example",
      "Sec-Fetch-Site": "cross-site",
    },
    body: JSON.stringify({ name: "Customer", email: "customer@example.com", message: "Please help with sizing" }),
  }));
  assert.equal(crossSite.status, 403);

  const local = await route(request("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ name: "Customer", email: "customer@example.com", message: "Please help with sizing" }),
  }));
  assert.equal(local.status, 200);
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
  const response = await route(request("/api/reviews/pending?page=1&pageSize=1&status=APPROVED&search=alex&locale=en&rating=5", {
    headers: { Cookie: cookie },
  }));
  const payload = await json(response);

  assert.equal(response.status, 200);
  assert.equal(payload.total, 1);
  assert.equal(payload.pageSize, 1);
  assert.equal(payload.reviews[0].author, "Alex");
});

test("customers see only their own review history", async () => {
  const registration = await route(request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "reviews@example.com", password: "secure-pass-123", firstName: "Review", locale: "en" }),
  }));
  const cookie = registration.headers.get("set-cookie").split(";")[0];
  await prisma.review.createMany({
    data: [
      { productHandle: "performance-top", locale: "en", rating: 5, author: "Review", email: "REVIEWS@example.com", content: "My pending review content", status: "PENDING" },
      { productHandle: "accessory-bag", locale: "en", rating: 2, author: "Other", email: "other@example.com", content: "Another customer review", status: "APPROVED" },
    ],
  });

  assert.equal((await route(request("/api/account/reviews"))).status, 401);
  const response = await route(request("/api/account/reviews?page=1&pageSize=1", { headers: { Cookie: cookie } }));
  const payload = await json(response);
  assert.equal(response.status, 200);
  assert.equal(payload.total, 1);
  assert.equal(payload.reviews[0].productHandle, "performance-top");
  assert.equal(payload.reviews[0].email, undefined);
});

test("moderators can bulk moderate pending reviews", async () => {
  const reviews = await Promise.all([
    prisma.review.create({ data: { productHandle: "top-a", locale: "en", rating: 5, author: "A", email: "a@example.com", content: "First pending review", status: "PENDING" } }),
    prisma.review.create({ data: { productHandle: "top-b", locale: "es", rating: 4, author: "B", email: "b@example.com", content: "Second pending review", status: "PENDING" } }),
    prisma.review.create({ data: { productHandle: "top-c", locale: "en", rating: 3, author: "C", email: "c@example.com", content: "Already approved review", status: "APPROVED" } }),
  ]);
  const cookie = await loginCookie();
  const response = await route(request("/api/reviews/moderate/bulk", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ reviewIds: reviews.map((review) => review.id), action: "approve", moderator: "integration-admin" }),
  }));
  const payload = await json(response);
  assert.equal(response.status, 200);
  assert.equal(payload.changedIds.length, 2);
  assert.deepEqual(payload.skippedIds, [reviews[2].id]);
  assert.equal(await prisma.review.count({ where: { status: "APPROVED" } }), 3);
  assert.equal(await prisma.auditLog.count({ where: { action: "review.moderated.bulk" } }), 1);
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

test("payment webhooks verify signatures and ignore duplicate deliveries", async () => {
  const body = JSON.stringify({ reference: "pay-991", orderNumber: 42, updated_at: "2026-08-15T00:00:00Z", items: [] });
  const signature = createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET).update(body, "utf8").digest("base64");
  const headers = {
    "Content-Type": "application/json",
    "x-forwarded-for": "203.0.113.21",
    "x-slowfit-signature": signature,
    "x-payment-topic": "payment.created",
    "x-payment-provider": "test-bank",
  };

  const invalid = await route(request("/api/webhooks/payments", {
    method: "POST",
    headers: { ...headers, "x-forwarded-for": "203.0.113.20", "x-slowfit-signature": "invalid" },
    body,
  }));
  assert.equal(invalid.status, 401);

  const first = await route(request("/api/webhooks/payments", { method: "POST", headers, body }));
  assert.equal(first.status, 200);

  const duplicate = await route(request("/api/webhooks/payments", { method: "POST", headers, body }));
  assert.deepEqual(await json(duplicate), { ok: true, duplicate: true });
  assert.equal(await prisma.paymentWebhookEvent.count(), 1);
});

test("payment webhooks expose order status to the matching customer", async () => {
  const product = await prisma.product.create({
    data: {
      title: "Performance Top",
      handle: "performance-top",
      status: "ACTIVE",
      inventoryTotal: 2,
      minPrice: 79,
      variants: { create: { title: "M", price: 79, inventoryQuantity: 2 } },
    },
    include: { variants: true },
  });
  const variantId = product.variants[0].id;
  const registration = await route(request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "order@example.com", password: "secure-pass-123", firstName: "Order", locale: "en" }),
  }));
  const cookie = registration.headers.get("set-cookie").split(";")[0];
  const body = JSON.stringify({
    reference: "pay-1199",
    orderNumber: 88,
    name: "#1088",
    email: "ORDER@example.com",
    status: "paid",
    fulfillmentStatus: "unfulfilled",
    amount: "79.00",
    currency: "USD",
    createdAt: "2026-08-15T00:00:00Z",
    updated_at: "2026-08-15T00:01:00Z",
    items: [{ variantId, name: "Performance Top", quantity: 1 }],
  });
  const signature = createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET).update(body, "utf8").digest("base64");
  const webhook = await route(request("/api/webhooks/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slowfit-signature": signature,
      "x-payment-topic": "payment.paid",
      "x-payment-provider": "test-bank",
    },
    body,
  }));
  assert.equal(webhook.status, 200);

  const ordersResponse = await route(request("/api/account/orders", { headers: { Cookie: cookie } }));
  const ordersPayload = await json(ordersResponse);
  assert.equal(ordersResponse.status, 200);
  assert.equal(ordersPayload.orders.length, 1);
  assert.equal(ordersPayload.orders[0].financialStatus, "paid");
  assert.equal(ordersPayload.orders[0].fulfillmentStatus, "unfulfilled");
  assert.equal((await prisma.productVariant.findUnique({ where: { id: variantId } })).inventoryQuantity, 1);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).inventoryTotal, 1);
  assert.equal((await prisma.productMetric.findUnique({ where: { productId: product.id } })).unitsSold, 1);

  const secondDeliveryBody = JSON.stringify({
    ...JSON.parse(body),
    updated_at: "2026-08-15T00:02:00Z",
  });
  const secondSignature = createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET)
    .update(secondDeliveryBody, "utf8")
    .digest("base64");
  const secondDelivery = await route(request("/api/webhooks/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slowfit-signature": secondSignature,
      "x-payment-topic": "payment.paid",
      "x-payment-provider": "test-bank",
    },
    body: secondDeliveryBody,
  }));
  assert.equal(secondDelivery.status, 200);
  assert.equal((await prisma.productVariant.findUnique({ where: { id: variantId } })).inventoryQuantity, 1);
  assert.equal((await prisma.productMetric.findUnique({ where: { productId: product.id } })).unitsSold, 1);
});

test("paid payment rolls back the order when inventory is no longer available", async () => {
  const product = await prisma.product.create({
    data: {
      title: "Limited Top",
      handle: "limited-top",
      status: "ACTIVE",
      variants: { create: { title: "S", price: 65, inventoryQuantity: 1 } },
    },
    include: { variants: true },
  });
  const variantId = product.variants[0].id;
  const body = JSON.stringify({
    reference: "pay-no-stock",
    email: "buyer@example.com",
    status: "paid",
    updated_at: "2026-08-15T00:03:00Z",
    items: [{ variantId, name: "Limited Top", quantity: 2 }],
  });
  const signature = createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET).update(body, "utf8").digest("base64");
  const webhook = await route(request("/api/webhooks/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slowfit-signature": signature,
      "x-payment-topic": "payment.paid",
      "x-payment-provider": "test-bank",
    },
    body,
  }));

  assert.equal(webhook.status, 500);
  assert.equal(await prisma.order.count({ where: { externalPaymentId: "pay-no-stock" } }), 0);
  assert.equal((await prisma.productVariant.findUnique({ where: { id: variantId } })).inventoryQuantity, 1);
  assert.equal((await prisma.paymentWebhookEvent.findFirst({ where: { orderId: "pay-no-stock" } })).status, "FAILED");
});

test("paid preorders preserve zero inventory", async () => {
  const product = await prisma.product.create({
    data: {
      title: "Preorder Top",
      handle: "preorder-top",
      status: "ACTIVE",
      published: true,
      preorderEnabled: true,
      variants: { create: { title: "M", price: 72, inventoryQuantity: 0 } },
    },
    include: { variants: true },
  });
  const variantId = product.variants[0].id;
  const body = JSON.stringify({
    reference: "pay-preorder",
    email: "preorder@example.com",
    status: "paid",
    updated_at: "2026-08-15T00:04:00Z",
    items: [{ variantId, name: "Preorder Top", quantity: 1, preorder: true }],
  });
  const signature = createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET).update(body, "utf8").digest("base64");
  const webhook = await route(request("/api/webhooks/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slowfit-signature": signature,
      "x-payment-topic": "payment.paid",
      "x-payment-provider": "test-bank",
    },
    body,
  }));

  assert.equal(webhook.status, 200);
  assert.equal(await prisma.order.count({ where: { externalPaymentId: "pay-preorder" } }), 1);
  assert.equal((await prisma.productVariant.findUnique({ where: { id: variantId } })).inventoryQuantity, 0);
});

test("authenticated moderators can replay a stored webhook event", async () => {
  const event = await prisma.paymentWebhookEvent.create({
    data: {
      idempotencyKey: "payment.created:replay:1",
      topic: "payment.created",
      provider: "test-bank",
      orderId: "replay-order",
      payload: { reference: "replay-order", items: [] },
      status: "PROCESSED",
    },
  });
  const cookie = await loginCookie();
  const response = await route(request("/api/admin/webhooks/payments/replay", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: event.id, actor: "integration-admin" }),
  }));

  assert.equal(response.status, 200);
  const updated = await prisma.paymentWebhookEvent.findUnique({ where: { id: event.id } });
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

  const product = await prisma.product.create({ data: { title: "Metric Tee", handle: "metric-tee" } });
  await route(request("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName: "product_search", params: { product_ids: [product.id], search_term: "tee" } }),
  }));
  await route(request("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName: "product_click", params: { product_id: product.id } }),
  }));
  const metric = await prisma.productMetric.findUnique({ where: { productId: product.id } });
  assert.equal(metric.searchImpressions, 1);
  assert.equal(metric.clicks, 1);
});

test("outbound webhooks retry transient failures and include HMAC headers", async () => {
  const originalFetch = globalThis.fetch;
  const deliveries = [];
  process.env.CONTACT_WEBHOOK_URL = "https://hooks.example.test/contact";
  process.env.OUTBOUND_WEBHOOK_SECRET = "integration-outbound-secret";

  globalThis.fetch = async (url, init) => {
    deliveries.push({ url: String(url), init });
    return new Response(null, { status: deliveries.length === 1 ? 500 : 204 });
  };

  try {
    const response = await route(request("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Customer", email: "customer@example.com", message: "Please help with sizing", locale: "en" }),
    }));

    assert.equal(response.status, 200);
    assert.equal(deliveries.length, 2);
    assert.equal(deliveries[1].url, process.env.CONTACT_WEBHOOK_URL);
    const timestamp = deliveries[1].init.headers["X-Slowfit-Timestamp"];
    const expectedSignature = createHmac("sha256", process.env.OUTBOUND_WEBHOOK_SECRET)
      .update(`${timestamp}.${deliveries[1].init.body}`)
      .digest("base64");
    assert.equal(deliveries[1].init.headers["X-Slowfit-Signature"], expectedSignature);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.CONTACT_WEBHOOK_URL;
    delete process.env.OUTBOUND_WEBHOOK_SECRET;
  }
});

test("checkout validates internal inventory and sends server-calculated totals to the payment adapter", async () => {
  const empty = await route(request("/api/cart/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale: "en", lines: [] }),
  }));
  assert.equal(empty.status, 400);

  const product = await prisma.product.create({
    data: {
      title: "Internal Tee",
      handle: "internal-tee",
      status: "ACTIVE",
      published: true,
      variants: { create: { title: "M", sku: "INTERNAL-M", price: 42, inventoryQuantity: 2 } },
    },
    include: { variants: true },
  });
  const variantId = product.variants[0].id;

  const preorderProduct = await prisma.product.create({
    data: {
      title: "Internal Preorder Tee",
      handle: "internal-preorder-tee",
      status: "ACTIVE",
      published: true,
      preorderEnabled: true,
      variants: { create: { title: "L", sku: "PREORDER-L", price: 50, inventoryQuantity: 0 } },
    },
    include: { variants: true },
  });

  const insufficient = await route(request("/api/cart/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale: "en", lines: [{ variantId, quantity: 3 }] }),
  }));
  assert.equal(insufficient.status, 409);

  await prisma.product.update({ where: { id: product.id }, data: { preorderEnabled: true } });
  const partialStock = await route(request("/api/cart/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale: "en", lines: [{ variantId, quantity: 3 }] }),
  }));
  assert.equal(partialStock.status, 409);

  const originalFetch = globalThis.fetch;
  let paymentPayload;
  process.env.PAYMENT_PROVIDER_URL = "https://payments.example.com/session";
  process.env.PAYMENT_PROVIDER_TOKEN = "payment-token";
  globalThis.fetch = async (_url, init) => {
    paymentPayload = JSON.parse(init.body);
    return new Response(JSON.stringify({ checkoutUrl: "https://payments.example.com/pay/123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const checkout = await route(request("/api/cart/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "en", lines: [{ variantId, quantity: 2, price: 1 }] }),
    }));
    const payload = await json(checkout);
    assert.equal(checkout.status, 200);
    assert.equal(payload.checkout.checkoutUrl, "https://payments.example.com/pay/123");
    assert.equal(paymentPayload.amount, 84);
    assert.equal(paymentPayload.items[0].unitPrice, 42);

    const preorderCheckout = await route(request("/api/cart/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "en", lines: [{ variantId: preorderProduct.variants[0].id, quantity: 1 }] }),
    }));
    assert.equal(preorderCheckout.status, 200);
    assert.equal(paymentPayload.items[0].preorder, true);
    assert.equal(paymentPayload.amount, 25);
    assert.equal(paymentPayload.shipping, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.PAYMENT_PROVIDER_URL;
    delete process.env.PAYMENT_PROVIDER_TOKEN;
  }
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
  assert.ok(approvedPayload.reviews.every((review) => review.email === undefined));
  assert.ok(approvedPayload.average > 0);
});

test("admin listings paginate and replay rejects missing identifiers", async () => {
  await prisma.auditLog.createMany({
    data: [
      { action: "review.submitted", actor: "customer", details: { id: 1 } },
      { action: "review.moderated", actor: "admin", details: { id: 2 } },
    ],
  });
  await prisma.paymentWebhookEvent.create({
    data: {
      idempotencyKey: "payment.created:list:1",
      topic: "payment.created",
      provider: "test-bank",
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

  const events = await route(request("/api/admin/webhooks/payments?page=1&pageSize=1&status=FAILED&search=list-order", { headers: { Cookie: cookie } }));
  const eventsPayload = await json(events);
  assert.equal(eventsPayload.total, 1);
  assert.equal(eventsPayload.events[0].status, "FAILED");

  const missingId = await route(request("/api/admin/webhooks/payments/replay", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }));
  assert.equal(missingId.status, 400);

  const missingEvent = await route(request("/api/admin/webhooks/payments/replay", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: "missing" }),
  }));
  assert.equal(missingEvent.status, 404);
});

test("empty JSON bodies default to empty objects and partial production secrets reject invalid setup", async () => {
  const emptyBody = await route(request("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "",
  }));
  assert.equal(emptyBody.status, 400);
  assert.equal((await json(emptyBody)).error, "Missing eventName");

  const previousNodeEnv = process.env.NODE_ENV;
  const previousUberId = process.env.UBER_DIRECT_CLIENT_ID;
  const previousUberSecret = process.env.UBER_DIRECT_CLIENT_SECRET;
  const previousUberCustomer = process.env.UBER_DIRECT_CUSTOMER_ID;
  const previousUberWebhook = process.env.UBER_DIRECT_WEBHOOK_SIGNING_KEY;
  const previousDidiUrl = process.env.DIDI_DELIVERY_GATEWAY_URL;
  const previousDidiToken = process.env.DIDI_DELIVERY_GATEWAY_TOKEN;
  const previousDidiSecret = process.env.DIDI_DELIVERY_WEBHOOK_SECRET;
  const previousReviewSecret = process.env.REVIEW_MODERATION_TOKEN;
  const previousReviewSessionSecret = process.env.REVIEW_MODERATION_SESSION_SECRET;
  const previousCustomerSecret = process.env.CUSTOMER_SESSION_SECRET;

  try {
    process.env.NODE_ENV = "production";
    process.env.REVIEW_MODERATION_TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    process.env.REVIEW_MODERATION_SESSION_SECRET = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    process.env.CUSTOMER_SESSION_SECRET = "cccccccccccccccccccccccccccccccc";

    delete process.env.UBER_DIRECT_CLIENT_ID;
    process.env.UBER_DIRECT_CLIENT_SECRET = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    process.env.UBER_DIRECT_CUSTOMER_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    process.env.UBER_DIRECT_WEBHOOK_SIGNING_KEY = "cccccccccccccccccccccccccccccccc";
    assert.throws(() => validateProductionConfiguration(), {
      message: "Uber Direct requires client ID, client secret, customer ID, and webhook signing key",
    });

    process.env.UBER_DIRECT_CLIENT_ID = "dddddddddddddddddddddddddddddddd";
    process.env.UBER_DIRECT_CLIENT_SECRET = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    process.env.UBER_DIRECT_CUSTOMER_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    process.env.UBER_DIRECT_WEBHOOK_SIGNING_KEY = "cccccccccccccccccccccccccccccccc";
    delete process.env.DIDI_DELIVERY_GATEWAY_URL;
    process.env.DIDI_DELIVERY_GATEWAY_TOKEN = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    process.env.DIDI_DELIVERY_WEBHOOK_SECRET = "ffffffffffffffffffffffffffffffff";
    assert.throws(() => validateProductionConfiguration(), {
      message: "DiDi delivery requires gateway URL, gateway token, and webhook secret",
    });

    process.env.DIDI_DELIVERY_GATEWAY_URL = "http://example.com/delivery";
    assert.throws(() => validateProductionConfiguration(), {
      message: "DiDi delivery gateway must use HTTPS",
    });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousUberId === undefined) delete process.env.UBER_DIRECT_CLIENT_ID; else process.env.UBER_DIRECT_CLIENT_ID = previousUberId;
    if (previousUberSecret === undefined) delete process.env.UBER_DIRECT_CLIENT_SECRET; else process.env.UBER_DIRECT_CLIENT_SECRET = previousUberSecret;
    if (previousUberCustomer === undefined) delete process.env.UBER_DIRECT_CUSTOMER_ID; else process.env.UBER_DIRECT_CUSTOMER_ID = previousUberCustomer;
    if (previousUberWebhook === undefined) delete process.env.UBER_DIRECT_WEBHOOK_SIGNING_KEY; else process.env.UBER_DIRECT_WEBHOOK_SIGNING_KEY = previousUberWebhook;
    if (previousDidiUrl === undefined) delete process.env.DIDI_DELIVERY_GATEWAY_URL; else process.env.DIDI_DELIVERY_GATEWAY_URL = previousDidiUrl;
    if (previousDidiToken === undefined) delete process.env.DIDI_DELIVERY_GATEWAY_TOKEN; else process.env.DIDI_DELIVERY_GATEWAY_TOKEN = previousDidiToken;
    if (previousDidiSecret === undefined) delete process.env.DIDI_DELIVERY_WEBHOOK_SECRET; else process.env.DIDI_DELIVERY_WEBHOOK_SECRET = previousDidiSecret;
    if (previousReviewSecret === undefined) delete process.env.REVIEW_MODERATION_TOKEN; else process.env.REVIEW_MODERATION_TOKEN = previousReviewSecret;
    if (previousReviewSessionSecret === undefined) delete process.env.REVIEW_MODERATION_SESSION_SECRET; else process.env.REVIEW_MODERATION_SESSION_SECRET = previousReviewSessionSecret;
    if (previousCustomerSecret === undefined) delete process.env.CUSTOMER_SESSION_SECRET; else process.env.CUSTOMER_SESSION_SECRET = previousCustomerSecret;
  }
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
    const malformedPayload = await malformed.json();
    assert.equal(malformedPayload.error, "Internal server error");
    assert.equal(malformedPayload.details, undefined);
    assert.equal(malformed.headers.get("cache-control"), "no-store");
    assert.equal(malformed.headers.get("x-content-type-options"), "nosniff");

    const oversized = await fetch(`${origin}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(1024 * 1024) }),
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { error: "Request body too large" });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
