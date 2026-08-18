import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || "0.0.0.0";
const DEFAULT_LOCALE = "es";

const SESSION_COOKIE_NAME = "slowfit_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const CUSTOMER_SESSION_COOKIE_NAME = "slowfit_customer_session";
const CUSTOMER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const scryptAsync = promisify(scrypt);

const RATE_LIMIT_WINDOW_MS = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);
const RATE_LIMIT_MAX = Number.parseInt(process.env.RATE_LIMIT_MAX || "120", 10);
const RATE_LIMIT_AUTH_MAX = Number.parseInt(process.env.RATE_LIMIT_AUTH_MAX || "20", 10);
const WEBHOOK_TIMEOUT_MS = Number.parseInt(process.env.WEBHOOK_TIMEOUT_MS || "2000", 10);
const WEBHOOK_MAX_ATTEMPTS = Math.min(3, Math.max(1, Number.parseInt(process.env.WEBHOOK_MAX_ATTEMPTS || "2", 10)));
const MAX_REQUEST_BODY_BYTES = Number.parseInt(process.env.MAX_REQUEST_BODY_BYTES || "1048576", 10);

const rateLimitStore = new Map();

const FALLBACK_APPROVED_REVIEWS = [
  {
    id: "seed-core-tee-1",
    productHandle: "slow-core-training-tee",
    locale: "all",
    rating: 5,
    author: "Sofia",
    content: "Ligera, suave y con suficiente espacio para entrenar sin restricciones.",
    source: "manual",
    createdAt: "2026-07-15T10:00:00.000Z",
  },
  {
    id: "seed-core-tee-2",
    productHandle: "slow-core-training-tee",
    locale: "all",
    rating: 4,
    author: "Marco",
    content: "The relaxed fit works well for training and still looks clean outside the gym.",
    source: "manual",
    createdAt: "2026-07-19T10:00:00.000Z",
  },
  {
    id: "seed-1",
    productHandle: "performance-collection-1",
    locale: "all",
    rating: 5,
    author: "Mariana",
    content: "Excelente calidad de tela y el ajuste se mantiene en entrenamientos intensos.",
    source: "manual",
    createdAt: "2026-07-01T10:00:00.000Z",
  },
  {
    id: "seed-2",
    productHandle: "performance-collection-1",
    locale: "all",
    rating: 4,
    author: "Daniel",
    content: "Muy comoda y con buen soporte. La entrega fue puntual.",
    source: "manual",
    createdAt: "2026-07-08T10:00:00.000Z",
  },
  {
    id: "seed-3",
    productHandle: "accessories-1",
    locale: "all",
    rating: 5,
    author: "Andrea",
    content: "The accessory quality surprised me and it pairs well with my daily routine.",
    source: "manual",
    createdAt: "2026-07-11T10:00:00.000Z",
  },
];

function log(level, message, fields = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      service: "slowfit-backend",
      ...fields,
    }),
  );
}

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function parseUrl(request) {
  return new URL(request.url);
}

async function readJson(request) {
  const text = await request.text();
  if (!text) {
    return {};
  }

  return JSON.parse(text);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeLocale(localeRaw) {
  return localeRaw === "en" ? "en" : DEFAULT_LOCALE;
}

function getSessionSecret() {
  return process.env.REVIEW_MODERATION_SESSION_SECRET || process.env.REVIEW_MODERATION_TOKEN || "";
}

function getCustomerSessionSecret() {
  return process.env.CUSTOMER_SESSION_SECRET || getSessionSecret();
}

function toBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeCompare(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function createAdminSessionToken() {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("Missing moderation session secret");
  }

  const payload = JSON.stringify({
    iat: Date.now(),
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    role: "review-moderator",
  });

  const encoded = toBase64Url(payload);
  const signature = signPayload(encoded, secret);
  return `${encoded}.${signature}`;
}

function verifyAdminSessionToken(token) {
  const secret = getSessionSecret();
  if (!secret || !token || !token.includes(".")) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return false;
  }

  const expected = signPayload(payload, secret);
  if (!safeCompare(expected, signature)) {
    return false;
  }

  try {
    const decoded = JSON.parse(fromBase64Url(payload));
    return Boolean(decoded.exp && decoded.exp > Date.now() && decoded.role === "review-moderator");
  } catch {
    return false;
  }
}

