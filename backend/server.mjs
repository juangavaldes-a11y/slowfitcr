import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || "0.0.0.0";
const DEFAULT_LOCALE = "es";

const SESSION_COOKIE_NAME = "slowfit_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const CUSTOMER_SESSION_COOKIE_NAME = "slowfit_customer_session";
const CUSTOMER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const SESSION_CLOCK_SKEW_MS = 60 * 1000;
const LOGIN_FAILURE_LIMIT = Number.parseInt(process.env.LOGIN_FAILURE_LIMIT || "5", 10);
const LOGIN_LOCKOUT_MS = Number.parseInt(process.env.LOGIN_LOCKOUT_MS || "900000", 10);
const PASSWORD_RESET_MAX_AGE_MS = Number.parseInt(process.env.PASSWORD_RESET_MAX_AGE_MS || "1800000", 10);
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

export function validateProductionConfiguration() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const secrets = {
    REVIEW_MODERATION_TOKEN: process.env.REVIEW_MODERATION_TOKEN || "",
    REVIEW_MODERATION_SESSION_SECRET: process.env.REVIEW_MODERATION_SESSION_SECRET || "",
    CUSTOMER_SESSION_SECRET: process.env.CUSTOMER_SESSION_SECRET || "",
  };
  const invalidNames = Object.entries(secrets)
    .filter(([, value]) => value.length < 32)
    .map(([name]) => name);
  if (invalidNames.length) {
    throw new Error(`Production secrets must contain at least 32 characters: ${invalidNames.join(", ")}`);
  }

  if (new Set(Object.values(secrets)).size !== Object.keys(secrets).length) {
    throw new Error("Production authentication secrets must be distinct");
  }
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
    const now = Date.now();
    return Boolean(
      decoded.iat
      && decoded.iat <= now + SESSION_CLOCK_SKEW_MS
      && decoded.exp > now
      && decoded.exp <= decoded.iat + SESSION_MAX_AGE_SECONDS * 1000
      && decoded.role === "review-moderator",
    );
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

function hashResetToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function sendPasswordResetEmail({ email, locale, token }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ACCOUNT_RESET_FROM || process.env.ORDER_CONFIRM_FROM;
  if (!apiKey || !from) {
    throw new Error("Password reset email delivery is not configured");
  }

  const appOrigin = process.env.APP_ORIGIN || "https://slowfitcr.com";
  const resetUrl = new URL(`/${locale}/account`, appOrigin);
  resetUrl.searchParams.set("resetToken", token);
  const subject = locale === "es" ? "Restablece tu contraseña de Slow Fit" : "Reset your Slow Fit password";
  const heading = locale === "es" ? "Restablece tu contraseña" : "Reset your password";
  const message = locale === "es"
    ? "Este enlace vence en 30 minutos y solo puede utilizarse una vez."
    : "This link expires in 30 minutes and can only be used once.";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      html: `<div style="font-family:Arial,sans-serif;color:#2f2a28"><h2>${heading}</h2><p>${message}</p><p><a href="${resetUrl.toString()}">${heading}</a></p></div>`,
    }),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Password reset email rejected with status ${response.status}`);
  }
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
    const now = Date.now();
    return decoded.iat
      && decoded.iat <= now + SESSION_CLOCK_SKEW_MS
      && decoded.exp > now
      && decoded.exp <= decoded.iat + CUSTOMER_SESSION_MAX_AGE_SECONDS * 1000
      && decoded.role === "customer"
      && decoded.customerId
      ? decoded
      : null;
  } catch {
    return null;
  }
}

function isTrustedBrowserMutation(request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  const configuredOrigins = (process.env.APP_ORIGINS || "https://slowfitcr.com,https://www.slowfitcr.com")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configuredOrigins.includes(origin)) {
    return true;
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      return ["localhost", "127.0.0.1"].includes(new URL(origin).hostname);
    } catch {
      return false;
    }
  }

  return false;
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

async function createPaymentSession(lines, locale) {
  const quantities = new Map();
  for (const line of lines) {
    const variantId = String(line?.variantId || "").trim();
    const quantity = Number(line?.quantity);
    if (!variantId || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new Error("INVALID_CART");
    }
    quantities.set(variantId, (quantities.get(variantId) || 0) + quantity);
  }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: [...quantities.keys()] }, product: { status: "ACTIVE" } },
    include: { product: { select: { title: true, handle: true } } },
  });
  if (variants.length !== quantities.size) {
    throw new Error("INVALID_CART");
  }

  const items = variants.map((variant) => {
    const quantity = quantities.get(variant.id);
    if (variant.inventoryQuantity < quantity) {
      throw new Error("INSUFFICIENT_STOCK");
    }
    return {
      variantId: variant.id,
      sku: variant.sku,
      name: `${variant.product.title} - ${variant.title}`,
      quantity,
      unitPrice: Number(variant.price),
      lineTotal: Number(variant.price) * quantity,
    };
  });

  const providerUrl = process.env.PAYMENT_PROVIDER_URL;
  const providerToken = process.env.PAYMENT_PROVIDER_TOKEN;
  if (!providerUrl || !providerToken) {
    throw new Error("PAYMENT_NOT_CONFIGURED");
  }

  const reference = randomUUID();
  const origin = process.env.APP_ORIGIN || "https://slowfitcr.com";
  const paymentPayload = {
    reference,
    currency: process.env.STORE_CURRENCY || "USD",
    amount: items.reduce((total, item) => total + item.lineTotal, 0),
    items,
    returnUrl: `${origin}/${locale}/account?payment=success&reference=${reference}`,
    cancelUrl: `${origin}/${locale}/shop?payment=cancelled`,
  };
  const response = await fetch(providerUrl, {
    method: "POST",
    headers: { "Authorization": `Bearer ${providerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(paymentPayload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.checkoutUrl) {
    throw new Error("PAYMENT_PROVIDER_ERROR");
  }
  return { cartId: reference, checkoutUrl: result.checkoutUrl };
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

function verifyPaymentHmac(rawBody, signature, secret) {
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const expected = Buffer.from(digest);
  const received = Buffer.from(signature || "");
  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}

function buildOrderIdempotencyKey(topic, payload) {
  const id = payload.reference || payload.id || payload.orderNumber || payload.name || "unknown";
  const updated = payload.updatedAt || payload.processedAt || payload.createdAt || payload.updated_at || "none";
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

const CATALOG_PRODUCT_INCLUDE = {
  images: { orderBy: { position: "asc" } },
  variants: { orderBy: { position: "asc" } },
};

function catalogHandle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function serializeCatalogProduct(product) {
  return {
    ...product,
    currencyCode: process.env.STORE_CURRENCY || "USD",
    images: product.images.map((image) => ({ ...image })),
    variants: product.variants.map((variant) => ({
      ...variant,
      price: Number(variant.price),
      compareAtPrice: variant.compareAtPrice === null ? null : Number(variant.compareAtPrice),
      currencyCode: process.env.STORE_CURRENCY || "USD",
      availableForSale: variant.inventoryQuantity > 0,
    })),
  };
}

function normalizeCatalogProduct(payload) {
  const title = String(payload.title || "").trim();
  const handle = catalogHandle(payload.handle || title);
  const description = String(payload.description || "").trim();
  const status = String(payload.status || "DRAFT").toUpperCase();
  const tags = Array.from(new Set((Array.isArray(payload.tags) ? payload.tags : [])
    .map((tag) => String(tag).trim().toLowerCase())
    .filter(Boolean)));
  const rawImages = Array.isArray(payload.images) ? payload.images : [];
  const rawVariants = Array.isArray(payload.variants) ? payload.variants : [];

  if (!title || title.length > 120 || !handle || handle.length > 160 || description.length > 5000) {
    throw new Error("Invalid product details");
  }
  if (!["DRAFT", "ACTIVE", "ARCHIVED"].includes(status) || tags.length > 20 || tags.some((tag) => tag.length > 40)) {
    throw new Error("Invalid product status or tags");
  }
  if (!rawVariants.length || rawVariants.length > 50 || rawImages.length > 10) {
    throw new Error("A product requires 1-50 variants and supports up to 10 images");
  }

  const variants = rawVariants.map((variant, position) => {
    const id = String(variant.id || "").trim() || undefined;
    const variantTitle = String(variant.title || "").trim();
    const sku = String(variant.sku || "").trim() || null;
    const price = Number(variant.price);
    const compareAtPrice = variant.compareAtPrice === null || variant.compareAtPrice === ""
      ? null
      : Number(variant.compareAtPrice);
    const inventoryQuantity = Number(variant.inventoryQuantity);

    if (!variantTitle || variantTitle.length > 80 || (sku && sku.length > 80)
      || !Number.isFinite(price) || price < 0
      || (compareAtPrice !== null && (!Number.isFinite(compareAtPrice) || compareAtPrice <= price))
      || !Number.isInteger(inventoryQuantity) || inventoryQuantity < 0) {
      throw new Error("Invalid product variant");
    }

    return { id, title: variantTitle, sku, price, compareAtPrice, inventoryQuantity, position };
  });

  const images = rawImages.map((image, position) => {
    const id = String(image.id || "").trim() || undefined;
    const url = String(image.url || "").trim();
    const altText = String(image.altText || "").trim();
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error("Invalid product image URL");
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol) || altText.length > 160) {
      throw new Error("Invalid product image URL");
    }
    return { id, url, altText, position };
  });

  return { title, handle, description, status, tags, variants, images };
}

