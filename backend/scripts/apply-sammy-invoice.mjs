import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const invoiceUrl = new URL("../data/sammy-invoice-2026-09-18.json", import.meta.url);
const invoice = JSON.parse(await readFile(invoiceUrl, "utf8"));
const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");
const auditAction = "catalog.supplier_invoice.applied";
const auditActor = "catalog-sammy-2026-9-2";
const invoiceTag = "sammy-invoice-2026-09-18";

function makeVariants(product) {
  const price = Number((product.unitCost * invoice.priceMultiplier).toFixed(2));
  const variants = [];

  for (const [color, sizes] of Object.entries(product.stock)) {
    for (const [size, inventoryQuantity] of Object.entries(sizes)) {
      const skuParts = [product.supplierReference, color, size]
        .join("-")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      variants.push({
        title: `${color} / ${size}`,
        size,
        color,
        colorHex: null,
        sku: skuParts,
        price,
        compareAtPrice: null,
        inventoryQuantity,
        position: variants.length,
      });
    }
  }

  return variants;
}

function cleanDescription(product, description) {
  let cleaned = description.replace(
    /\s*Producto importado como borrador; confirma precio, color y ajuste antes de publicarlo\.?/i,
    "",
  );
  if (product.replaceSupplierReference) {
    cleaned = cleaned.replace(product.replaceSupplierReference, product.supplierReference);
  }
  return cleaned.trim();
}

function validateInvoice() {
  if (!Array.isArray(invoice.products) || invoice.products.length !== 27) {
    throw new Error("Expected the 27 garment lines from the invoice");
  }

  const handles = new Set();
  const skus = new Set();
  let totalUnits = 0;

  for (const product of invoice.products) {
    if (handles.has(product.handle)) throw new Error(`Duplicate product handle: ${product.handle}`);
    handles.add(product.handle);
    const variants = makeVariants(product);
    const lineUnits = variants.reduce((sum, variant) => sum + variant.inventoryQuantity, 0);
    if (lineUnits < 1) throw new Error(`No inventory for ${product.supplierReference}`);
    if (variants.some((variant) => !Number.isInteger(variant.inventoryQuantity) || variant.inventoryQuantity < 1)) {
      throw new Error(`Invalid inventory quantity for ${product.supplierReference}`);
    }
    if (variants.some((variant) => skus.has(variant.sku))) {
      throw new Error(`Duplicate variant SKU for ${product.supplierReference}`);
    }
    variants.forEach((variant) => skus.add(variant.sku));
    const costInCents = product.unitCost * 100;
    if (!Number.isFinite(costInCents) || Math.abs(costInCents - Math.round(costInCents)) > 1e-8) {
      throw new Error(`Invalid invoice cost for ${product.supplierReference}`);
    }
    totalUnits += lineUnits;
  }

  if (totalUnits !== 241) throw new Error(`Expected 241 units, found ${totalUnits}`);
  return { totalUnits, variantCount: skus.size };
}

async function main() {
  if (!dryRun && !apply) throw new Error("Pass --dry-run to validate or --apply to write the invoice");
  const { totalUnits, variantCount } = validateInvoice();
  const existingAudit = await prisma.auditLog.findFirst({
    where: { action: auditAction, actor: auditActor },
    select: { id: true },
  });
  if (existingAudit && apply) throw new Error("This invoice has already been applied");

  const handles = invoice.products.map((product) => product.handle);
  const existingProducts = await prisma.product.findMany({
    where: { handle: { in: handles } },
    select: { id: true, handle: true, title: true, description: true, status: true, published: true, tags: true },
  });
  const existingByHandle = new Map(existingProducts.map((product) => [product.handle, product]));

  for (const product of invoice.products) {
    const existing = existingByHandle.get(product.handle);
    if (product.create && existing) throw new Error(`New invoice product already exists: ${product.handle}`);
    if (!product.create && !existing) throw new Error(`Catalog product is missing: ${product.handle}`);
    if (existing && (!existing.tags.includes("pdf-import") || existing.status !== "DRAFT" || existing.published)) {
      throw new Error(`Refusing to replace a reviewed or published product: ${product.handle}`);
    }
    if (product.replaceSupplierReference && !existing?.description.includes(product.replaceSupplierReference)) {
      throw new Error(`Expected old supplier reference is missing: ${product.handle}`);
    }
  }

  console.log(JSON.stringify({
    invoice: invoice.invoiceFile,
    date: invoice.invoiceDate,
    priceMultiplier: invoice.priceMultiplier,
    productLines: invoice.products.length,
    newProducts: invoice.products.filter((product) => product.create).length,
    existingDrafts: existingProducts.length,
    variantCount,
    totalUnits,
    alreadyApplied: Boolean(existingAudit),
    mode: dryRun ? "dry-run" : "apply",
  }));
  if (dryRun || existingAudit) return;

  await prisma.$transaction(async (transaction) => {
    for (const product of invoice.products) {
      const variants = makeVariants(product);
      const price = variants[0].price;
      const existing = existingByHandle.get(product.handle);
      const tags = [...new Set([...(existing?.tags ?? product.tags ?? []), invoiceTag])];
      const description = cleanDescription(product, existing?.description ?? product.description);
      const productData = {
        title: existing?.title ?? product.title,
        description,
        status: "ACTIVE",
        published: true,
        preorderEnabled: false,
        tags,
        minPrice: price,
        inventoryTotal: variants.reduce((sum, variant) => sum + variant.inventoryQuantity, 0),
      };

      let productId;
      if (existing) {
        const updated = await transaction.product.update({
          where: { id: existing.id },
          data: productData,
          select: { id: true },
        });
        productId = updated.id;
        await transaction.productVariant.deleteMany({ where: { productId } });
        await transaction.productVariant.createMany({
          data: variants.map((variant) => ({ ...variant, productId })),
        });
      } else {
        const created = await transaction.product.create({
          data: {
            handle: product.handle,
            ...productData,
            metric: { create: {} },
            images: { create: product.images },
            variants: { create: variants },
          },
          select: { id: true },
        });
        productId = created.id;
      }
    }

    await transaction.auditLog.create({
      data: {
        action: auditAction,
        actor: auditActor,
        details: {
          invoice: invoice.invoiceFile,
          invoiceDate: invoice.invoiceDate,
          priceMultiplier: invoice.priceMultiplier,
          productLines: invoice.products.length,
          variantCount,
          totalUnits,
          handles,
        },
      },
    });
  }, { timeout: 30000 });

  console.log(`Applied ${invoice.products.length} products, ${variantCount} variants, and ${totalUnits} units.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });