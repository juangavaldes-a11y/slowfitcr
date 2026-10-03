import { buildAnalytics } from "./inventory-analytics.mjs";
import { fetchBccrRate } from "./inventory-fx.mjs";
import { computeInventoryCosts, SIZE_KEYS, sumSizes } from "./inventory-costing.mjs";

const VARIANT_SIZE = { OS: "One Size" };
const SETTING_FIELDS = [
  "hkShippingUsd", "invoiceAdjustmentUsd", "fxRate", "crShippingUsd", "nationalizationCrc",
  "otherImportCrc", "extraUnitCrc", "cardCommissionRate", "customizationPerPieceUsd",
];

const num = (value) => (value === null || value === undefined ? null : Number(value));

function parseNonNegative(value, { nullable = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (nullable) return null;
    throw new Error("INVALID_NUMBER");
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("INVALID_NUMBER");
  return number;
}

function parseSizes(raw) {
  const sizes = {};
  for (const key of SIZE_KEYS) {
    const value = Number(raw?.[key] ?? 0);
    if (!Number.isInteger(value) || value < 0 || value > 100000) throw new Error("INVALID_SIZES");
    sizes[key] = value;
  }
  return sizes;
}

export function parseLineInput(body, { partial = false } = {}) {
  const data = {};
  const text = (key, max = 160) => {
    if (body[key] === undefined) return;
    const value = String(body[key]).trim();
    if (!value || value.length > max) throw new Error("INVALID_TEXT");
    data[key] = value;
  };
  text("code", 80);
  text("productName");
  text("color");
  if (body.sizes !== undefined) data.sizes = parseSizes(body.sizes);
  if (body.piecesPerGarment !== undefined) {
    const pieces = Number(body.piecesPerGarment);
    if (!Number.isInteger(pieces) || pieces < 1 || pieces > 20) throw new Error("INVALID_NUMBER");
    data.piecesPerGarment = pieces;
  }
  if (body.unitPriceUsd !== undefined) data.unitPriceUsd = parseNonNegative(body.unitPriceUsd);
  if (body.salePriceCrc !== undefined) data.salePriceCrc = parseNonNegative(body.salePriceCrc, { nullable: true });
  if (body.productHandle !== undefined) data.productHandle = body.productHandle ? String(body.productHandle).slice(0, 200) : null;
  if (body.supplierEquivalence !== undefined) data.supplierEquivalence = body.supplierEquivalence ? String(body.supplierEquivalence).slice(0, 200) : null;
  if (!partial) {
    for (const key of ["code", "productName", "color", "sizes", "unitPriceUsd"]) {
      if (data[key] === undefined) throw new Error("MISSING_FIELD");
    }
  }
  return data;
}

export function parseSettingsInput(body) {
  const data = {};
  for (const key of SETTING_FIELDS) {
    if (body[key] === undefined) continue;
    const nullable = ["fxRate", "crShippingUsd", "nationalizationCrc", "otherImportCrc"].includes(key);
    data[key] = parseNonNegative(body[key], { nullable });
  }
  return data;
}

export function parseSaleInput(body, now = new Date()) {
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error("INVALID_QUANTITY");
  const size = String(body.size || "").trim();
  if (!SIZE_KEYS.includes(size)) throw new Error("INVALID_SIZE");
  const paymentMethod = String(body.paymentMethod || "").trim();
  if (!paymentMethod || paymentMethod.length > 60) throw new Error("INVALID_PAYMENT_METHOD");
  const unitPriceCrc = parseNonNegative(body.unitPriceCrc);
  const discountCrc = parseNonNegative(body.discountCrc ?? 0);
  if (discountCrc > unitPriceCrc * quantity) throw new Error("INVALID_DISCOUNT");
  const soldAt = body.soldAt ? new Date(body.soldAt) : now;
  if (Number.isNaN(soldAt.getTime()) || soldAt.getTime() > now.getTime() + 86_400_000) throw new Error("INVALID_DATE");
  return {
    lineId: String(body.lineId || ""),
    size,
    quantity,
    unitPriceCrc,
    discountCrc,
    soldAt,
    paymentMethod,
    note: String(body.note || "").slice(0, 500),
  };
}

function soldBySize(sales) {
  const map = new Map();
  for (const sale of sales) {
    if (sale.voidedAt) continue;
    const entry = map.get(sale.lineId) ?? {};
    entry[sale.size] = (entry[sale.size] ?? 0) + sale.quantity;
    map.set(sale.lineId, entry);
  }
  return map;
}

export function buildInventoryView(settingsRow, lineRows, sales) {
  const settings = Object.fromEntries(SETTING_FIELDS.map((key) => [key, num(settingsRow?.[key])]));
  const costs = computeInventoryCosts(
    lineRows.map((line) => ({
      sizes: line.sizes,
      piecesPerGarment: line.piecesPerGarment,
      unitPriceUsd: num(line.unitPriceUsd),
      salePriceCrc: num(line.salePriceCrc),
    })),
    settings,
  );
  const sold = soldBySize(sales);
  const lines = lineRows.map((line, index) => {
    const soldSizes = sold.get(line.id) ?? {};
    const remaining = Object.fromEntries(SIZE_KEYS.map((key) => [key, (line.sizes[key] ?? 0) - (soldSizes[key] ?? 0)]));
    const soldQuantity = sumSizes(soldSizes);
    return {
      id: line.id,
      code: line.code,
      productName: line.productName,
      color: line.color,
      productHandle: line.productHandle,
      sizes: line.sizes,
      piecesPerGarment: line.piecesPerGarment,
      unitPriceUsd: num(line.unitPriceUsd),
      supplierEquivalence: line.supplierEquivalence,
      soldSizes,
      remaining,
      soldQuantity,
      remainingQuantity: sumSizes(remaining),
      cost: costs.lines[index],
    };
  });
  return { settings: costs.settings, crReady: costs.crReady, lines, totals: costs.totals };
}

const IMPORT_FIELDS = ["productName", "sizes", "piecesPerGarment", "unitPriceUsd", "salePriceCrc", "supplierEquivalence"];
const MAX_IMPORT_ROWS = 1000;

export function diffImport(existingLines, incomingLines, soldByLine = new Map()) {
  const existing = new Map(existingLines.map((line) => [`${line.code}\u0000${line.color}`, line]));
  const seen = new Set();
  const result = { created: [], updated: [], unchanged: [], errors: [], missing: [] };
  incomingLines.forEach((incoming, index) => {
    let data;
    try {
      data = parseLineInput(incoming);
    } catch (error) {
      result.errors.push({ row: index + 1, code: incoming?.code ?? null, error: error.message });
      return;
    }
    const key = `${data.code}\u0000${data.color}`;
    if (seen.has(key)) {
      result.errors.push({ row: index + 1, code: data.code, error: "INVALID_DUPLICATE_ROW" });
      return;
    }
    seen.add(key);
    const current = existing.get(key);
    if (!current) {
      result.created.push(data);
      return;
    }
    const sold = soldByLine.get(current.id) ?? {};
    if (SIZE_KEYS.some((size) => data.sizes[size] < (sold[size] ?? 0))) {
      result.errors.push({ row: index + 1, code: data.code, error: "SOLD_EXCEEDS_STOCK" });
      return;
    }
    const changes = {};
    for (const field of IMPORT_FIELDS) {
      if (data[field] === undefined) continue;
      const before = field === "sizes" ? JSON.stringify(SIZE_KEYS.map((size) => current.sizes[size] ?? 0))
        : field === "unitPriceUsd" || field === "salePriceCrc" ? num(current[field]) : current[field] ?? null;
      const after = field === "sizes" ? JSON.stringify(SIZE_KEYS.map((size) => data.sizes[size]))
        : data[field] ?? null;
      if (before !== after) changes[field] = data[field];
    }
    if (Object.keys(changes).length) result.updated.push({ id: current.id, code: data.code, color: data.color, changes });
    else result.unchanged.push({ id: current.id });
  });
  result.missing = existingLines.filter((line) => !seen.has(`${line.code}\u0000${line.color}`)).map((line) => ({ code: line.code, color: line.color }));
  return result;
}

const WEBSITE_METHOD = "Website checkout";

function sizeKeyOf(variantSize) {
  if (variantSize === "One Size") return "OS";
  return SIZE_KEYS.includes(variantSize) ? variantSize : null;
}

// Groups paid website order items into ledger sales per order, line and size.
export function planWebsiteSales(orders, variantsById, lines) {
  const lineByKey = new Map(lines.filter((line) => line.productHandle).map((line) => [`${line.productHandle}\u0000${line.color}`, line]));
  const grouped = new Map();
  let unmatched = 0;
  for (const order of orders) {
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const variant = variantsById.get(String(item?.variantId || ""));
      const quantity = Number(item?.quantity);
      const size = variant ? sizeKeyOf(variant.size) : null;
      const line = variant && size ? lineByKey.get(`${variant.productHandle}\u0000${variant.color}`) : null;
      if (!line || !Number.isInteger(quantity) || quantity < 1) {
        unmatched += 1;
        continue;
      }
      const key = `${order.id}\u0000${line.id}\u0000${size}`;
      const entry = grouped.get(key) ?? {
        lineId: line.id, size, quantity: 0, unitPriceCrc: Number(item.unitPrice) || Number(variant.price) || 0,
        discountCrc: 0, soldAt: order.paymentCreatedAt ?? order.updatedAt, paymentMethod: WEBSITE_METHOD,
        source: "WEBSITE", orderId: order.id, note: order.name ?? "",
      };
      entry.quantity += quantity;
      grouped.set(key, entry);
    }
  }
  return { sales: [...grouped.values()], unmatched };
}

