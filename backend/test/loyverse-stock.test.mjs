import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { createLoyverseStockHandler, verifyLoyverseSyncSignature } from "../loyverse-stock.mjs";

const secret = "loyverse-sync-secret-for-tests-only";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function createFakePrisma(variants) {
  const ledger = new Map();
  const productTotals = new Map();
  const transaction = {
    productVariant: {
      findUnique: async ({ where }) => variants.find((variant) => variant.sku === where.sku) ?? null,
      update: async ({ where, data }) => { variants.find((variant) => variant.id === where.id).inventoryQuantity = data.inventoryQuantity; },
    },
    product: {
      update: async ({ where, data }) => {
        productTotals.set(where.id, (productTotals.get(where.id) ?? 0) - data.inventoryTotal.decrement);
      },
    },
    loyverseStockLedger: {
      findUnique: async ({ where }) => ledger.get(where.key) ?? null,
      upsert: async ({ where, create, update }) => { ledger.set(where.key, { ...(ledger.get(where.key) ?? create), ...update }); },
    },
  };
  let conflicts = 0;
  return {
    ledger,
    productTotals,
    failNextWithConflicts(count) { conflicts = count; },
    $transaction: async (callback) => {
      if (conflicts > 0) {
        conflicts -= 1;
        throw Object.assign(new Error("conflict"), { code: "P2034" });
      }
      return callback(transaction);
    },
  };
}

function signedRequest(body, overrides = {}) {
  const timestamp = overrides.timestamp ?? String(Date.now());
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://integration.test/api/webhooks/loyverse-stock", {
    method: "POST",
    headers: {
      "x-slowfit-timestamp": timestamp,
      "x-slowfit-signature": overrides.signature ?? createHmac("sha256", secret).update(`${timestamp}.${text}`).digest("base64"),
    },
    body: text,
  });
}

function setup(variants = [{ id: "v1", productId: "p1", sku: "SKU-1", inventoryQuantity: 5 }]) {
  const prisma = createFakePrisma(variants);
  const { handleLoyverseStockWebhook } = createLoyverseStockHandler({ prisma, jsonResponse, getSecret: () => secret });
  return { prisma, variants, handle: handleLoyverseStockWebhook };
}

const receipt = (quantity, extra = {}) => ({ receipts: [{ receiptNumber: "1-1", lines: [{ lineId: "a", sku: "SKU-1", quantity, ...extra }] }] });

test("Loyverse sales lower website stock once and are idempotent", async () => {
  const { handle, variants, prisma } = setup();
  const first = await handle(signedRequest(receipt(2)));
  assert.deepEqual(await first.json(), { applied: 1, unmatched: [] });
  assert.equal(variants[0].inventoryQuantity, 3);
  assert.equal(prisma.productTotals.get("p1"), -2);

  const repeat = await handle(signedRequest(receipt(2)));
  assert.deepEqual(await repeat.json(), { applied: 0, unmatched: [] });
  assert.equal(variants[0].inventoryQuantity, 3);
});

test("cancelled receipts and refunds restore website stock", async () => {
  const { handle, variants } = setup();
  await handle(signedRequest(receipt(2)));
  await handle(signedRequest(receipt(0)));
  assert.equal(variants[0].inventoryQuantity, 5);
  await handle(signedRequest({ receipts: [{ receiptNumber: "1-2", lines: [{ lineId: "r", sku: "SKU-1", quantity: -1 }] }] }));
  assert.equal(variants[0].inventoryQuantity, 6);
});

test("website stock never drops below zero and unknown SKUs are reported", async () => {
  const { handle, variants } = setup();
  const response = await handle(signedRequest({
    receipts: [{ receiptNumber: "1-1", lines: [{ lineId: "a", sku: "SKU-1", quantity: 9 }, { lineId: "b", sku: "MISSING", quantity: 1 }] }],
  }));
  assert.deepEqual(await response.json(), { applied: 1, unmatched: ["MISSING"] });
  assert.equal(variants[0].inventoryQuantity, 0);
});

test("a zero-change update is recorded without touching stock", async () => {
  const { handle, variants, prisma } = setup([{ id: "v1", productId: "p1", sku: "SKU-1", inventoryQuantity: 0 }]);
  await handle(signedRequest(receipt(3)));
  assert.equal(variants[0].inventoryQuantity, 0);
  assert.equal(prisma.productTotals.size, 0);
  assert.equal(prisma.ledger.get("1-1:a").quantity, 3);
});

test("serialization conflicts are retried and eventually surfaced", async () => {
  const retried = setup();
  retried.prisma.failNextWithConflicts(2);
  assert.equal((await retried.handle(signedRequest(receipt(1)))).status, 200);
  assert.equal(retried.variants[0].inventoryQuantity, 4);

  const exhausted = setup();
  exhausted.prisma.failNextWithConflicts(3);
  await assert.rejects(exhausted.handle(signedRequest(receipt(1))), /conflict/);
});

test("requests with missing, stale, or invalid signatures are rejected", async () => {
  const { handle, variants } = setup();
  const stale = String(Date.now() - 10 * 60_000);
  for (const request of [
    signedRequest(receipt(1), { signature: "invalid" }),
    signedRequest(receipt(1), { timestamp: stale }),
    new Request("http://integration.test/api/webhooks/loyverse-stock", { method: "POST", body: JSON.stringify(receipt(1)) }),
  ]) {
    assert.equal((await handle(request)).status, 401);
  }
  assert.equal(variants[0].inventoryQuantity, 5);
  assert.equal(verifyLoyverseSyncSignature("{}", String(Date.now()), "x", ""), false);
});

test("malformed payloads are rejected after authentication", async () => {
  const { handle } = setup();
  const lines = (line) => ({ receipts: [{ receiptNumber: "1-1", lines: [line] }] });
  const bodies = [
    "not json",
    {},
    { receipts: Array.from({ length: 101 }, () => ({})) },
    { receipts: [{ receiptNumber: "", lines: [] }] },
    { receipts: [{ receiptNumber: "1-1", lines: "nope" }] },
    lines({ lineId: "", sku: "SKU-1", quantity: 1 }),
    lines({ lineId: "a", sku: "", quantity: 1 }),
    lines({ lineId: "a", sku: "SKU-1", quantity: 1.5 }),
    lines({ lineId: "a", sku: "SKU-1", quantity: 10_001 }),
    lines({ lineId: "a", sku: "x".repeat(81), quantity: 1 }),
  ];
  for (const body of bodies) {
    assert.equal((await handle(signedRequest(body))).status, 400);
  }
});
