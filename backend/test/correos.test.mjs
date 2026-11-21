import assert from "node:assert/strict";
import test from "node:test";
import { createCorreosHandlers, gatewayConfigured, parseGuideInput, parseTrackingNumber, requestRemoteGuide } from "../correos.mjs";

const json = (body, status = 200) => ({ body, status });
const recipient = { name: "Ana Mora", phone: "8888 1234", streetAddress: "200 m norte de la iglesia", city: "Escazú", state: "San José", district: "San Rafael" };
const validBody = { reference: "POS-20261120-ABC123", recipient, weightKg: 0.8, pieces: 1, declaredValueCrc: 19950 };

test("parseGuideInput normalizes the recipient and validates the parcel", () => {
  const guide = parseGuideInput(validBody);
  assert.equal(guide.recipient.phone, "+50688881234");
  assert.equal(guide.recipient.address.country, "CR");
  assert.equal(guide.pieces, 1);
  assert.equal(guide.contents, "Ropa deportiva");
  assert.throws(() => parseGuideInput({ ...validBody, reference: "" }), /INVALID_GUIDE_REFERENCE/);
  assert.throws(() => parseGuideInput({ ...validBody, weightKg: 0 }), /INVALID_GUIDE_WEIGHT/);
  assert.throws(() => parseGuideInput({ ...validBody, weightKg: 31 }), /INVALID_GUIDE_WEIGHT/);
  assert.throws(() => parseGuideInput({ ...validBody, recipient: { ...recipient, phone: "12" } }), /INVALID_DELIVERY_PHONE/);
  assert.throws(() => parseGuideInput({ ...validBody, recipient: { ...recipient, city: "" } }), /INVALID_DELIVERY_CITY/);
});

test("parseTrackingNumber accepts Correos-style codes and rejects junk", () => {
  assert.equal(parseTrackingNumber(" ee123456789cr "), "EE123456789CR");
  assert.throws(() => parseTrackingNumber("a b"), /INVALID_TRACKING_NUMBER/);
  assert.throws(() => parseTrackingNumber(""), /INVALID_TRACKING_NUMBER/);
});

test("gatewayConfigured needs both URL and token", () => {
  assert.equal(gatewayConfigured({}), false);
  assert.equal(gatewayConfigured({ CCR_GUIDE_GATEWAY_URL: "https://g" }), false);
  assert.equal(gatewayConfigured({ CCR_GUIDE_GATEWAY_URL: "https://g", CCR_GUIDE_GATEWAY_TOKEN: "t" }), true);
});

test("requestRemoteGuide sends the guide with a bearer token and reads the tracking number", async () => {
  let call;
  const fetchImpl = async (url, init) => {
    call = { url, init };
    return { ok: true, status: 200, json: async () => ({ trackingNumber: "ee1234567cr", labelUrl: "https://label" }) };
  };
  const env = { CCR_GUIDE_GATEWAY_URL: "https://gateway.test/", CCR_GUIDE_GATEWAY_TOKEN: "secret" };
  const result = await requestRemoteGuide(parseGuideInput(validBody), {}, { env, fetchImpl });
  assert.equal(call.url, "https://gateway.test/guides");
  assert.equal(call.init.headers.Authorization, "Bearer secret");
  assert.equal(JSON.parse(call.init.body).parcel.weightKg, 0.8);
  assert.deepEqual(result, { trackingNumber: "EE1234567CR", labelUrl: "https://label" });
  await assert.rejects(requestRemoteGuide(parseGuideInput(validBody), {}, { env, fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({ error: "down" }) }) }), /down/);
});

function fakePrisma() {
  const rows = [];
  return {
    rows,
    delivery: {
      create: async ({ data }) => { const row = { id: `d${rows.length + 1}`, createdAt: new Date(), ...data }; rows.push(row); return row; },
      findUnique: async ({ where }) => rows.find((row) => row.id === where.id) ?? null,
      update: async ({ where, data }) => Object.assign(rows.find((row) => row.id === where.id), data),
    },
  };
}

function handlersFor(prisma, { authorized = true, env = {}, fetchImpl } = {}) {
  const audits = [];
  const handlers = createCorreosHandlers({ prisma, jsonResponse: json, readJson: async (request) => request.body, isAuthorized: async () => authorized, appendAudit: async (...args) => { audits.push(args); }, env, fetchImpl });
  return { handlers, audits };
}

test("guide endpoints require admin authorization", async () => {
  const { handlers } = handlersFor(fakePrisma(), { authorized: false });
  assert.equal((await handlers.createGuide({ body: validBody })).status, 401);
  assert.equal((await handlers.setTracking({ body: {} }, "d1")).status, 401);
  assert.equal((await handlers.getGuide({}, "d1")).status, 401);
});

test("without a gateway the guide is stored ready to dispatch and tracking is entered by hand", async () => {
  const prisma = fakePrisma();
  const { handlers, audits } = handlersFor(prisma);
  const created = await handlers.createGuide({ body: validBody });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "READY_TO_DISPATCH");
  assert.equal(created.body.trackingNumber, null);
  assert.equal(created.body.gatewayConfigured, false);
  assert.equal(prisma.rows[0].provider, "CORREOS_CR");
  assert.equal(prisma.rows[0].paymentReference, "POS-20261120-ABC123");
  assert.equal(audits[0][0], "pos.shipment.created");

  const bad = await handlers.setTracking({ body: { trackingNumber: "x" } }, "d1");
  assert.equal(bad.status, 400);
  const tracked = await handlers.setTracking({ body: { trackingNumber: "ee9876543cr" } }, "d1");
  assert.equal(tracked.status, 200);
  assert.equal(tracked.body.status, "ACTIVE");
  assert.equal(tracked.body.trackingNumber, "EE9876543CR");
  assert.equal((await handlers.getGuide({}, "d1")).body.trackingNumber, "EE9876543CR");
});

test("with a gateway the guide is created remotely and becomes active with its tracking number", async () => {
  const prisma = fakePrisma();
  const env = { CCR_GUIDE_GATEWAY_URL: "https://gateway.test", CCR_GUIDE_GATEWAY_TOKEN: "t" };
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ trackingNumber: "EE111222333CR" }) });
  const { handlers } = handlersFor(prisma, { env, fetchImpl });
  const created = await handlers.createGuide({ body: validBody });
  assert.equal(created.body.status, "ACTIVE");
  assert.equal(created.body.trackingNumber, "EE111222333CR");
  assert.equal(created.body.gatewayConfigured, true);
});

test("a failing gateway keeps the guide for manual completion and records the error", async () => {
  const prisma = fakePrisma();
  const env = { CCR_GUIDE_GATEWAY_URL: "https://gateway.test", CCR_GUIDE_GATEWAY_TOKEN: "t" };
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({ message: "temporarily unavailable" }) });
  const { handlers } = handlersFor(prisma, { env, fetchImpl });
  const created = await handlers.createGuide({ body: validBody });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "READY_TO_DISPATCH");
  assert.match(created.body.errorMessage, /unavailable/);
});

test("setTracking rejects unknown guides, other providers and closed guides", async () => {
  const prisma = fakePrisma();
  const { handlers } = handlersFor(prisma);
  assert.equal((await handlers.setTracking({ body: { trackingNumber: "EE1234567CR" } }, "nope")).status, 404);
  prisma.rows.push({ id: "uber1", provider: "UBER_DIRECT", status: "ACTIVE" });
  assert.equal((await handlers.setTracking({ body: { trackingNumber: "EE1234567CR" } }, "uber1")).status, 404);
  prisma.rows.push({ id: "done1", provider: "CORREOS_CR", status: "COMPLETED" });
  assert.equal((await handlers.setTracking({ body: { trackingNumber: "EE1234567CR" } }, "done1")).status, 400);
});
