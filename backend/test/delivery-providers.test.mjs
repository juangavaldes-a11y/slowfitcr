import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";
import {
  configuredDeliveryProviders,
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