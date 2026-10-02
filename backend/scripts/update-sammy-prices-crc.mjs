import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const priceUrl = new URL("../data/sammy-final-prices-crc.json", import.meta.url);
const invoiceUrl = new URL("../data/sammy-invoice-2026-09-18.json", import.meta.url);
const prices = JSON.parse(await readFile(priceUrl, "utf8"));
const invoice = JSON.parse(await readFile(invoiceUrl, "utf8"));
const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");
const auditAction = "catalog.supplier_prices_updated";
const auditActor = "inventario-precios-xlsx";
const invoiceTag = "sammy-invoice-2026-09-18";

function validatePriceList() {
  if (prices.currencyCode !== "CRC" || prices.priceColumn !== "Precio de venta CRC") {
    throw new Error("Price list must contain final retail prices in CRC");
  }
  if (!Array.isArray(prices.products) || prices.products.length !== 27 || prices.colorRows !== 80) {
    throw new Error("Expected 27 product prices covering 80 workbook color rows");
  }

  const invoiceByHandle = new Map(invoice.products.map((product) => [product.handle, product]));
  const handles = new Set();
  for (const product of prices.products) {
    const invoiceProduct = invoiceByHandle.get(product.handle);
    if (handles.has(product.handle)) throw new Error(`Duplicate product handle: ${product.handle}`);
    handles.add(product.handle);
    if (!invoiceProduct || invoiceProduct.supplierReference !== product.supplierReference) {
      throw new Error(`Invoice reference does not match ${product.handle}`);
    }
    if (!Number.isSafeInteger(product.priceCRC) || product.priceCRC < 1) {
      throw new Error(`Invalid CRC retail price for ${product.supplierReference}`);
    }
  }

  if (invoiceByHandle.size !== handles.size || [...invoiceByHandle.keys()].some((handle) => !handles.has(handle))) {
    throw new Error("Price list does not cover every invoice product");
  }
  return invoiceByHandle;
}

async function main() {
  if (!dryRun && !apply) throw new Error("Pass --dry-run to validate or --apply to update prices");
  const invoiceByHandle = validatePriceList();
  const existingAudit = await prisma.auditLog.findFirst({
    where: { action: auditAction, actor: auditActor },
    select: { id: true },
  });
  if (existingAudit && apply) throw new Error("This CRC price sheet has already been applied");

  const products = await prisma.product.findMany({
    where: { handle: { in: prices.products.map((product) => product.handle) } },
    select: {
      id: true,
      handle: true,
      status: true,
      published: true,
      tags: true,
      variants: { select: { color: true, size: true, price: true } },
    },
  });
  const productByHandle = new Map(products.map((product) => [product.handle, product]));
  const updates = [];
  let variantCount = 0;
  let changedVariantCount = 0;

  for (const price of prices.products) {
    const product = productByHandle.get(price.handle);
    const invoiceProduct = invoiceByHandle.get(price.handle);
    if (!product || !product.tags.includes(invoiceTag)) {
      throw new Error(`Applied invoice product is missing: ${price.handle}`);
    }
    if (product.status !== "ACTIVE" || !product.published) {
      throw new Error(`Expected active, published product: ${price.handle}`);
    }

    const expectedColors = new Set(Object.keys(invoiceProduct.stock));
    const actualColors = new Set(product.variants.map((variant) => variant.color).filter(Boolean));
    if (expectedColors.size !== actualColors.size || [...expectedColors].some((color) => !actualColors.has(color))) {
      throw new Error(`Variant colors do not match the invoice for ${price.handle}`);
    }
    for (const [color, sizes] of Object.entries(invoiceProduct.stock)) {
      const colorVariants = product.variants.filter((variant) => variant.color === color);
      const expectedSizes = Object.keys(sizes);
      if (colorVariants.length !== expectedSizes.length
        || expectedSizes.some((size) => !colorVariants.some((variant) => variant.size === size))) {
        throw new Error(`Variant sizes do not match the invoice for ${price.handle}/${color}`);
      }
      changedVariantCount += colorVariants.filter((variant) => Number(variant.price) !== price.priceCRC).length;
      variantCount += colorVariants.length;
    }
    updates.push({ id: product.id, handle: product.handle, priceCRC: price.priceCRC });
  }

  console.log(JSON.stringify({
    sourceFile: prices.sourceFile,
    worksheet: prices.worksheet,
    priceColumn: prices.priceColumn,
    currencyCode: prices.currencyCode,
    productCount: updates.length,
    colorRows: prices.colorRows,
    variantCount,
    changedVariantCount,
    alreadyApplied: Boolean(existingAudit),
    mode: dryRun ? "dry-run" : "apply",
  }));
  if (dryRun || existingAudit) return;

  await prisma.$transaction(async (transaction) => {
    for (const update of updates) {
      const updatedVariants = await transaction.productVariant.updateMany({
        where: { productId: update.id },
        data: { price: update.priceCRC },
      });
      const updatedProduct = await transaction.product.update({
        where: { id: update.id },
        data: { minPrice: update.priceCRC },
      });
      if (updatedVariants.count === 0 || Number(updatedProduct.minPrice) !== update.priceCRC) {
        throw new Error(`Failed to update CRC price for ${update.handle}`);
      }
    }

    await transaction.auditLog.create({
      data: {
        action: auditAction,
        actor: auditActor,
        details: {
          sourceFile: prices.sourceFile,
          worksheet: prices.worksheet,
          priceColumn: prices.priceColumn,
          currencyCode: prices.currencyCode,
          productCount: updates.length,
          colorRows: prices.colorRows,
          variantCount,
          handles: updates.map((update) => update.handle),
        },
      },
    });
  }, { timeout: 30000 });

  console.log(`Updated ${variantCount} variants across ${updates.length} products with CRC prices.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });