import { createHmac, timingSafeEqual } from "node:crypto";

const UBER_API_ORIGIN = "https://api.uber.com";
const UBER_AUTH_URL = "https://auth.uber.com/oauth/v2/token";
const DEFAULT_COUNTRY = "CR";
let uberTokenCache = null;

function requiredString(value, field, maxLength = 200) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`INVALID_DELIVERY_${field.toUpperCase()}`);
  }
  return normalized;
}

function optionalCoordinate(value, field) {
  if (value === undefined || value === null || value === "") return undefined;
  const coordinate = Number(value);
  const valid = Number.isFinite(coordinate)
    && (field === "latitude" ? coordinate >= -90 && coordinate <= 90 : coordinate >= -180 && coordinate <= 180);
  if (!valid) throw new Error(`INVALID_DELIVERY_${field.toUpperCase()}`);
  return coordinate;
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const international = digits.length === 8 ? `506${digits}` : digits;
  if (international.length < 10 || international.length > 15) {
    throw new Error("INVALID_DELIVERY_PHONE");
  }
  return `+${international}`;
}

export function normalizeDeliveryDestination(payload) {
  const country = String(payload?.country || DEFAULT_COUNTRY).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("INVALID_DELIVERY_COUNTRY");

  return {
    name: requiredString(payload?.name, "name", 100),
    phone: normalizePhone(payload?.phone),
    address: {
      streetAddress: [
        requiredString(payload?.streetAddress, "address", 200),
        String(payload?.addressLine2 || "").trim().slice(0, 120),
      ].filter(Boolean),
      city: requiredString(payload?.city, "city", 100),
      state: requiredString(payload?.state, "state", 100),
      postalCode: String(payload?.postalCode || "").trim().slice(0, 20),
      country,
      latitude: optionalCoordinate(payload?.latitude, "latitude"),
      longitude: optionalCoordinate(payload?.longitude, "longitude"),
    },
    notes: String(payload?.notes || "").trim().slice(0, 500),
  };
}

export function configuredPickup() {
  return normalizeDeliveryDestination({
    name: process.env.DELIVERY_PICKUP_NAME,
    phone: process.env.DELIVERY_PICKUP_PHONE,
    streetAddress: process.env.DELIVERY_PICKUP_ADDRESS,
    addressLine2: process.env.DELIVERY_PICKUP_ADDRESS_2,
    city: process.env.DELIVERY_PICKUP_CITY,
    state: process.env.DELIVERY_PICKUP_STATE,
    postalCode: process.env.DELIVERY_PICKUP_POSTAL_CODE,
    country: process.env.DELIVERY_PICKUP_COUNTRY || DEFAULT_COUNTRY,
    latitude: process.env.DELIVERY_PICKUP_LATITUDE,
    longitude: process.env.DELIVERY_PICKUP_LONGITUDE,
    notes: process.env.DELIVERY_PICKUP_NOTES,
  });
}

function providerAddress(location) {
  return JSON.stringify({
    street_address: location.address.streetAddress,
    city: location.address.city,
    state: location.address.state,
    zip_code: location.address.postalCode,
    country: location.address.country,
  });
}

async function responseJson(response, provider) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`${provider.toUpperCase()}_DELIVERY_ERROR`);
    error.status = response.status;
    error.providerPayload = payload;
    throw error;
  }
  return payload;
}

async function uberAccessToken() {
  if (uberTokenCache && uberTokenCache.expiresAt > Date.now() + 60_000) return uberTokenCache.value;
  const clientId = requiredString(process.env.UBER_DIRECT_CLIENT_ID, "uber_client_id");
  const clientSecret = requiredString(process.env.UBER_DIRECT_CLIENT_SECRET, "uber_client_secret");
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "eats.deliveries",
  });
  const response = await fetch(UBER_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await responseJson(response, "uber");
  const value = requiredString(payload.access_token, "uber_access_token", 4096);
  uberTokenCache = { value, expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000 };
  return value;
}

function locationFields(prefix, location) {
  return {
    [`${prefix}_address`]: providerAddress(location),
    ...(location.address.latitude === undefined ? {} : { [`${prefix}_latitude`]: location.address.latitude }),
    ...(location.address.longitude === undefined ? {} : { [`${prefix}_longitude`]: location.address.longitude }),
  };
}

async function uberRequest(path, body) {
  const response = await fetch(`${UBER_API_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await uberAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return responseJson(response, "uber");
}

async function cancelUber(delivery) {
  const customerId = requiredString(process.env.UBER_DIRECT_CUSTOMER_ID, "uber_customer_id");
  return uberRequest(
    `/v1/customers/${encodeURIComponent(customerId)}/deliveries/${encodeURIComponent(delivery.externalDeliveryId)}/cancel`,
    {},
  );
}

async function quoteUber({ pickup, dropoff }) {
  const customerId = requiredString(process.env.UBER_DIRECT_CUSTOMER_ID, "uber_customer_id");
  const quote = await uberRequest(`/v1/customers/${encodeURIComponent(customerId)}/delivery_quotes`, {
    ...locationFields("pickup", pickup),
    ...locationFields("dropoff", dropoff),
  });
  return {
    provider: "uber",
    externalQuoteId: requiredString(quote.id, "uber_quote_id"),
    feeMinor: Number(quote.fee),
    currency: String(quote.currency_type || quote.currency || "CRC").toUpperCase(),
    expiresAt: quote.expires,
    dropoffEta: quote.dropoff_eta || null,
    raw: quote,
  };
}

async function dispatchUber(delivery) {
  const customerId = requiredString(process.env.UBER_DIRECT_CUSTOMER_ID, "uber_customer_id");
  const pickup = delivery.pickup;
  const dropoff = { ...delivery.dropoff, ...delivery.contact };
  const result = await uberRequest(`/v1/customers/${encodeURIComponent(customerId)}/deliveries`, {
    quote_id: delivery.externalQuoteId,
    ...locationFields("pickup", pickup),
    pickup_name: pickup.name,
    pickup_phone_number: pickup.phone,
    pickup_notes: String(pickup.notes || "").slice(0, 280),
    ...locationFields("dropoff", dropoff),
    dropoff_name: dropoff.name,
    dropoff_phone_number: dropoff.phone,
    dropoff_notes: String(dropoff.notes || "").slice(0, 280),
    manifest_items: delivery.manifest,
    external_id: delivery.paymentReference,
    idempotency_key: delivery.id,
  });
  return {
    externalDeliveryId: requiredString(result.id, "uber_delivery_id"),
    status: String(result.status || "pending"),
    trackingUrl: result.tracking_url || null,
    dropoffEta: result.dropoff_eta || null,
    raw: result,
  };
}

async function didiGatewayRequest(path, body) {
  const origin = requiredString(process.env.DIDI_DELIVERY_GATEWAY_URL, "didi_gateway_url");
  const token = requiredString(process.env.DIDI_DELIVERY_GATEWAY_TOKEN, "didi_gateway_token", 4096);
  const response = await fetch(new URL(path, origin), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return responseJson(response, "didi");
}

async function quoteDidi(context) {
  const quote = await didiGatewayRequest("quotes", context);
  return {
    provider: "didi",
    externalQuoteId: requiredString(quote.id, "didi_quote_id"),
    feeMinor: Number(quote.feeMinor),
    currency: String(quote.currency || "CRC").toUpperCase(),
    expiresAt: quote.expiresAt,
    dropoffEta: quote.dropoffEta || null,
    raw: quote,
  };
}

async function dispatchDidi(delivery) {
  const result = await didiGatewayRequest("deliveries", delivery);
  return {
    externalDeliveryId: requiredString(result.id, "didi_delivery_id"),
    status: String(result.status || "pending"),
    trackingUrl: result.trackingUrl || null,
    dropoffEta: result.dropoffEta || null,
    raw: result,
  };
}

async function cancelDidi(delivery) {
  return didiGatewayRequest(`deliveries/${encodeURIComponent(delivery.externalDeliveryId)}/cancel`, {});
}

export function configuredDeliveryProviders() {
  return [
    ...(process.env.UBER_DIRECT_CLIENT_ID && process.env.UBER_DIRECT_CLIENT_SECRET && process.env.UBER_DIRECT_CUSTOMER_ID
      ? [{ id: "uber", label: "Uber Direct" }] : []),
    ...(process.env.DIDI_DELIVERY_GATEWAY_URL && process.env.DIDI_DELIVERY_GATEWAY_TOKEN
      ? [{ id: "didi", label: "DiDi" }] : []),
  ];
}

export async function quoteProvider(provider, context) {
  if (provider === "uber") return quoteUber(context);
  if (provider === "didi") return quoteDidi(context);
  throw new Error("DELIVERY_PROVIDER_NOT_CONFIGURED");
}

export async function dispatchProvider(delivery) {
  if (delivery.provider === "uber") return dispatchUber(delivery);
  if (delivery.provider === "didi") return dispatchDidi(delivery);
  throw new Error("DELIVERY_PROVIDER_NOT_CONFIGURED");
}

export async function cancelProvider(delivery) {
  if (!delivery.externalDeliveryId) throw new Error("DELIVERY_NOT_DISPATCHED");
  if (delivery.provider === "uber") return cancelUber(delivery);
  if (delivery.provider === "didi") return cancelDidi(delivery);
  throw new Error("DELIVERY_PROVIDER_NOT_CONFIGURED");
}

export function verifyProviderWebhook(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expected = Buffer.from(digest);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}