function paymentInventoryLines(items) {
  const quantities = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const variantId = String(item?.variantId || "").trim();
    const quantity = Number(item?.quantity);
    if (!variantId || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new Error("INVALID_PAYMENT_ITEMS");
    }
    quantities.set(variantId, (quantities.get(variantId) || 0) + quantity);
  }
  if (!quantities.size) {
    throw new Error("INVALID_PAYMENT_ITEMS");
  }
  return quantities;
}

async function processOrderEvent({ topic, provider, payload }, options = { replay: false }) {
  const email = String(payload.email || "").trim().toLowerCase();
  const externalPaymentId = String(payload.reference || payload.id || "").trim();
  if (topic === "payment.paid" && (!externalPaymentId || !email)) {
    throw new Error("INVALID_PAID_PAYMENT");
  }
  const event = {
    topic,
    provider,
    orderId: externalPaymentId,
    orderNumber: payload.orderNumber,
    orderName: payload.name,
    email,
    total: payload.amount,
    currency: payload.currency,
    items: payload.items || [],
    createdAt: new Date().toISOString(),
  };

  if (externalPaymentId && email) {
    const customer = await prisma.customer.findUnique({ where: { email }, select: { id: true } });
    const inventoryLines = topic === "payment.paid" ? paymentInventoryLines(payload.items) : null;
    await prisma.$transaction(async (transaction) => {
      const order = await transaction.order.upsert({
        where: { externalPaymentId },
        create: {
          externalPaymentId,
          orderNumber: payload.orderNumber ? String(payload.orderNumber) : null,
          name: payload.name ? String(payload.name) : null,
          email,
          financialStatus: payload.status ? String(payload.status) : null,
          fulfillmentStatus: payload.fulfillmentStatus ? String(payload.fulfillmentStatus) : null,
          total: payload.amount === undefined ? null : String(payload.amount),
          currency: payload.currency ? String(payload.currency) : null,
          items: payload.items || [],
          paymentCreatedAt: payload.createdAt ? new Date(payload.createdAt) : null,
          customerId: customer?.id,
        },
        update: {
          orderNumber: payload.orderNumber ? String(payload.orderNumber) : null,
          name: payload.name ? String(payload.name) : null,
          email,
          financialStatus: payload.status ? String(payload.status) : null,
          fulfillmentStatus: payload.fulfillmentStatus ? String(payload.fulfillmentStatus) : null,
          total: payload.amount === undefined ? null : String(payload.amount),
          currency: payload.currency ? String(payload.currency) : null,
          items: payload.items || [],
          customerId: customer?.id,
        },
      });

      if (!inventoryLines) {
        return;
      }

      const claimed = await transaction.order.updateMany({
        where: { id: order.id, inventoryAdjustedAt: null },
        data: { inventoryAdjustedAt: new Date() },
      });
      if (!claimed.count) {
        return;
      }

      for (const [variantId, quantity] of inventoryLines) {
        const adjusted = await transaction.productVariant.updateMany({
          where: { id: variantId, inventoryQuantity: { gte: quantity } },
          data: { inventoryQuantity: { decrement: quantity } },
        });
        if (adjusted.count !== 1) {
          throw new Error("INSUFFICIENT_STOCK_AT_PAYMENT");
        }
      }
    }, { isolationLevel: "Serializable" });
  }

  await forwardJsonWebhook(process.env.ORDER_EVENTS_WEBHOOK_URL, event);
  await forwardJsonWebhook(process.env.CRM_ORDER_WEBHOOK_URL, {
    source: options.replay ? "slowfit-webhook-replay" : "slowfit-payment-webhook",
    event,
  });

  if ((topic === "payment.created" || topic === "payment.paid") && email) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.ORDER_CONFIRM_FROM;

    if (apiKey && from) {
      const name = String(payload.customerName || "").trim() || "Slow Fit customer";
      const orderLabel = payload.name || `#${payload.orderNumber || externalPaymentId}`;
      const total = `${payload.amount || "0.00"} ${payload.currency || "USD"}`;
      const items = (payload.items || [])
        .map((item) => `${item.quantity || 1}x ${item.name || "Item"}`)
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
          to: [email],
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
  const lines = Array.isArray(payload.lines) ? payload.lines : [];

  if (!lines.length) {
    return jsonResponse({ error: "Cart is empty" }, 400);
  }

  try {
    const checkout = await createPaymentSession(lines, locale);
    await appendAudit("checkout.created", { locale, reference: checkout.cartId, lineCount: lines.length }, "customer");
    return jsonResponse({ ok: true, checkout });
  } catch (error) {
    if (error?.message === "INVALID_CART") return jsonResponse({ error: "Invalid cart" }, 400);
    if (error?.message === "INSUFFICIENT_STOCK") return jsonResponse({ error: "Insufficient stock" }, 409);
    if (error?.message === "PAYMENT_NOT_CONFIGURED") return jsonResponse({ error: "Payment provider is not configured" }, 503);
    log("error", "checkout.failed", { error: String(error?.message || "unknown_error") });
    return jsonResponse({ error: "Unable to create payment session" }, 502);
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
  return Boolean(process.env.REVIEW_MODERATION_TOKEN && token && safeCompare(token, process.env.REVIEW_MODERATION_TOKEN));
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
  if (!process.env.REVIEW_MODERATION_TOKEN || !safeCompare(token, process.env.REVIEW_MODERATION_TOKEN)) {
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
  const now = new Date();

  if (customer?.lockedUntil && customer.lockedUntil > now) {
    await appendAudit("customer.login.blocked", { customerId: customer.id }, "unknown");
    return jsonResponse({ error: "Invalid email or password" }, 401);
  }

  if (!customer || !(await verifyPassword(password, customer.passwordHash))) {
    if (customer) {
      const updated = await prisma.customer.update({
        where: { id: customer.id },
        data: { failedLoginAttempts: { increment: 1 }, lockedUntil: null },
        select: { failedLoginAttempts: true },
      });
      if (updated.failedLoginAttempts >= LOGIN_FAILURE_LIMIT) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOGIN_LOCKOUT_MS) },
        });
      }
    }
    await appendAudit("customer.login.failed", { email }, "unknown");
    return jsonResponse({ error: "Invalid email or password" }, 401);
  }

  await prisma.customer.update({
    where: { id: customer.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
  await appendAudit("customer.login", { customerId: customer.id }, email);
  return jsonResponse({ ok: true, customer: customerResponse(customer) }, 200, {
    "Set-Cookie": buildCustomerSessionCookie(createCustomerSessionToken(customer)),
  });
}

async function handlePasswordResetRequest(request) {
  if (!process.env.RESEND_API_KEY || !(process.env.ACCOUNT_RESET_FROM || process.env.ORDER_CONFIRM_FROM)) {
    return jsonResponse({ error: "Password recovery is unavailable" }, 503);
  }

  const payload = await readJson(request);
  const email = String(payload.email || "").trim().toLowerCase();
  const locale = normalizeLocale(payload.locale);
  const accepted = { ok: true, message: "If an account exists, a reset link has been sent." };
  if (!isValidEmail(email)) {
    return jsonResponse(accepted, 202);
  }

  const customer = await prisma.customer.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!customer) {
    return jsonResponse(accepted, 202);
  }

  const token = randomBytes(32).toString("base64url");
  const resetRecord = await prisma.$transaction(async (transaction) => {
    await transaction.passwordResetToken.deleteMany({ where: { customerId: customer.id } });
    return transaction.passwordResetToken.create({
      data: {
        customerId: customer.id,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_MAX_AGE_MS),
      },
    });
  });

  try {
    await sendPasswordResetEmail({ email: customer.email, locale, token });
    await appendAudit("customer.password_reset.requested", { customerId: customer.id }, "customer");
  } catch (error) {
    await prisma.passwordResetToken.delete({ where: { id: resetRecord.id } }).catch(() => undefined);
    log("error", "customer.password_reset.delivery_failed", {
      customerId: customer.id,
      error: String(error?.message || "unknown_error"),
    });
  }

  return jsonResponse(accepted, 202);
}

