import assert from "node:assert/strict";
import test from "node:test";
import { createInventoryScanHandlers, parseScanApplyInput } from "../inventory-scan.mjs";

const json = (body, status = 200) => ({ body, status });

test("parseScanApplyInput validates mode, rows and quantities", () => {
  const row = { lineId: "l1", size: "M", quantity: 2 };
  assert.equal(parseScanApplyInput({ mode: "receive", items: [row] }).items[0].quantity, 2);
  assert.throws(() => parseScanApplyInput({ mode: "nope", items: [row] }), /INVALID_MODE/);
  assert.throws(() => parseScanApplyInput({ mode: "count", items: [] }), /MISSING_ITEMS/);
  assert.throws(() => parseScanApplyInput({ mode: "count", items: [{ ...row, size: "XXL" }] }), /INVALID_SIZE/);
  assert.throws(() => parseScanApplyInput({ mode: "count", items: [{ ...row, lineId: "" }] }), /MISSING_LINE/);
  assert.throws(() => parseScanApplyInput({ mode: "count", items: [{ ...row, quantity: -1 }] }), /INVALID_QUANTITY/);
  assert.throws(() => parseScanApplyInput({ mode: "receive", items: [{ ...row, quantity: 0 }] }), /INVALID_QUANTITY/);
  assert.equal(parseScanApplyInput({ mode: "count", items: [{ ...row, quantity: 0 }] }).items[0].quantity, 0);
  assert.throws(() => parseScanApplyInput({ mode: "count", items: Array.from({ length: 201 }, () => row) }), /INVALID_ITEMS/);
});

test("receiving adds repeated rows while counting keeps the last number", () => {
  const rows = [{ lineId: "l1", size: "M", quantity: 2 }, { lineId: "l1", size: "M", quantity: 3 }, { lineId: "l1", size: "S", quantity: 1 }];
  const receive = parseScanApplyInput({ mode: "receive", items: rows });
  assert.deepEqual(receive.items.map((item) => [item.size, item.quantity]), [["M", 5], ["S", 1]]);
  const count = parseScanApplyInput({ mode: "count", items: rows });
  assert.deepEqual(count.items.map((item) => [item.size, item.quantity]), [["M", 3], ["S", 1]]);
});

function fakePrisma({ received = 5, sold = 2, held = 1 } = {}) {
  const variant = { id: "var1", sku: "SLWA17-ROSA-M", color: "Rosa", size: "M", productId: "p1", inventoryQuantity: received - sold - held, product: { title: "Aura", handle: "aura-handle" } };
  const line = { id: "line1", code: "SLWA17", color: "Rosa", productHandle: "aura-handle", sizes: { S: 0, M: received, L: 0, XL: 0, OS: 0 } };
  const sales = sold ? [{ lineId: "line1", size: "M", quantity: sold, restockedQuantity: 0 }] : [];
  const tx = {
    productVariant: {
      findFirst: async ({ where }) => (where.sku?.equals?.toLowerCase() === variant.sku.toLowerCase() || where.color === variant.color ? variant : null),
      update: async ({ data }) => { variant.inventoryQuantity = data.inventoryQuantity; },
      aggregate: async () => ({ _sum: { inventoryQuantity: variant.inventoryQuantity } }),
    },
    product: { update: async () => undefined },
    inventoryLine: {
      findFirst: async () => line,
      findUnique: async ({ where }) => (where.id === line.id ? line : null),
      update: async ({ data }) => { Object.assign(line, data); return line; },
    },
    inventorySale: { findMany: async () => sales },
    layaway: { count: async () => held },
  };
  return { line, variant, prisma: { ...tx, $transaction: async (callback) => callback(tx) } };
}

function handlersFor(fake, { authorized = true } = {}) {
  const audits = [];
  const pushed = [];
  const handlers = createInventoryScanHandlers({
    prisma: fake.prisma, jsonResponse: json, readJson: async (request) => request.body, isAuthorized: async () => authorized,
    appendAudit: async (...args) => { audits.push(args); }, pushInventory: async (changes) => { pushed.push(changes); },
  });
  return { handlers, audits, pushed };
}

test("scan endpoints require admin authorization", async () => {
  const { handlers } = handlersFor(fakePrisma(), { authorized: false });
  assert.equal((await handlers.lookup({ url: "http://x/?code=A" })).status, 401);
  assert.equal((await handlers.apply({ body: {} })).status, 401);
});

test("lookup resolves a scanned SKU to its line and reports received, sold, held and remaining", async () => {
  const { handlers } = handlersFor(fakePrisma({ received: 5, sold: 2, held: 1 }));
  const response = await handlers.lookup({ url: "http://x/api/admin/inventory/scan?code=%20slwa17-rosa-m%0D" });
  assert.equal(response.status, 200);
  assert.deepEqual(
    { lineId: response.body.lineId, size: response.body.size, received: response.body.received, sold: response.body.sold, held: response.body.held, remaining: response.body.remaining },
    { lineId: "line1", size: "M", received: 5, sold: 2, held: 1, remaining: 2 },
  );
});

test("lookup reports missing and unknown codes", async () => {
  const { handlers } = handlersFor(fakePrisma());
  assert.equal((await handlers.lookup({ url: "http://x/api/admin/inventory/scan" })).status, 400);
  assert.equal((await handlers.lookup({ url: "http://x/api/admin/inventory/scan?code=NOPE" })).status, 404);
});

test("receive mode adds units to the received quantity and mirrors them to the storefront", async () => {
  const fake = fakePrisma({ received: 5, sold: 2, held: 1 });
  const { handlers, audits, pushed } = handlersFor(fake);
  const response = await handlers.apply({ body: { mode: "receive", items: [{ lineId: "line1", size: "M", quantity: 4 }] } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.applied[0], { lineId: "line1", code: "SLWA17", color: "Rosa", size: "M", before: 5, after: 9, delta: 4 });
  assert.equal(fake.line.sizes.M, 9);
  assert.equal(fake.variant.inventoryQuantity, 2 + 4);
  assert.equal(pushed[0][0].delta, 4);
  assert.equal(audits[0][0], "inventory.scan.applied");
});

test("count mode sets the remaining stock to the physical count, accounting for sales and layaways", async () => {
  const fake = fakePrisma({ received: 5, sold: 2, held: 1 });
  const { handlers } = handlersFor(fake);
  // System says 2 remain; the shelf has 1 -> received becomes sold + held + counted = 4.
  const down = await handlers.apply({ body: { mode: "count", items: [{ lineId: "line1", size: "M", quantity: 1 }] } });
  assert.equal(down.body.applied[0].after, 4);
  assert.equal(down.body.applied[0].delta, -1);
  assert.equal(fake.variant.inventoryQuantity, 1);
  const zero = await handlers.apply({ body: { mode: "count", items: [{ lineId: "line1", size: "M", quantity: 0 }] } });
  assert.equal(zero.body.applied[0].after, 3);
});

test("apply rejects unknown lines and bad payloads", async () => {
  const { handlers } = handlersFor(fakePrisma());
  assert.equal((await handlers.apply({ body: { mode: "count", items: [{ lineId: "nope", size: "M", quantity: 1 }] } })).status, 404);
  assert.equal((await handlers.apply({ body: { mode: "x", items: [] } })).body.error, "INVALID_MODE");
});