function parseCookie(headerValue) {
  if (!headerValue) {
    return {};
  }

  return headerValue.split(";").reduce((acc, segment) => {
    const [k, ...rest] = segment.trim().split("=");
    if (!k || !rest.length) {
      return acc;
    }
    acc[k] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function getAdminSessionFromRequest(request) {
  const cookies = parseCookie(request.headers.get("cookie") || "");
  return verifyAdminSessionToken(cookies[SESSION_COOKIE_NAME]);
}

function buildSessionCookie(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}.${Buffer.from(derivedKey).toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, keyHex] = String(storedHash || "").split(".");
  if (!salt || !keyHex) {
    return false;
  }

  const expected = Buffer.from(keyHex, "hex");
  const actual = Buffer.from(await scryptAsync(password, salt, expected.length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function createCustomerSessionToken(customer) {
  const secret = getCustomerSessionSecret();
  if (!secret) {
    throw new Error("Missing customer session secret");
  }

  const payload = JSON.stringify({
    iat: Date.now(),
    exp: Date.now() + CUSTOMER_SESSION_MAX_AGE_SECONDS * 1000,
    role: "customer",
    customerId: customer.id,
    email: customer.email,
  });
  const encoded = toBase64Url(payload);
  return `${encoded}.${signPayload(encoded, secret)}`;
}

function getCustomerSessionFromRequest(request) {
  const token = parseCookie(request.headers.get("cookie") || "")[CUSTOMER_SESSION_COOKIE_NAME];
  const secret = getCustomerSessionSecret();
  if (!secret || !token || !token.includes(".")) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeCompare(signPayload(payload, secret), signature)) {
    return null;
  }

  try {
    const decoded = JSON.parse(fromBase64Url(payload));
    return decoded.exp > Date.now() && decoded.role === "customer" && decoded.customerId ? decoded : null;
  } catch {
    return null;
  }
}

function buildCustomerSessionCookie(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${CUSTOMER_SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${CUSTOMER_SESSION_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

function clearCustomerSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${CUSTOMER_SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
}

function shouldRateLimit(pathname) {
  if (pathname === "/health/live" || pathname === "/health/ready") {
    return false;
  }
  return pathname.startsWith("/api/");
}

function applyRateLimit(request) {
  const url = parseUrl(request);
  if (!shouldRateLimit(url.pathname)) {
    return { limited: false };
  }

  const ip = getClientIp(request);
  const isAuthPath = url.pathname.startsWith("/api/auth/")
    || url.pathname.includes("/admin/login")
    || url.pathname.includes("/reviews/moderate");
  const max = isAuthPath ? RATE_LIMIT_AUTH_MAX : RATE_LIMIT_MAX;
  const key = `${ip}:${url.pathname}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { limited: false };
  }

  if (entry.count >= max) {
    return { limited: true, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count += 1;
  rateLimitStore.set(key, entry);
  return { limited: false };
}

async function appendAudit(action, details, actor = "system") {
  await prisma.auditLog.create({
    data: {
      action,
      actor,
      details,
    },
  });
}

function getShopifyEnv() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

  if (!domain || !token) {
    return null;
  }

  return { domain, token };
}

async function shopifyFetch(query, variables) {
  const env = getShopifyEnv();
  if (!env) {
    return null;
  }

  const response = await fetch(`https://${env.domain}/api/2025-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": env.token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Shopify request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((item) => item.message).join("; "));
  }

  return payload.data || null;
}

const CART_CREATE_MUTATION = `#graphql
  mutation CartCreate($lines: [CartLineInput!]!, $countryCode: CountryCode) {
    cartCreate(input: { lines: $lines, buyerIdentity: { countryCode: $countryCode } }) {
      cart {
        id
        checkoutUrl
      }
      userErrors {
        message
      }
    }
  }
`;

const CART_QUERY = `#graphql
  query CartById($id: ID!) {
    cart(id: $id) {
      id
      checkoutUrl
      lines(first: 250) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant {
                id
              }
            }
          }
        }
      }
    }
  }
`;

const CART_LINES_ADD = `#graphql
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      userErrors {
        message
      }
    }
  }
`;

const CART_LINES_UPDATE = `#graphql
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      userErrors {
        message
      }
    }
  }
`;

const CART_LINES_REMOVE = `#graphql
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      userErrors {
        message
      }
    }
  }
`;

async function createCheckoutSession(lines, locale) {
  const env = getShopifyEnv();
  if (!env) {
    return {
      cartId: "fallback",
      checkoutUrl: `https://slowfitcr.com/${locale}`,
    };
  }

  const data = await shopifyFetch(CART_CREATE_MUTATION, {
    lines: lines.map((line) => ({ merchandiseId: line.variantId, quantity: line.quantity })),
    countryCode: locale === "es" ? "CR" : "US",
  });

  const created = data?.cartCreate;
  if (!created?.cart) {
    const message = created?.userErrors?.map((err) => err.message).join("; ") || "Could not create cart";
    throw new Error(message);
  }

  return {
    cartId: created.cart.id,
    checkoutUrl: created.cart.checkoutUrl,
  };
}

async function syncCheckoutSession(lines, locale, cartId) {
  const cleanLines = lines.filter((line) => line?.variantId && Number(line.quantity) > 0);
  if (!cleanLines.length) {
    throw new Error("Cart is empty");
  }

  if (!cartId) {
    return createCheckoutSession(cleanLines, locale);
  }

  const cartData = await shopifyFetch(CART_QUERY, { id: cartId });
  const cart = cartData?.cart;
  if (!cart) {
    return createCheckoutSession(cleanLines, locale);
  }

  const currentByVariant = new Map();
  for (const edge of cart.lines?.edges || []) {
    const variantId = edge?.node?.merchandise?.id;
    if (!variantId) {
      continue;
    }

    currentByVariant.set(variantId, {
      lineId: edge.node.id,
      quantity: edge.node.quantity,
    });
  }

  const desiredByVariant = new Map(cleanLines.map((line) => [line.variantId, Number(line.quantity)]));
  const toRemove = [];
  const toUpdate = [];
  const toAdd = [];

  for (const [variantId, current] of currentByVariant.entries()) {
    const desiredQuantity = desiredByVariant.get(variantId);
    if (!desiredQuantity) {
      toRemove.push(current.lineId);
      continue;
    }

    if (desiredQuantity !== current.quantity) {
      toUpdate.push({ id: current.lineId, quantity: desiredQuantity });
    }
  }

  for (const [variantId, quantity] of desiredByVariant.entries()) {
    if (!currentByVariant.has(variantId)) {
      toAdd.push({ merchandiseId: variantId, quantity });
    }
  }

  if (toRemove.length) {
    const removeResult = await shopifyFetch(CART_LINES_REMOVE, { cartId, lineIds: toRemove });
    const errors = removeResult?.cartLinesRemove?.userErrors || [];
    if (errors.length) {
      throw new Error(errors.map((e) => e.message).join("; "));
    }
  }

  if (toUpdate.length) {
    const updateResult = await shopifyFetch(CART_LINES_UPDATE, { cartId, lines: toUpdate });
    const errors = updateResult?.cartLinesUpdate?.userErrors || [];
    if (errors.length) {
      throw new Error(errors.map((e) => e.message).join("; "));
    }
  }

  if (toAdd.length) {
    const addResult = await shopifyFetch(CART_LINES_ADD, { cartId, lines: toAdd });
    const errors = addResult?.cartLinesAdd?.userErrors || [];
    if (errors.length) {
      throw new Error(errors.map((e) => e.message).join("; "));
    }
  }

  const synced = await shopifyFetch(CART_QUERY, { id: cartId });
  if (!synced?.cart) {
    return createCheckoutSession(cleanLines, locale);
  }

  return {
    cartId: synced.cart.id,
    checkoutUrl: synced.cart.checkoutUrl,
  };
}

async function forwardJsonWebhook(url, payload) {
  if (!url) {
    return;
  }

  const target = new URL(url);
  if (process.env.NODE_ENV === "production" && target.protocol !== "https:") {
    throw new Error("Outbound webhook URL must use HTTPS");
  }

  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const headers = { "Content-Type": "application/json", "X-Slowfit-Timestamp": timestamp };
  const signingSecret = process.env.OUTBOUND_WEBHOOK_SECRET;
  if (signingSecret) {
    headers["X-Slowfit-Signature"] = createHmac("sha256", signingSecret)
      .update(`${timestamp}.${body}`)
      .digest("base64");
  }

  let lastError;
  for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(target, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (response.ok) {
        return;
      }

      lastError = new Error(`Outbound webhook rejected with status ${response.status}`);
      if (![408, 425, 429].includes(response.status) && response.status < 500) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
      if (attempt >= WEBHOOK_MAX_ATTEMPTS) {
        throw error;
      }
    }

    log("warn", "webhook.delivery.retry", { target: target.origin, attempt });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200 * attempt));
  }

  throw lastError || new Error("Outbound webhook delivery failed");
}

function verifyShopifyHmac(rawBody, signature, secret) {
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const expected = Buffer.from(digest);
  const received = Buffer.from(signature || "");
  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}

function buildOrderIdempotencyKey(topic, payload) {
  const id = payload.id || payload.order_number || payload.name || "unknown";
  const updated = payload.updated_at || payload.processed_at || payload.created_at || "none";
  return `${topic}:${id}:${updated}`;
}

function parsePageNumber(value, fallback = 1, max = 1000) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, parsed));
}

function parsePageSize(value, fallback, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, parsed));
}

function getTrimmedParam(url, key) {
  return String(url.searchParams.get(key) || "").trim();
}

async function processOrderEvent({ topic, shop, payload }, options = { replay: false }) {
  const email = String(payload.email || payload.customer?.email || "").trim().toLowerCase();
  const event = {
    topic,
    shop,
    orderId: payload.id,
    orderNumber: payload.order_number,
    orderName: payload.name,
    email: payload.email,
    total: payload.current_total_price,
    currency: payload.currency,
    items: payload.line_items || [],
    createdAt: new Date().toISOString(),
  };

  if (payload.id && email) {
    const customer = await prisma.customer.findUnique({ where: { email }, select: { id: true } });
    await prisma.order.upsert({
      where: { shopifyOrderId: String(payload.id) },
      create: {
        shopifyOrderId: String(payload.id),
        orderNumber: payload.order_number ? String(payload.order_number) : null,
        name: payload.name ? String(payload.name) : null,
        email,
        financialStatus: payload.financial_status ? String(payload.financial_status) : null,
        fulfillmentStatus: payload.fulfillment_status ? String(payload.fulfillment_status) : null,
        total: payload.current_total_price ? String(payload.current_total_price) : null,
        currency: payload.currency ? String(payload.currency) : null,
        items: payload.line_items || [],
        shopifyCreatedAt: payload.created_at ? new Date(payload.created_at) : null,
        customerId: customer?.id,
      },
      update: {
        orderNumber: payload.order_number ? String(payload.order_number) : null,
        name: payload.name ? String(payload.name) : null,
        email,
        financialStatus: payload.financial_status ? String(payload.financial_status) : null,
        fulfillmentStatus: payload.fulfillment_status ? String(payload.fulfillment_status) : null,
        total: payload.current_total_price ? String(payload.current_total_price) : null,
        currency: payload.currency ? String(payload.currency) : null,
        items: payload.line_items || [],
        customerId: customer?.id,
      },
    });
  }

  await forwardJsonWebhook(process.env.ORDER_EVENTS_WEBHOOK_URL, event);
  await forwardJsonWebhook(process.env.CRM_ORDER_WEBHOOK_URL, {
    source: options.replay ? "slowfit-webhook-replay" : "slowfit-shopify-order-webhook",
    event,
  });

  if ((topic === "orders/create" || topic === "orders/paid") && payload.email) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.ORDER_CONFIRM_FROM;

    if (apiKey && from) {
      const name = `${payload.customer?.first_name || ""} ${payload.customer?.last_name || ""}`.trim() || "Slow Fit customer";
      const orderLabel = payload.name || `#${payload.order_number || ""}`;
      const total = `${payload.current_total_price || "0.00"} ${payload.currency || "USD"}`;
      const items = (payload.line_items || [])
        .map((item) => `${item.quantity || 1}x ${item.title || "Item"}`)
        .slice(0, 8)
        .join(", ");

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [payload.email],
          subject: `Order confirmation ${orderLabel}`,
          html: `<div style=\"font-family:Arial,sans-serif;color:#2f2a28\"><h2>Thanks for your order, ${name}.</h2><p>Order: ${orderLabel}</p><p>Total: ${total}</p><p>Items: ${items}</p></div>`,
        }),
      });
    }
  }
}

