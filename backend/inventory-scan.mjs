import { syncStorefrontStock } from "./inventory-admin.mjs";
import { SIZE_KEYS } from "./inventory-costing.mjs";
import { HOLDING_STATUSES } from "./layaways.mjs";
import { normalizeScan, sizeKeyFor } from "./pos.mjs";

const MAX_ITEMS = 200;
const MAX_QUANTITY = 100_000;
export const SCAN_MODES = ["receive", "count"];

export function parseScanApplyInput(body) {
  const mode = String(body?.mode || "");
  if (!SCAN_MODES.includes(mode)) throw new Error("INVALID_MODE");
  const rows = Array.isArray(body?.items) ? body.items : [];
  if (!rows.length) throw new Error("MISSING_ITEMS");
  if (rows.length > MAX_ITEMS) throw new Error("INVALID_ITEMS");
  const merged = new Map();
  for (const row of rows) {
    const lineId = String(row?.lineId || "").trim();
    const size = String(row?.size || "").trim();
    const quantity = Number(row?.quantity);
    if (!lineId) throw new Error("MISSING_LINE");
    if (!SIZE_KEYS.includes(size)) throw new Error("INVALID_SIZE");
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) throw new Error("INVALID_QUANTITY");
    if (mode === "receive" && quantity < 1) throw new Error("INVALID_QUANTITY");
    const key = `${lineId}:${size}`;
    // Receiving adds up repeated rows; a physical count is one number per size, so the last row wins.
    const previous = merged.get(key);
    merged.set(key, { lineId, size, quantity: mode === "receive" && previous ? previous.quantity + quantity : quantity });
  }
  return { mode, items: [...merged.values()], note: String(body?.note || "").slice(0, 300) };
}

// Units already committed against a size: active sales (minus restocked returns) plus layaways holding units.
export async function committedUnits(prismaLike, lineId, size) {
  const sales = await prismaLike.inventorySale.findMany({ where: { lineId, size, voidedAt: null } });
  const held = await prismaLike.layaway.count({ where: { lineId, size, status: { in: HOLDING_STATUSES } } });
  const sold = sales.reduce((total, sale) => total + sale.quantity - (sale.restockedQuantity ?? 0), 0);
  return { sold, held };
}

export function createInventoryScanHandlers({ prisma, jsonResponse, readJson, isAuthorized, appendAudit, pushInventory = async () => undefined }) {
  const guard = (handler) => async (request, ...args) => {
    if (!(await isAuthorized(request))) return jsonResponse({ error: "Unauthorized" }, 401);
    try {
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof SyntaxError) return jsonResponse({ error: "Invalid JSON" }, 400);
      if (/^(INVALID|MISSING|NOT_FOUND)/.test(error?.message ?? "")) {
        return jsonResponse({ error: error.message }, error.message.startsWith("NOT_FOUND") ? 404 : 400);
      }
      throw error;
    }
  };

  // A scanned SKU -> the inventory line and size it belongs to, with the numbers a count needs.
  const lookup = guard(async (request) => {
    const code = normalizeScan(new URL(request.url).searchParams.get("code"));
    if (!code) throw new Error("MISSING_CODE");
    const variant = await prisma.productVariant.findFirst({
      where: { sku: { equals: code, mode: "insensitive" } },
      include: { product: { select: { title: true, handle: true } } },
    });
    if (!variant) throw new Error("NOT_FOUND");
    const size = sizeKeyFor(variant.size);
    if (!size) throw new Error("INVALID_SIZE");
    const line = await prisma.inventoryLine.findFirst({ where: { productHandle: variant.product.handle, color: variant.color } });
    if (!line) throw new Error("NOT_FOUND_LINE");
    const { sold, held } = await committedUnits(prisma, line.id, size);
    const received = line.sizes[size] ?? 0;
    return jsonResponse({
      code,
      sku: variant.sku,
      lineId: line.id,
      size,
      productName: variant.product.title,
      color: variant.color,
      received,
      sold,
      held,
      remaining: received - sold - held,
    });
  });

  const apply = guard(async (request) => {
    const input = parseScanApplyInput(await readJson(request));
    const changes = [];
    const applied = [];
    await prisma.$transaction(async (transaction) => {
      for (const item of input.items) {
        const line = await transaction.inventoryLine.findUnique({ where: { id: item.lineId } });
        if (!line) throw new Error("NOT_FOUND");
        const before = line.sizes[item.size] ?? 0;
        const { sold, held } = await committedUnits(transaction, line.id, item.size);
        const after = input.mode === "receive" ? before + item.quantity : sold + held + item.quantity;
        const updated = await transaction.inventoryLine.update({ where: { id: line.id }, data: { sizes: { ...line.sizes, [item.size]: after } } });
        changes.push(await syncStorefrontStock(transaction, updated, item.size, after - before));
        applied.push({ lineId: line.id, code: line.code, color: line.color, size: item.size, before, after, delta: after - before });
      }
    });
    await pushInventory(changes.filter(Boolean));
    await appendAudit("inventory.scan.applied", { mode: input.mode, items: applied.length, note: input.note }, "admin");
    return jsonResponse({ mode: input.mode, applied });
  });

  return { lookup, apply };
}