export function createInventoryHandlers({ prisma, jsonResponse, readJson, isAuthorized, appendAudit, fetchRate = fetchBccrRate }) {
  const guard = (handler) => async (request, ...args) => {
    if (!(await isAuthorized(request))) return jsonResponse({ error: "Unauthorized" }, 401);
    try {
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof SyntaxError) return jsonResponse({ error: "Invalid JSON" }, 400);
      if (/^(INVALID|MISSING|SOLD|NOT_FOUND|ALREADY)/.test(error?.message ?? "")) {
        return jsonResponse({ error: error.message }, error.message === "NOT_FOUND" ? 404 : 400);
      }
      if (error?.code === "P2002") return jsonResponse({ error: "ALREADY_EXISTS" }, 409);
      throw error;
    }
  };

  const syncWebsiteOrders = async () => {
    const synced = await prisma.inventorySale.findMany({ where: { orderId: { not: null } }, select: { orderId: true }, distinct: ["orderId"] });
    const orders = await prisma.order.findMany({
      where: { inventoryAdjustedAt: { not: null }, id: { notIn: synced.map((row) => row.orderId) } },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    if (!orders.length) return { imported: 0, unmatched: 0 };
    const variantIds = [...new Set(orders.flatMap((order) => (Array.isArray(order.items) ? order.items : []).map((item) => String(item?.variantId || ""))))].filter(Boolean);
    const [variants, lines] = await Promise.all([
      prisma.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, size: true, color: true, price: true, product: { select: { handle: true } } } }),
      prisma.inventoryLine.findMany(),
    ]);
    const variantsById = new Map(variants.map((variant) => [variant.id, { size: variant.size, color: variant.color, price: variant.price, productHandle: variant.product.handle }]));
    const { sales, unmatched } = planWebsiteSales(orders, variantsById, lines);
    if (sales.length) await prisma.inventorySale.createMany({ data: sales, skipDuplicates: true });
    return { imported: sales.length, unmatched };
  };

  const loadView = async () => {
    const websiteSync = await syncWebsiteOrders().catch(() => ({ imported: 0, unmatched: 0, failed: true }));
    const [settings, lines, sales, paymentMethods] = await Promise.all([
      prisma.inventorySettings.findUnique({ where: { id: "default" } }),
      prisma.inventoryLine.findMany({ orderBy: [{ position: "asc" }, { code: "asc" }, { color: "asc" }] }),
      prisma.inventorySale.findMany({ where: { voidedAt: null }, select: { lineId: true, size: true, quantity: true, voidedAt: true } }),
      prisma.paymentMethod.findMany({ orderBy: { position: "asc" } }),
    ]);
    return { ...buildInventoryView(settings, lines, sales), paymentMethods, websiteSync };
  };

  const getInventory = guard(async () => jsonResponse(await loadView()));

  const updateSettings = guard(async (request) => {
    const data = parseSettingsInput(await readJson(request));
    await prisma.inventorySettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
    await appendAudit("inventory.settings.updated", { fields: Object.keys(data) }, "admin");
    return jsonResponse(await loadView());
  });

  const createLine = guard(async (request) => {
    const data = parseLineInput(await readJson(request));
    const line = await prisma.inventoryLine.create({ data });
    await appendAudit("inventory.line.created", { lineId: line.id, code: line.code, color: line.color }, "admin");
    return jsonResponse(await loadView(), 201);
  });

  const updateLine = guard(async (request, lineId) => {
    const data = parseLineInput(await readJson(request), { partial: true });
    if (data.sizes) {
      const sold = soldBySize(await prisma.inventorySale.findMany({ where: { lineId, voidedAt: null } })).get(lineId) ?? {};
      if (SIZE_KEYS.some((key) => data.sizes[key] < (sold[key] ?? 0))) throw new Error("SOLD_EXCEEDS_STOCK");
    }
    try {
      await prisma.inventoryLine.update({ where: { id: lineId }, data });
    } catch (error) {
      if (error?.code === "P2025") throw new Error("NOT_FOUND");
      throw error;
    }
    await appendAudit("inventory.line.updated", { lineId, fields: Object.keys(data) }, "admin");
    return jsonResponse(await loadView());
  });

  const syncStorefrontStock = async (transaction, line, size, delta) => {
    if (!line.productHandle || !line.color) return;
    const variant = await transaction.productVariant.findFirst({
      where: { product: { handle: line.productHandle }, color: line.color, size: VARIANT_SIZE[size] ?? size },
    });
    if (!variant) return;
    const quantity = Math.max(0, variant.inventoryQuantity + delta);
    await transaction.productVariant.update({ where: { id: variant.id }, data: { inventoryQuantity: quantity } });
    const aggregate = await transaction.productVariant.aggregate({ where: { productId: variant.productId }, _sum: { inventoryQuantity: true } });
    await transaction.product.update({ where: { id: variant.productId }, data: { inventoryTotal: aggregate._sum.inventoryQuantity ?? 0 } });
  };

  const createSale = guard(async (request) => {
    const input = parseSaleInput(await readJson(request));
    const sale = await prisma.$transaction(async (transaction) => {
      const line = await transaction.inventoryLine.findUnique({ where: { id: input.lineId } });
      if (!line) throw new Error("NOT_FOUND");
      const active = await transaction.inventorySale.findMany({ where: { lineId: line.id, size: input.size, voidedAt: null } });
      const available = (line.sizes[input.size] ?? 0) - active.reduce((total, row) => total + row.quantity, 0);
      if (input.quantity > available) throw new Error("INVALID_QUANTITY_EXCEEDS_STOCK");
      const created = await transaction.inventorySale.create({ data: input });
      await syncStorefrontStock(transaction, line, input.size, -input.quantity);
      return created;
    });
    await appendAudit("inventory.sale.created", { saleId: sale.id, lineId: sale.lineId, size: sale.size, quantity: sale.quantity, paymentMethod: sale.paymentMethod }, "admin");
    return jsonResponse(await loadView(), 201);
  });

  const voidSale = guard(async (request, saleId) => {
    await prisma.$transaction(async (transaction) => {
      const sale = await transaction.inventorySale.findUnique({ where: { id: saleId }, include: { line: true } });
      if (!sale) throw new Error("NOT_FOUND");
      if (sale.voidedAt) throw new Error("ALREADY_VOIDED");
      await transaction.inventorySale.update({ where: { id: saleId }, data: { voidedAt: new Date() } });
      if (sale.source !== "WEBSITE") await syncStorefrontStock(transaction, sale.line, sale.size, sale.quantity);
    });
    await appendAudit("inventory.sale.voided", { saleId }, "admin");
    return jsonResponse(await loadView());
  });

  const listSales = guard(async (request) => {
    const url = new URL(request.url);
    const lineId = url.searchParams.get("lineId") || undefined;
    const sales = await prisma.inventorySale.findMany({
      where: lineId ? { lineId } : {},
      include: { line: { select: { code: true, productName: true, color: true } } },
      orderBy: { soldAt: "desc" },
      take: 500,
    });
    return jsonResponse({ sales });
  });

  const importLines = guard(async (request) => {
    const body = await readJson(request);
    const incoming = Array.isArray(body.lines) ? body.lines : null;
    if (!incoming || incoming.length === 0 || incoming.length > MAX_IMPORT_ROWS) throw new Error("INVALID_IMPORT");
    const apply = body.apply === true;
    const [existing, sales] = await Promise.all([
      prisma.inventoryLine.findMany(),
      prisma.inventorySale.findMany({ where: { voidedAt: null } }),
    ]);
    const diff = diffImport(existing, incoming, soldBySize(sales));
    const summary = { created: diff.created.length, updated: diff.updated.length, unchanged: diff.unchanged.length, missing: diff.missing.length, errors: diff.errors };
    if (!apply) return jsonResponse({ applied: false, summary, created: diff.created, updated: diff.updated, missing: diff.missing });
    if (diff.errors.length) return jsonResponse({ applied: false, summary, error: "IMPORT_HAS_ERRORS" }, 422);
    await prisma.$transaction(async (transaction) => {
      for (const data of diff.created) await transaction.inventoryLine.create({ data });
      for (const row of diff.updated) await transaction.inventoryLine.update({ where: { id: row.id }, data: row.changes });
    }, { timeout: 30000 });
    await appendAudit("inventory.import.applied", { created: summary.created, updated: summary.updated, unchanged: summary.unchanged }, "admin");
    return jsonResponse({ applied: true, summary, ...(await loadView()) });
  });

  const getExchangeRate = guard(async () => {
    const today = new Date().toISOString().slice(0, 10);
    let rate = await prisma.exchangeRate.findFirst({ orderBy: { date: "desc" } });
    let stale = !rate || rate.date.toISOString().slice(0, 10) < today;
    if (stale) {
      try {
        const fresh = await fetchRate();
        rate = await prisma.exchangeRate.upsert({
          where: { date: new Date(fresh.date) },
          create: { date: new Date(fresh.date), buyRate: fresh.buyRate, sellRate: fresh.sellRate },
          update: { buyRate: fresh.buyRate, sellRate: fresh.sellRate, fetchedAt: new Date() },
        });
        stale = false;
      } catch {
        if (!rate) return jsonResponse({ error: "FX_UNAVAILABLE" }, 502);
      }
    }
    return jsonResponse({
      date: rate.date.toISOString().slice(0, 10),
      buyRate: num(rate.buyRate),
      sellRate: num(rate.sellRate),
      stale,
      source: rate.source,
    });
  });

  const getAnalytics = guard(async () => {
    const [view, sales] = await Promise.all([loadView(), prisma.inventorySale.findMany({ orderBy: { soldAt: "asc" } })]);
    return jsonResponse({
      crReady: view.crReady,
      ...buildAnalytics({
        lines: view.lines,
        sales,
        commissionRate: view.settings.cardCommissionRate ?? 0,
        invested: view.totals.totalInventoryCostCrc ?? 0,
      }),
    });
  });

  return { getAnalytics, getExchangeRate, importLines, getInventory, updateSettings, createLine, updateLine, createSale, voidSale, listSales };
}