async function handleLiveHealth() {
  return jsonResponse({ ok: true, service: "slowfit-backend" });
}

async function handleReadyHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return jsonResponse({ ok: true, db: "ready" });
  } catch (error) {
    return jsonResponse({ ok: false, db: "not-ready", error: String(error?.message || "") }, 503);
  }
}

async function handleContact(request) {
  const payload = await readJson(request);
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim();
  const message = String(payload.message || "").trim();
  const locale = String(payload.locale || "unknown").trim() || "unknown";

  if (!name || !isValidEmail(email) || message.length < 10) {
    return jsonResponse({ error: "Invalid contact payload" }, 400);
  }

  await forwardJsonWebhook(process.env.CONTACT_WEBHOOK_URL, {
    source: "slowfit-backend",
    name,
    email,
    message,
    locale,
    createdAt: new Date().toISOString(),
  });

  await appendAudit("contact.received", { email, locale }, "customer");
  return jsonResponse({ ok: true });
}

async function handleEvent(request) {
  const payload = await readJson(request);
  const eventName = String(payload.eventName || "").trim();
  if (!eventName) {
    return jsonResponse({ error: "Missing eventName" }, 400);
  }

  const event = {
    eventName,
    params: payload.params || {},
    page: payload.page || "unknown",
    locale: payload.locale || "unknown",
    createdAt: payload.createdAt || new Date().toISOString(),
  };

  await forwardJsonWebhook(process.env.ANALYTICS_WEBHOOK_URL, event);
  await appendAudit("event.ingested", { eventName, page: event.page, locale: event.locale });
  return jsonResponse({ ok: true });
}

async function handleCheckout(request) {
  const payload = await readJson(request);
  const locale = normalizeLocale(payload.locale);
  const cartId = payload.cartId ? String(payload.cartId) : undefined;
  const lines = Array.isArray(payload.lines) ? payload.lines : [];

  if (!lines.length) {
    return jsonResponse({ error: "Cart is empty" }, 400);
  }

  try {
    const checkout = await syncCheckoutSession(lines, locale, cartId);
    await appendAudit("checkout.created", { locale, cartId: checkout.cartId, lineCount: lines.length }, "customer");
    return jsonResponse({ ok: true, checkout });
  } catch (error) {
    log("error", "checkout.failed", { error: String(error?.message || "unknown_error") });
    return jsonResponse({ error: "Unable to create checkout" }, 500);
  }
}