async function handlePasswordReset(request) {
  const payload = await readJson(request);
  const token = String(payload.token || "");
  const password = String(payload.password || "");
  if (token.length < 32 || token.length > 256 || password.length < 8 || password.length > 128) {
    return jsonResponse({ error: "Invalid or expired reset link" }, 400);
  }

  try {
    const customerId = await prisma.$transaction(async (transaction) => {
      const record = await transaction.passwordResetToken.findUnique({
        where: { tokenHash: hashResetToken(token) },
      });
      if (!record || record.consumedAt || record.expiresAt <= new Date()) {
        throw new Error("INVALID_RESET_TOKEN");
      }

      const consumed = await transaction.passwordResetToken.updateMany({
        where: { id: record.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new Error("INVALID_RESET_TOKEN");
      }

      await transaction.customer.update({
        where: { id: record.customerId },
        data: {
          passwordHash: await hashPassword(password),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await transaction.passwordResetToken.updateMany({
        where: { customerId: record.customerId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return record.customerId;
    });

    await appendAudit("customer.password_reset.completed", { customerId }, "customer");
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error?.message === "INVALID_RESET_TOKEN") {
      return jsonResponse({ error: "Invalid or expired reset link" }, 400);
    }
    throw error;
  }
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
      paymentCreatedAt: true,
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

async function handleCatalogProducts(request, admin = false) {
  if (admin && !(await isModeratorAuthorized(request))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = parseUrl(request);
  const page = parsePageNumber(url.searchParams.get("page"), 1, 1000);
  const pageSize = parsePageSize(url.searchParams.get("pageSize"), 24, 100);
  const search = getTrimmedParam(url, "search");
  const tag = getTrimmedParam(url, "tag").toLowerCase();
  const requestedStatus = getTrimmedParam(url, "status").toUpperCase();
  const where = admin ? {} : { status: "ACTIVE" };

  if (admin && ["DRAFT", "ACTIVE", "ARCHIVED"].includes(requestedStatus)) {
    where.status = requestedStatus;
  }
  if (tag) {
    where.tags = { has: tag };
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { handle: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: CATALOG_PRODUCT_INCLUDE,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return jsonResponse({ products: products.map(serializeCatalogProduct), total, page, pageSize });
}

async function handleCatalogProductByHandle(handle) {
  const product = await prisma.product.findFirst({
    where: { handle, status: "ACTIVE" },
    include: CATALOG_PRODUCT_INCLUDE,
  });
  return product ? jsonResponse({ product: serializeCatalogProduct(product) }) : jsonResponse({ error: "Not found" }, 404);
}

async function handleCreateCatalogProduct(request) {
  if (!(await isModeratorAuthorized(request))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const input = normalizeCatalogProduct(await readJson(request));
    const product = await prisma.product.create({
      data: {
        title: input.title,
        handle: input.handle,
        description: input.description,
        status: input.status,
        tags: input.tags,
        variants: { create: input.variants.map((variant) => ({
          title: variant.title,
          sku: variant.sku,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          inventoryQuantity: variant.inventoryQuantity,
          position: variant.position,
        })) },
        images: { create: input.images.map((image) => ({
          url: image.url,
          altText: image.altText,
          position: image.position,
        })) },
      },
      include: CATALOG_PRODUCT_INCLUDE,
    });
    await appendAudit("catalog.product.created", { productId: product.id, handle: product.handle }, "catalog-admin");
    return jsonResponse({ product: serializeCatalogProduct(product) }, 201);
  } catch (error) {
    if (error?.code === "P2002") {
      return jsonResponse({ error: "Handle or SKU already exists" }, 409);
    }
    if (error instanceof Error && error.message.startsWith("Invalid") || error?.message?.startsWith("A product")) {
      return jsonResponse({ error: error.message }, 400);
    }
    throw error;
  }
}

async function handleUpdateCatalogProduct(request, productId) {
  if (!(await isModeratorAuthorized(request))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const input = normalizeCatalogProduct(await readJson(request));
    const product = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.product.findUnique({
        where: { id: productId },
        select: { id: true, variants: { select: { id: true } }, images: { select: { id: true } } },
      });
      if (!existing) {
        return null;
      }
      const variantIds = new Set(existing.variants.map((variant) => variant.id));
      const imageIds = new Set(existing.images.map((image) => image.id));
      if (input.variants.some((variant) => variant.id && !variantIds.has(variant.id))
        || input.images.some((image) => image.id && !imageIds.has(image.id))) {
        throw new Error("Invalid nested product identifier");
      }

      const retainedVariantIds = input.variants.map((variant) => variant.id).filter(Boolean);
      const retainedImageIds = input.images.map((image) => image.id).filter(Boolean);
      await transaction.productVariant.deleteMany({ where: { productId, id: { notIn: retainedVariantIds } } });
      await transaction.productImage.deleteMany({ where: { productId, id: { notIn: retainedImageIds } } });
      for (const variant of input.variants) {
        const { id, ...data } = variant;
        if (id) await transaction.productVariant.update({ where: { id }, data });
        else await transaction.productVariant.create({ data: { ...data, productId } });
      }
      for (const image of input.images) {
        const { id, ...data } = image;
        if (id) await transaction.productImage.update({ where: { id }, data });
        else await transaction.productImage.create({ data: { ...data, productId } });
      }
      await transaction.product.update({
        where: { id: productId },
        data: {
          title: input.title,
          handle: input.handle,
          description: input.description,
          status: input.status,
          tags: input.tags,
        },
      });
      return transaction.product.findUnique({ where: { id: productId }, include: CATALOG_PRODUCT_INCLUDE });
    });
    if (!product) {
      return jsonResponse({ error: "Not found" }, 404);
    }
    await appendAudit("catalog.product.updated", { productId, handle: product.handle }, "catalog-admin");
    return jsonResponse({ product: serializeCatalogProduct(product) });
  } catch (error) {
    if (error?.code === "P2002") {
      return jsonResponse({ error: "Handle or SKU already exists" }, 409);
    }
    if (error instanceof Error && (error.message.startsWith("Invalid") || error.message.startsWith("A product"))) {
      return jsonResponse({ error: error.message }, 400);
    }
    throw error;
  }
}

async function handleDeleteCatalogProduct(request, productId) {
  if (!(await isModeratorAuthorized(request))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const deleted = await prisma.product.deleteMany({ where: { id: productId } });
  if (!deleted.count) {
    return jsonResponse({ error: "Not found" }, 404);
  }
  await appendAudit("catalog.product.deleted", { productId }, "catalog-admin");
  return jsonResponse({ ok: true });
}

async function handleCatalogImageUpload(request) {
  if (!(await isModeratorAuthorized(request))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const payload = await readJson(request);
  const fileName = String(payload.fileName || "").trim();
  const contentType = String(payload.contentType || "").trim().toLowerCase();
  const allowedTypes = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/avif", "avif"],
  ]);
  if (!fileName || fileName.length > 180 || !allowedTypes.has(contentType)) {
    return jsonResponse({ error: "Unsupported image" }, 400);
  }

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = String(process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return jsonResponse({ error: "Image storage is not configured" }, 503);
  }

  const extension = allowedTypes.get(contentType);
  const readableName = catalogHandle(fileName.replace(/\.[^.]+$/, "")) || "product";
  const key = `products/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${readableName}.${extension}`;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), {
    expiresIn: 300,
  });

  return jsonResponse({ uploadUrl, publicUrl: `${publicUrl}/${key}` });
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

async function handleAdminPaymentWebhooks(request) {
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
      { provider: { contains: search, mode: "insensitive" } },
      { orderId: { contains: search, mode: "insensitive" } },
      { errorMessage: { contains: search, mode: "insensitive" } },
    ];
  }

  const [total, events] = await Promise.all([
    prisma.paymentWebhookEvent.count({ where }),
    prisma.paymentWebhookEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return jsonResponse({ events, total, page, pageSize });
}

async function handleReplayPaymentWebhook(request) {
  if (!(await isModeratorAuthorized(request))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const payload = await readJson(request);
  const eventId = String(payload.eventId || "").trim();
  const actor = String(payload.actor || "moderator");

  if (!eventId) {
    return jsonResponse({ error: "eventId is required" }, 400);
  }

  const event = await prisma.paymentWebhookEvent.findUnique({ where: { id: eventId } });
  if (!event) {
    return jsonResponse({ error: "Webhook event not found" }, 404);
  }

  const typedPayload = event.payload;
  await processOrderEvent({
    topic: event.topic,
    provider: event.provider,
    payload: typedPayload,
  }, { replay: true });

  await prisma.paymentWebhookEvent.update({
    where: { id: event.id },
    data: {
      replayedAt: new Date(),
    },
  });

  await appendAudit("order.webhook.replayed", { eventId: event.id, topic: event.topic }, actor);
  return jsonResponse({ ok: true });
}

async function handlePaymentWebhook(request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const signature = request.headers.get("x-slowfit-signature") || "";
  const topic = request.headers.get("x-payment-topic") || "unknown";
  const provider = request.headers.get("x-payment-provider") || "unknown";
  const rawBody = await request.text();

  if (!secret || !signature || !verifyPaymentHmac(rawBody, signature, secret)) {
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
    createdEvent = await prisma.paymentWebhookEvent.create({
      data: {
        idempotencyKey,
        topic,
        provider,
        orderId: payload.reference ? String(payload.reference) : null,
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
    await processOrderEvent({ topic, provider, payload });
    await appendAudit("payment.webhook.processed", { topic, orderId: payload.reference, idempotencyKey }, "payment-webhook");
    return jsonResponse({ ok: true });
  } catch (error) {
    await prisma.paymentWebhookEvent.update({
      where: { id: createdEvent.id },
      data: {
        status: "FAILED",
        errorMessage: String(error?.message || "unknown_error"),
      },
    });

    await appendAudit(
      "payment.webhook.failed",
      { topic, orderId: payload.reference, idempotencyKey, error: String(error?.message || "unknown_error") },
      "payment-webhook",
    );
    return jsonResponse({ error: "Webhook processing failed" }, 500);
  }
}

export async function route(request) {
  const url = parseUrl(request);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !isTrustedBrowserMutation(request)) {
    return jsonResponse({ error: "Forbidden origin" }, 403);
  }

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

  if (pathname === "/api/auth/password/forgot" && method === "POST") {
    return handlePasswordResetRequest(request);
  }

  if (pathname === "/api/auth/password/reset" && method === "POST") {
    return handlePasswordReset(request);
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

  if (pathname === "/api/catalog/products" && method === "GET") {
    return handleCatalogProducts(request);
  }

  const publicProductMatch = pathname.match(/^\/api\/catalog\/products\/([^/]+)$/);
  if (publicProductMatch && method === "GET") {
    return handleCatalogProductByHandle(decodeURIComponent(publicProductMatch[1]));
  }

  if (pathname === "/api/admin/catalog/products" && method === "GET") {
    return handleCatalogProducts(request, true);
  }

  if (pathname === "/api/admin/catalog/products" && method === "POST") {
    return handleCreateCatalogProduct(request);
  }

  if (pathname === "/api/admin/catalog/images/presign" && method === "POST") {
    return handleCatalogImageUpload(request);
  }

  const adminProductMatch = pathname.match(/^\/api\/admin\/catalog\/products\/([^/]+)$/);
  if (adminProductMatch && method === "PUT") {
    return handleUpdateCatalogProduct(request, decodeURIComponent(adminProductMatch[1]));
  }

  if (adminProductMatch && method === "DELETE") {
    return handleDeleteCatalogProduct(request, decodeURIComponent(adminProductMatch[1]));
  }

  if (pathname === "/api/admin/audit-logs" && method === "GET") {
    return handleAdminAuditLogs(request);
  }

  if (pathname === "/api/admin/webhooks/payments" && method === "GET") {
    return handleAdminPaymentWebhooks(request);
  }

  if (pathname === "/api/admin/webhooks/payments/replay" && method === "POST") {
    return handleReplayPaymentWebhook(request);
  }

  if (pathname === "/api/webhooks/payments" && method === "POST") {
    return handlePaymentWebhook(request);
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
  validateProductionConfiguration();
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
