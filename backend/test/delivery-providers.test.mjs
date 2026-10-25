import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";
import {
  cancelProvider,
  configuredDeliveryProviders,
  configuredPickup,
  dispatchProvider,
  normalizeDeliveryDestination,
  quoteProvider,
  verifyProviderWebhook,
} from "../delivery-providers.mjs";

const ORIGINAL_FETCH = globalThis.fetch;
const ENV_NAMES = [
  "UBER_DIRECT_CLIENT_ID",
  "UBER_DIRECT_CLIENT_SECRET",
  "UBER_DIRECT_CUSTOMER_ID",
  "DIDI_DELIVERY_GATEWAY_URL",
  "DIDI_DELIVERY_GATEWAY_TOKEN",
];

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  ENV_NAMES.forEach((name) => delete process.env[name]);
});

test("normalizes Costa Rica delivery details and rejects invalid phones", () => {
  const destination = normalizeDeliveryDestination({
    name: "Ana Cliente",
    phone: "8891-9417",
    streetAddress: "Santa Lucia, 200 m sur",
    city: "Barva",
    state: "Heredia",
  });

  assert.equal(destination.phone, "+50688919417");
  assert.equal(destination.address.country, "CR");
  assert.throws(() => normalizeDeliveryDestination({
    name: "Ana",
    phone: "123",
    streetAddress: "Address",
    city: "Barva",
    state: "Heredia",
  }), /INVALID_DELIVERY_PHONE/);
});

test("maps Uber Direct OAuth, quote, and dispatch requests", async () => {
  process.env.UBER_DIRECT_CLIENT_ID = "uber-client";
  process.env.UBER_DIRECT_CLIENT_SECRET = "uber-secret";
  process.env.UBER_DIRECT_CUSTOMER_ID = "uber-customer";
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).includes("oauth/v2/token")) {
      return Response.json({ access_token: "access-token", expires_in: 3600 });
    }
    if (String(url).endsWith("delivery_quotes")) {
      return Response.json({
        id: "dqt_123",
        fee: 125000,
        currency_type: "CRC",
        expires: "2026-09-01T12:15:00.000Z",
        dropoff_eta: "2026-09-01T13:00:00.000Z",
      });
    }
    return Response.json({
      id: "del_123",
      status: "pending",
      tracking_url: "https://tracking.example/del_123",
      dropoff_eta: "2026-09-01T13:00:00.000Z",
    });
  };

  const pickup = normalizeDeliveryDestination({
    name: "Slow Fit",
    phone: "88919417",
    streetAddress: "Jardines del Dr. Naranjo, 200 m sur y 10 m este",
    city: "Barva",
    state: "Heredia",
  });
  const dropoff = normalizeDeliveryDestination({
    name: "Ana Cliente",
    phone: "88888888",
    streetAddress: "Centro",
    city: "Heredia",
    state: "Heredia",
  });
  const quote = await quoteProvider("uber", { pickup, dropoff, manifest: [{ name: "Top", quantity: 1 }] });
  const delivery = await dispatchProvider({
    provider: "uber",
    externalQuoteId: quote.externalQuoteId,
    paymentReference: "payment-1",
    pickup,
    dropoff: { address: dropoff.address, notes: dropoff.notes },
    contact: { name: dropoff.name, phone: dropoff.phone },
    manifest: [{ name: "Top", quantity: 1 }],
  });

  assert.deepEqual(configuredDeliveryProviders(), [{ id: "uber", label: "Uber Direct" }]);
  assert.equal(quote.feeMinor, 125000);
  assert.equal(delivery.externalDeliveryId, "del_123");
  assert.equal(requests.length, 3);
  const quotePayload = JSON.parse(requests[1].init.body);
  assert.match(quotePayload.pickup_address, /Barva/);
  const deliveryPayload = JSON.parse(requests[2].init.body);
  assert.equal(deliveryPayload.quote_id, "dqt_123");
  assert.equal(deliveryPayload.external_id, "payment-1");
});

test("maps the configurable DiDi gateway contract", async () => {
  process.env.DIDI_DELIVERY_GATEWAY_URL = "https://didi-gateway.example/api/";
  process.env.DIDI_DELIVERY_GATEWAY_TOKEN = "gateway-token";
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = String(url);
    return Response.json({
      id: "didi-quote-1",
      feeMinor: 99000,
      currency: "CRC",
      expiresAt: "2026-09-01T12:15:00.000Z",
    });
  };

  const quote = await quoteProvider("didi", { pickup: {}, dropoff: {}, manifest: [] });
  assert.equal(requestUrl, "https://didi-gateway.example/api/quotes");
  assert.equal(quote.provider, "didi");
  assert.equal(quote.feeMinor, 99000);
});

test("verifies provider webhook HMAC signatures without timing leaks", () => {
  const body = JSON.stringify({ delivery_id: "del_123", status: "delivered" });
  const secret = "webhook-secret";
  const signature = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  assert.equal(verifyProviderWebhook(body, signature, secret), true);
  assert.equal(verifyProviderWebhook(`${body} `, signature, secret), false);
  assert.equal(verifyProviderWebhook(body, "invalid", secret), false);
});
const validDestination = { name: "Ana", phone: "88888888", streetAddress: "Centro", city: "Heredia", state: "Heredia" };

test("validates destination fields, coordinates and country", () => {
  assert.throws(() => normalizeDeliveryDestination({ ...validDestination, name: "" }), /INVALID_DELIVERY_NAME/);
  assert.throws(() => normalizeDeliveryDestination({ ...validDestination, country: "CRI" }), /INVALID_DELIVERY_COUNTRY/);
  assert.throws(() => normalizeDeliveryDestination({ ...validDestination, latitude: 120 }), /INVALID_DELIVERY_LATITUDE/);
  assert.throws(() => normalizeDeliveryDestination({ ...validDestination, longitude: "abc" }), /INVALID_DELIVERY_LONGITUDE/);
  const ok = normalizeDeliveryDestination({ ...validDestination, latitude: "9.99", longitude: -84.1, addressLine2: "Casa 2", country: "cr" });
  assert.equal(ok.address.latitude, 9.99);
  assert.deepEqual(ok.address.streetAddress, ["Centro", "Casa 2"]);
  assert.equal(ok.address.country, "CR");
});

test("keeps the district separate from the street address", () => {
  const withDistrict = normalizeDeliveryDestination({ ...validDestination, district: " San Pedro ", postalCode: "10301" });
  assert.equal(withDistrict.address.district, "San Pedro");
  assert.equal(withDistrict.address.postalCode, "10301");
  assert.equal(normalizeDeliveryDestination(validDestination).address.district, "");
});

test("builds the configured pickup from the environment", () => {
  const keys = ["NAME", "PHONE", "ADDRESS", "CITY", "STATE"];
  keys.forEach((key) => { process.env[`DELIVERY_PICKUP_${key}`] = { NAME: "Slow Fit", PHONE: "88919417", ADDRESS: "Barva", CITY: "Barva", STATE: "Heredia" }[key]; });
  try {
    const pickup = configuredPickup();
    assert.equal(pickup.name, "Slow Fit");
    assert.equal(pickup.phone, "+50688919417");
  } finally {
    keys.forEach((key) => delete process.env[`DELIVERY_PICKUP_${key}`]);
  }
});

test("Uber requests surface provider errors and support cancel", async () => {
  process.env.UBER_DIRECT_CLIENT_ID = "c";
  process.env.UBER_DIRECT_CLIENT_SECRET = "s";
  process.env.UBER_DIRECT_CUSTOMER_ID = "cust";
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes("oauth/v2/token")) return Response.json({ access_token: "t", expires_in: 3600 });
    if (String(url).endsWith("/cancel")) return Response.json({ status: "canceled" });
    return Response.json({ message: "bad" }, { status: 422 });
  };
  await assert.rejects(quoteProvider("uber", { pickup: normalizeDeliveryDestination(validDestination), dropoff: normalizeDeliveryDestination(validDestination) }),
    (error) => error.message === "UBER_DELIVERY_ERROR" && error.status === 422 && error.providerPayload.message === "bad");
  const cancelled = await cancelProvider({ provider: "uber", externalDeliveryId: "del 1" });
  assert.equal(cancelled.status, "canceled");
  assert.ok(urls.some((url) => url.endsWith("/deliveries/del%201/cancel")));
});

test("DiDi gateway dispatch, cancel and configuration errors", async () => {
  await assert.rejects(quoteProvider("didi", {}), /INVALID_DELIVERY_DIDI_GATEWAY_URL/);
  process.env.DIDI_DELIVERY_GATEWAY_URL = "https://didi-gateway.example/api/";
  process.env.DIDI_DELIVERY_GATEWAY_TOKEN = "tok";
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return String(url).endsWith("/cancel") ? Response.json({ ok: true }) : Response.json({ id: "d1", status: "assigned", trackingUrl: "https://t.example/d1" });
  };
  const delivery = await dispatchProvider({ provider: "didi", id: "x" });
  assert.equal(delivery.externalDeliveryId, "d1");
  assert.equal(delivery.trackingUrl, "https://t.example/d1");
  await cancelProvider({ provider: "didi", externalDeliveryId: "d/1" });
  assert.ok(urls.at(-1).endsWith("deliveries/d%2F1/cancel"));
  assert.deepEqual(configuredDeliveryProviders(), [{ id: "didi", label: "DiDi" }]);
  globalThis.fetch = async () => new Response("nope", { status: 500 });
  await assert.rejects(dispatchProvider({ provider: "didi" }), /DIDI_DELIVERY_ERROR/);
});

test("unknown providers and undispatched cancels are rejected", async () => {
  await assert.rejects(quoteProvider("x", {}), /DELIVERY_PROVIDER_NOT_CONFIGURED/);
  await assert.rejects(dispatchProvider({ provider: "x" }), /DELIVERY_PROVIDER_NOT_CONFIGURED/);
  await assert.rejects(cancelProvider({ provider: "uber" }), /DELIVERY_NOT_DISPATCHED/);
  await assert.rejects(cancelProvider({ provider: "x", externalDeliveryId: "1" }), /DELIVERY_PROVIDER_NOT_CONFIGURED/);
  assert.equal(verifyProviderWebhook("b", "", "s"), false);
});