async function handleReadReviews(request) {
  const url = parseUrl(request);
  const productHandle = (url.searchParams.get("productHandle") || "").trim();
  const locale = normalizeLocale(url.searchParams.get("locale") || DEFAULT_LOCALE);

  if (!productHandle) {
    return jsonResponse({ error: "productHandle is required" }, 400);
  }

  const approved = await prisma.review.findMany({
    where: {
      productHandle,
      status: "APPROVED",
      OR: [{ locale }, { locale: "all" }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      productHandle: true,
      locale: true,
      rating: true,
      author: true,
      content: true,
      source: true,
      createdAt: true,
    },
  });

  const fallback = FALLBACK_APPROVED_REVIEWS.filter(
    (review) => review.productHandle === productHandle && (review.locale === "all" || review.locale === locale),
  );

  const combined = [...approved, ...fallback];
  const count = combined.length;
  const average = count ? combined.reduce((sum, review) => sum + Number(review.rating || 0), 0) / count : 0;

  const pendingCount = await prisma.review.count({
    where: {
      productHandle,
      status: "PENDING",
    },
  });

  return jsonResponse({
    reviews: combined,
    average,
    count,
    pendingCount,
  });
}

async function handleSubmitReview(request) {
  const payload = await readJson(request);
  const productHandle = String(payload.productHandle || "").trim();
  const locale = normalizeLocale(payload.locale);
  const rating = Number(payload.rating || 0);
  const author = String(payload.author || "").trim();
  const email = String(payload.email || "").trim();
  const content = String(payload.content || "").trim();

  if (!productHandle || !author || !isValidEmail(email) || content.length < 12 || rating < 1 || rating > 5) {
    return jsonResponse({ error: "Invalid review payload" }, 400);
  }

  const review = await prisma.review.create({
    data: {
      productHandle,
      locale,
      rating,
      author,
      email,
      content,
      status: "PENDING",
      source: "manual",
    },
  });

  await forwardJsonWebhook(process.env.REVIEWS_MODERATION_WEBHOOK_URL, {
    type: "review.submitted",
    review,
  });

  await appendAudit("review.submitted", { reviewId: review.id, productHandle }, "customer");
  return jsonResponse({ ok: true, reviewId: review.id, status: "pending" });
}

async function isModeratorAuthorized(request) {
  if (getAdminSessionFromRequest(request)) {
    return true;
  }

  const token = request.headers.get("x-moderation-token") || "";
  return Boolean(process.env.REVIEW_MODERATION_TOKEN && token && token === process.env.REVIEW_MODERATION_TOKEN);
}

async function handlePendingReviews(request) {
  if (!(await isModeratorAuthorized(request))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = parseUrl(request);
  const page = parsePageNumber(url.searchParams.get("page"), 1, 1000);
  const pageSize = parsePageSize(url.searchParams.get("pageSize"), 12, 100);
  const status = getTrimmedParam(url, "status") || "PENDING";
  const search = getTrimmedParam(url, "search");
  const locale = getTrimmedParam(url, "locale");
  const rating = Number.parseInt(getTrimmedParam(url, "rating"), 10);
  const createdFrom = getTrimmedParam(url, "createdFrom");
  const createdTo = getTrimmedParam(url, "createdTo");

  const where = {};
  if (status !== "all") {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { productHandle: { contains: search, mode: "insensitive" } },
      { author: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
    ];
  }

  if (locale === "es" || locale === "en") {
    where.locale = locale;
  }

  if (rating >= 1 && rating <= 5) {
    where.rating = rating;
  }

  if (createdFrom || createdTo) {
    where.createdAt = {};
    if (createdFrom && !Number.isNaN(Date.parse(createdFrom))) where.createdAt.gte = new Date(createdFrom);
    if (createdTo && !Number.isNaN(Date.parse(createdTo))) where.createdAt.lte = new Date(createdTo);
    if (!Object.keys(where.createdAt).length) delete where.createdAt;
  }

  const [total, reviews] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return jsonResponse({ pending: reviews, reviews, total, page, pageSize });
}

async function handleBulkModerateReviews(request) {
  if (!(await isModeratorAuthorized(request))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const payload = await readJson(request);
  const reviewIds = [...new Set(Array.isArray(payload.reviewIds) ? payload.reviewIds.map(String) : [])]
    .map((id) => id.trim())
    .filter(Boolean);
  const action = payload.action;
  const moderator = String(payload.moderator || "moderator");

  if (!reviewIds.length || reviewIds.length > 100 || (action !== "approve" && action !== "reject")) {
    return jsonResponse({ error: "Invalid bulk moderation payload" }, 400);
  }

  const pendingReviews = await prisma.review.findMany({
    where: { id: { in: reviewIds }, status: "PENDING" },
  });
  const changedIds = pendingReviews.map((review) => review.id);
  const skippedIds = reviewIds.filter((id) => !changedIds.includes(id));
  const status = action === "approve" ? "APPROVED" : "REJECTED";
  const moderatedAt = new Date();

  if (changedIds.length) {
    await prisma.$transaction([
      prisma.review.updateMany({
        where: { id: { in: changedIds }, status: "PENDING" },
        data: { status, moderatedAt, moderatedBy: moderator },
      }),
      prisma.auditLog.create({
        data: {
          action: "review.moderated.bulk",
          actor: moderator,
          details: { reviewIds: changedIds, action, count: changedIds.length },
        },
      }),
    ]);

    await Promise.all(pendingReviews.map((review) => forwardJsonWebhook(process.env.REVIEWS_MODERATION_WEBHOOK_URL, {
      type: "review.moderated",
      action,
      review,
      moderator,
    })));
  }

  return jsonResponse({ ok: true, changedIds, skippedIds });
}

async function handleModerateReview(request) {
  if (!(await isModeratorAuthorized(request))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const payload = await readJson(request);
  const reviewId = String(payload.reviewId || "").trim();
  const action = payload.action;
  const moderator = String(payload.moderator || "moderator");

  if (!reviewId || (action !== "approve" && action !== "reject")) {
    return jsonResponse({ error: "Invalid moderation payload" }, 400);
  }

  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review || review.status !== "PENDING") {
    return jsonResponse({ error: "Review not found" }, 404);
  }

  const status = action === "approve" ? "APPROVED" : "REJECTED";
  await prisma.review.update({
    where: { id: reviewId },
    data: {
      status,
      moderatedAt: new Date(),
      moderatedBy: moderator,
    },
  });

  await forwardJsonWebhook(process.env.REVIEWS_MODERATION_WEBHOOK_URL, {
    type: "review.moderated",
    action,
    review,
    moderator,
  });

  await appendAudit("review.moderated", { reviewId, action, productHandle: review.productHandle }, moderator);
  return jsonResponse({ ok: true });
}

async function handleAdminLogin(request) {
  const payload = await readJson(request);
  const token = String(payload.token || "");
  if (!process.env.REVIEW_MODERATION_TOKEN || token !== process.env.REVIEW_MODERATION_TOKEN) {
    await appendAudit("admin.login.failed", { reason: "invalid_credentials" }, "unknown");
    return jsonResponse({ error: "Invalid credentials" }, 401);
  }

  const sessionToken = createAdminSessionToken();
  await appendAudit("admin.login", { success: true }, "moderator");
  return jsonResponse({ ok: true }, 200, {
    "Set-Cookie": buildSessionCookie(sessionToken),
  });
}

async function handleAdminLogout() {
  await appendAudit("admin.logout", { success: true }, "moderator");
  return jsonResponse({ ok: true }, 200, {
    "Set-Cookie": clearSessionCookie(),
  });
}

function customerResponse(customer) {
  return {
    id: customer.id,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    locale: customer.locale,
  };
}

async function handleCustomerRegister(request) {
  const payload = await readJson(request);
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const firstName = String(payload.firstName || "").trim();
  const lastName = String(payload.lastName || "").trim() || null;
  const locale = normalizeLocale(payload.locale);

  if (!isValidEmail(email) || password.length < 8 || password.length > 128 || !firstName) {
    return jsonResponse({ error: "Invalid account details" }, 400);
  }

  try {
    const customer = await prisma.customer.create({
      data: { email, passwordHash: await hashPassword(password), firstName, lastName, locale },
    });
    await prisma.order.updateMany({ where: { email, customerId: null }, data: { customerId: customer.id } });
    await appendAudit("customer.registered", { customerId: customer.id }, email);
    return jsonResponse({ ok: true, customer: customerResponse(customer) }, 201, {
      "Set-Cookie": buildCustomerSessionCookie(createCustomerSessionToken(customer)),
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return jsonResponse({ error: "An account already exists for this email" }, 409);
    }
    throw error;
  }
}

async function handleCustomerLogin(request) {
  const payload = await readJson(request);
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const customer = isValidEmail(email) ? await prisma.customer.findUnique({ where: { email } }) : null;

  if (!customer || !(await verifyPassword(password, customer.passwordHash))) {
    await appendAudit("customer.login.failed", { email }, "unknown");
    return jsonResponse({ error: "Invalid email or password" }, 401);
  }

  await appendAudit("customer.login", { customerId: customer.id }, email);
  return jsonResponse({ ok: true, customer: customerResponse(customer) }, 200, {
    "Set-Cookie": buildCustomerSessionCookie(createCustomerSessionToken(customer)),
  });
}

async function handleCustomerSession(request) {
  const session = getCustomerSessionFromRequest(request);
  if (!session) {
    return jsonResponse({ authenticated: false }, 401);
  }

  const customer = await prisma.customer.findUnique({ where: { id: session.customerId } });
  if (!customer) {
    return jsonResponse({ authenticated: false }, 401);
  }

  return jsonResponse({ authenticated: true, customer: customerResponse(customer) });
}

async function handleCustomerLogout() {
  return jsonResponse({ ok: true }, 200, {
    "Set-Cookie": clearCustomerSessionCookie(),
  });
}

async function handleCustomerOrders(request) {
  const session = getCustomerSessionFromRequest(request);
  if (!session) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const orders = await prisma.order.findMany({
    where: { customerId: session.customerId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      name: true,
      financialStatus: true,
      fulfillmentStatus: true,
      total: true,
      currency: true,
      items: true,
      shopifyCreatedAt: true,
      updatedAt: true,
    },
  });
  return jsonResponse({ orders });
}

async function handleCustomerReviews(request) {
  const session = getCustomerSessionFromRequest(request);
  if (!session) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const customer = await prisma.customer.findUnique({ where: { id: session.customerId }, select: { email: true } });
  if (!customer) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = parseUrl(request);
  const page = parsePageNumber(url.searchParams.get("page"), 1, 1000);
  const pageSize = parsePageSize(url.searchParams.get("pageSize"), 10, 50);
  const where = { email: { equals: customer.email, mode: "insensitive" } };
  const [total, reviews] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        productHandle: true,
        locale: true,
        rating: true,
        content: true,
        status: true,
        createdAt: true,
        moderatedAt: true,
      },
    }),
  ]);
  return jsonResponse({ reviews, total, page, pageSize });
}

