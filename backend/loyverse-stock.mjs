import { createHmac, timingSafeEqual } from "node:crypto";

const TIMESTAMP_TOLERANCE_MS = 5 * 60_000;
const MAX_RECEIPTS = 100;
const MAX_LINES_PER_RECEIPT = 200;
const MAX_QUANTITY = 10_000;
const MAX_TRANSACTION_ATTEMPTS = 3;

export function verifyLoyverseSyncSignature(rawBody, timestamp, signature, secret, now = Date.now()) {
  if (!secret || !signature || !/^\d{10,16}$/.test(timestamp || "")) return false;
  if (Math.abs(now - Number(timestamp)) > TIMESTAMP_TOLERANCE_MS) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64"));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function parseReceipts(payload) {
  const receipts = payload?.receipts;
  if (!Array.isArray(receipts) || receipts.length > MAX_RECEIPTS) return null;
  const lines = [];
  for (const receipt of receipts) {
    const receiptNumber = typeof receipt?.receiptNumber === "string" ? receipt.receiptNumber.trim() : "";
    if (!receiptNumber || receiptNumber.length > 100 || !Array.isArray(receipt.lines) || receipt.lines.length > MAX_LINES_PER_RECEIPT) return null;
    for (const line of receipt.lines) {
      const lineId = typeof line?.lineId === "string" ? line.lineId.trim() : "";
      const sku = typeof line?.sku === "string" ? line.sku.trim() : "";
      if (!lineId || lineId.length > 100 || !sku || sku.length > 80
        || !Number.isInteger(line.quantity) || Math.abs(line.quantity) > MAX_QUANTITY) return null;
      lines.push({ key: `${receiptNumber}:${lineId}`, sku, quantity: line.quantity });
    }
  }
  return lines;
}

// Loyverse sells in-store, so each receipt line reports how many units it currently removes from stock
// (negative for refunds, zero when cancelled). Applying only the change since the last report keeps
// retries and receipt edits idempotent.
export function createLoyverseStockHandler({ prisma, jsonResponse, getSecret = () => process.env.LOYVERSE_SYNC_SECRET }) {
  async function applyLine(line) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await prisma.$transaction(async (transaction) => {
          const variant = await transaction.productVariant.findUnique({
            where: { sku: line.sku },
            select: { id: true, productId: true, inventoryQuantity: true },
          });
          if (!variant) return "unmatched";
          const prior = await transaction.loyverseStockLedger.findUnique({ where: { key: line.key } });
          const delta = line.quantity - (prior?.quantity ?? 0);
          if (prior && delta === 0) return "unchanged";
          const next = Math.max(0, variant.inventoryQuantity - delta);
          const change = variant.inventoryQuantity - next;
          if (change !== 0) {
            await transaction.productVariant.update({ where: { id: variant.id }, data: { inventoryQuantity: next } });
            await transaction.product.update({ where: { id: variant.productId }, data: { inventoryTotal: { decrement: change } } });
          }
          await transaction.loyverseStockLedger.upsert({
            where: { key: line.key },
            create: { key: line.key, sku: line.sku, quantity: line.quantity },
            update: { sku: line.sku, quantity: line.quantity },
          });
          return "applied";
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        if (error?.code !== "P2034" || attempt >= MAX_TRANSACTION_ATTEMPTS) throw error;
      }
    }
  }

  async function handleLoyverseStockWebhook(request) {
    const rawBody = await request.text();
    if (!verifyLoyverseSyncSignature(rawBody, request.headers.get("x-slowfit-timestamp"), request.headers.get("x-slowfit-signature"), getSecret())) {
      return jsonResponse({ error: "Invalid signature" }, 401);
    }
    let lines;
    try {
      lines = parseReceipts(JSON.parse(rawBody));
    } catch {
      lines = null;
    }
    if (!lines) return jsonResponse({ error: "Invalid payload" }, 400);

    const unmatched = new Set();
    let applied = 0;
    for (const line of lines) {
      const outcome = await applyLine(line);
      if (outcome === "applied") applied += 1;
      if (outcome === "unmatched") unmatched.add(line.sku);
    }
    return jsonResponse({ applied, unmatched: [...unmatched] });
  }

  return { handleLoyverseStockWebhook };
}
