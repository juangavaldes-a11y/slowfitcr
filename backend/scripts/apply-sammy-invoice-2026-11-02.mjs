import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

// Adds the Sammy invoice of 2026-11-02 (Sammy-2026-10-19.pdf) to the inventory as its own purchase, so its printing,
// packaging, shipping and discount stay with its own lines. Existing sales and layaways are not touched.
// Usage: node scripts/apply-sammy-invoice-2026-11-02.mjs --dry-run | --apply

const prisma = new PrismaClient();
const invoice = JSON.parse(await readFile(new URL("../data/sammy-invoice-2026-11-02.json", import.meta.url), "utf8"));
const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");
const auditAction = "inventory.supplier_invoice.applied";
const SIZES = ["S", "M", "L", "XL", "OS"];

const units = (sizes) => SIZES.reduce((total, size) => total + (sizes[size] ?? 0), 0);
const fullSizes = (sizes) => Object.fromEntries(SIZES.map((size) => [size, sizes[size] ?? 0]));

function validate() {
  const keys = new Set();
  let goodsUsd = 0;
  for (const line of invoice.lines) {
    const key = `${line.code}\u0000${line.color}`;
    if (keys.has(key)) throw new Error(`Duplicate line ${line.code} ${line.color}`);
    keys.add(key);
    if (!line.code || !line.color || !line.productName || !(line.unitPriceUsd > 0) || units(line.sizes) < 1) throw new Error(`Invalid line ${line.code} ${line.color}`);
    goodsUsd += units(line.sizes) * line.unitPriceUsd;
  }
  const { hkShippingUsd, logoPrintingUsd, sizePrintingUsd, packagingUsd, discountUsd } = invoice.batch;
  const total = goodsUsd + hkShippingUsd + logoPrintingUsd + sizePrintingUsd + packagingUsd - discountUsd;
  if (Math.abs(total - invoice.invoiceTotalUsd) > 0.01) throw new Error(`Invoice total mismatch: ${total} vs ${invoice.invoiceTotalUsd}`);
  return { goodsUsd, total };
}

async function main() {
  if (!dryRun && !apply) throw new Error("Pass --dry-run to validate or --apply to write the invoice");
  const { goodsUsd, total } = validate();

  const existingBatch = await prisma.inventoryBatch.findFirst({ where: { name: invoice.batch.name } });
  if (existingBatch && apply) throw new Error("This invoice has already been applied");

  const existing = await prisma.inventoryLine.findMany({ select: { id: true, code: true, color: true, sizes: true, unitPriceUsd: true } });
  const byKey = new Map(existing.map((line) => [`${line.code}\u0000${line.color}`, line]));
  const created = invoice.lines.filter((line) => !byKey.has(`${line.code}\u0000${line.color}`));
  const added = invoice.lines.filter((line) => byKey.has(`${line.code}\u0000${line.color}`));

  console.log(JSON.stringify({
    invoice: invoice.invoiceFile,
    batch: invoice.batch.name,
    lines: invoice.lines.length,
    units: invoice.lines.reduce((sum, line) => sum + units(line.sizes), 0),
    goodsUsd,
    invoiceTotalUsd: total,
    newLines: created.length,
    addedToExistingLines: added.map((line) => `${line.code} ${line.color}`),
    alreadyApplied: Boolean(existingBatch),
    mode: dryRun ? "dry-run" : "apply",
  }, null, 2));
  if (dryRun || existingBatch) return;

  await prisma.$transaction(async (transaction) => {
    const batch = await transaction.inventoryBatch.create({
      data: { ...invoice.batch, invoiceDate: new Date(invoice.batch.invoiceDate) },
    });
    const position = await transaction.inventoryLine.count();
    for (const [index, line] of created.entries()) {
      await transaction.inventoryLine.create({
        data: {
          code: line.code,
          productName: line.productName,
          color: line.color,
          sizes: fullSizes(line.sizes),
          piecesPerGarment: line.piecesPerGarment,
          unitPriceUsd: line.unitPriceUsd,
          batchId: batch.id,
          position: position + index,
        },
      });
    }
    // A color already in stock keeps its original purchase: the new pieces are simply added to its sizes.
    for (const line of added) {
      const current = byKey.get(`${line.code}\u0000${line.color}`);
      const sizes = Object.fromEntries(SIZES.map((size) => [size, (current.sizes[size] ?? 0) + (line.sizes[size] ?? 0)]));
      await transaction.inventoryLine.update({ where: { id: current.id }, data: { sizes, unitPriceUsd: line.unitPriceUsd } });
    }
    await transaction.auditLog.create({
      data: {
        action: auditAction,
        actor: "supplier-invoice-sammy-2026-11-02",
        details: { invoiceFile: invoice.invoiceFile, batchId: batch.id, created: created.length, added: added.length, units: invoice.lines.reduce((sum, line) => sum + units(line.sizes), 0) },
      },
    });
  }, { timeout: 60000 });
  console.log(`Applied ${created.length} new lines and ${added.length} additions to existing lines.`);
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