async function handleAdminAuditLogs(request) {
  if (!(await isModeratorAuthorized(request))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = parseUrl(request);
  const page = parsePageNumber(url.searchParams.get("page"), 1, 1000);
  const pageSize = parsePageSize(url.searchParams.get("pageSize"), 10, 100);
  const action = getTrimmedParam(url, "action");
  const search = getTrimmedParam(url, "search");

  const where = {};
  if (action && action !== "all") {
    where.action = action;
  }

  if (search) {
    where.OR = [
      { action: { contains: search, mode: "insensitive" } },
      { actor: { contains: search, mode: "insensitive" } },
    ];
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return jsonResponse({ logs, total, page, pageSize });
}

async function handleAdminOrderWebhooks(request) {
  if (!(await isModeratorAuthorized(request))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = parseUrl(request);
  const page = parsePageNumber(url.searchParams.get("page"), 1, 1000);
  const pageSize = parsePageSize(url.searchParams.get("pageSize"), 10, 100);
  const status = getTrimmedParam(url, "status");
  const search = getTrimmedParam(url, "search");

  const where = {};
  if (status && status !== "all") {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { topic: { contains: search, mode: "insensitive" } },
      { shop: { contains: search, mode: "insensitive" } },
      { orderId: { contains: search, mode: "insensitive" } },
      { errorMessage: { contains: search, mode: "insensitive" } },
    ];
  }

  const [total, events] = await Promise.all([
    prisma.orderWebhookEvent.count({ where }),
    prisma.orderWebhookEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return jsonResponse({ events, total, page, pageSize });
}

async function handleReplayOrderWebhook(request) {
  if (!(await isModeratorAuthorized(request))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const payload = await readJson(request);
  const eventId = String(payload.eventId || "").trim();
  const actor = String(payload.actor || "moderator");

  if (!eventId) {
    return jsonResponse({ error: "eventId is required" }, 400);
  }

  const event = await prisma.orderWebhookEvent.findUnique({ where: { id: eventId } });
  if (!event) {
    return jsonResponse({ error: "Webhook event not found" }, 404);
  }

  const typedPayload = event.payload;
  await processOrderEvent({
    topic: event.topic,
    shop: event.shop,
    payload: typedPayload,
  }, { replay: true });

  await prisma.orderWebhookEvent.update({
    where: { id: event.id },
    data: {
      replayedAt: new Date(),
    },
  });

  await appendAudit("order.webhook.replayed", { eventId: event.id, topic: event.topic }, actor);
  return jsonResponse({ ok: true });
}

async function handleShopifyOrderWebhook(request) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const signature = request.headers.get("x-shopify-hmac-sha256") || "";
  const topic = request.headers.get("x-shopify-topic") || "unknown";
  const shop = request.headers.get("x-shopify-shop-domain") || "unknown";
  const rawBody = await request.text();

  if (!secret || !signature || !verifyShopifyHmac(rawBody, signature, secret)) {
    return jsonResponse({ error: "Invalid signature" }, 401);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const idempotencyKey = buildOrderIdempotencyKey(topic, payload);

  let createdEvent;
  try {
    createdEvent = await prisma.orderWebhookEvent.create({
      data: {
        idempotencyKey,
        topic,
        shop,
        orderId: payload.id ? String(payload.id) : null,
        payload,
        status: "PROCESSED",
        processedAt: new Date(),
      },
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return jsonResponse({ ok: true, duplicate: true });
    }
    throw error;
  }

  try {
    await processOrderEvent({ topic, shop, payload });
    await appendAudit("order.webhook.processed", { topic, orderId: payload.id, idempotencyKey }, "shopify-webhook");
    return jsonResponse({ ok: true });
  } catch (error) {
    await prisma.orderWebhookEvent.update({
      where: { id: createdEvent.id },
      data: {
        status: "FAILED",
        errorMessage: String(error?.message || "unknown_error"),
      },
    });

    await appendAudit(
      "order.webhook.failed",
      { topic, orderId: payload.id, idempotencyKey, error: String(error?.message || "unknown_error") },
      "shopify-webhook",
    );
    return jsonResponse({ error: "Webhook processing failed" }, 500);
  }
}

export async function route(request) {
  const url = parseUrl(request);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  const rate = applyRateLimit(request);
  if (rate.limited) {
    return jsonResponse(
      { error: "Too many requests", retryAfterSeconds: rate.retryAfterSeconds },
      429,
      { "Retry-After": String(rate.retryAfterSeconds) },
    );
  }

  if (pathname === "/health/live" && method === "GET") {
    return handleLiveHealth();
  }

  if (pathname === "/health/ready" && method === "GET") {
    return handleReadyHealth();
  }

  if (pathname === "/api/contact" && method === "POST") {
    return handleContact(request);
  }

  if (pathname === "/api/events" && method === "POST") {
    return handleEvent(request);
  }

  if (pathname === "/api/cart/checkout" && method === "POST") {
    return handleCheckout(request);
  }

  if (pathname === "/api/reviews" && method === "GET") {
    return handleReadReviews(request);
  }

  if (pathname === "/api/reviews/submit" && method === "POST") {
    return handleSubmitReview(request);
  }

  if (pathname === "/api/reviews/pending" && method === "GET") {
    return handlePendingReviews(request);
  }

  if (pathname === "/api/reviews/moderate" && method === "POST") {
    return handleModerateReview(request);
  }

  if (pathname === "/api/reviews/moderate/bulk" && method === "POST") {
    return handleBulkModerateReviews(request);
  }

  if (pathname === "/api/admin/login" && method === "POST") {
    return handleAdminLogin(request);
  }

  if (pathname === "/api/auth/register" && method === "POST") {
    return handleCustomerRegister(request);
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    return handleCustomerLogin(request);
  }

  if (pathname === "/api/auth/session" && method === "GET") {
    return handleCustomerSession(request);
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    return handleCustomerLogout();
  }

  if (pathname === "/api/account/orders" && method === "GET") {
    return handleCustomerOrders(request);
  }

  if (pathname === "/api/account/reviews" && method === "GET") {
    return handleCustomerReviews(request);
  }

  if (pathname === "/api/admin/logout" && method === "POST") {
    return handleAdminLogout();
  }

  if (pathname === "/api/admin/audit-logs" && method === "GET") {
    return handleAdminAuditLogs(request);
  }

  if (pathname === "/api/admin/webhooks/orders" && method === "GET") {
    return handleAdminOrderWebhooks(request);
  }

  if (pathname === "/api/admin/webhooks/orders/replay" && method === "POST") {
    return handleReplayOrderWebhook(request);
  }

  if (pathname === "/api/webhooks/shopify/orders" && method === "POST") {
    return handleShopifyOrderWebhook(request);
  }

  return jsonResponse({ error: "Not found" }, 404);
}

export function createRequestListener() {
  return async (req, res) => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const chunks = [];
  let bodyBytes = 0;
  let rejected = false;

  req.on("data", (chunk) => {
    bodyBytes += chunk.length;
    if (bodyBytes > MAX_REQUEST_BODY_BYTES) {
      rejected = true;
      chunks.length = 0;
      res.statusCode = 413;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.end(JSON.stringify({ error: "Request body too large" }));
      req.resume();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", async () => {
    if (rejected) {
      return;
    }

    const body = Buffer.concat(chunks);
    const request = new Request(`http://${req.headers.host || `${HOST}:${PORT}`}${req.url || "/"}`, {
      method: req.method,
      headers: req.headers,
      body: ["GET", "HEAD"].includes((req.method || "GET").toUpperCase()) ? undefined : body,
    });

    let response;
    try {
      response = await route(request);
    } catch (error) {
      log("error", "request.failed", {
        requestId,
        method: req.method || "GET",
        path: req.url || "/",
        error: String(error?.message || "unknown_error"),
      });
      response = jsonResponse({ error: "Internal server error" }, 500);
    }

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const out = await response.arrayBuffer();
    res.end(Buffer.from(out));

    const durationMs = Date.now() - startedAt;
    log("info", "request.completed", {
      requestId,
      method: req.method || "GET",
      path: req.url || "/",
      status: response.status,
      durationMs,
      ip: getClientIp(request),
      userAgent: req.headers["user-agent"] || "unknown",
    });
  });
  };
}

export function startServer() {
  return createServer(createRequestListener()).listen(PORT, HOST, () => {
    log("info", "server.started", { host: HOST, port: PORT });
  });
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  startServer();
}
