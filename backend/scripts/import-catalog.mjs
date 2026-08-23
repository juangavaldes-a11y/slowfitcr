import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { mergeCatalogGenderTags } from "./catalog-gender.mjs";

const prisma = new PrismaClient();
const defaultManifestUrl = new URL("../data/catalog-products.json", import.meta.url);
const manifestPath = process.env.CATALOG_IMPORT_PATH || fileURLToPath(defaultManifestUrl);
const dryRun = process.argv.includes("--dry-run");

function validateProduct(product, index) {
  const label = `Product ${index + 1}`;
  if (!product.title || !product.handle || !Array.isArray(product.variants) || !product.variants.length) {
    throw new Error(`${label} is missing required catalog fields`);
  }
  if (product.status !== "DRAFT" || product.published || product.preorderEnabled) {
    throw new Error(`${label} must remain draft, unpublished, and unavailable for preorder`);
  }
  if (product.variants.some((variant) => variant.inventoryQuantity !== 0)) {
    throw new Error(`${label} must have zero inventory for every variant`);
  }
}

async function importProduct(product) {
  const existing = await prisma.product.findUnique({
    where: { handle: product.handle },
    select: { tags: true },
  });
  if (existing && !existing.tags.includes("pdf-import")) {
    throw new Error(`Refusing to overwrite non-imported product: ${product.handle}`);
  }

  const data = {
    title: product.title,
    description: product.description,
    status: "DRAFT",
    published: false,
    preorderEnabled: false,
    tags: mergeCatalogGenderTags(product.tags, product.source?.file),
  };
  const variants = product.variants.map((variant, position) => ({
    title: variant.title,
    size: variant.title,
    color: null,
    colorHex: null,
    sku: variant.sku,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    inventoryQuantity: 0,
    position,
  }));
  const images = product.images.map((image, position) => ({
    url: image.url,
    altText: image.altText,
    position,
  }));

  await prisma.product.upsert({
    where: { handle: product.handle },
    create: {
      handle: product.handle,
      ...data,
      minPrice: Math.min(...variants.map((variant) => variant.price)),
      inventoryTotal: 0,
      metric: { create: {} },
      variants: { create: variants },
      images: { create: images },
    },
    update: {
      ...data,
      minPrice: Math.min(...variants.map((variant) => variant.price)),
      inventoryTotal: 0,
      metric: { upsert: { create: {}, update: {} } },
      variants: { deleteMany: {}, create: variants },
      images: { deleteMany: {}, create: images },
    },
  });
}

async function importProductWithRetry(product) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await importProduct(product);
      return;
    } catch (error) {
      if (!["P1001", "P1017"].includes(error?.code) || attempt === 3) {
        throw error;
      }
      await prisma.$disconnect();
      await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 500));
    }
  }
}

async function main() {
  const products = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(products) || !products.length) {
    throw new Error("Catalog manifest must contain at least one product");
  }
  products.forEach(validateProduct);

  if (dryRun) {
    console.log(`Validated ${products.length} draft products from ${manifestPath}.`);
    return;
  }

  for (const [index, product] of products.entries()) {
    await importProductWithRetry(product);
    if ((index + 1) % 100 === 0 || index + 1 === products.length) {
      console.log(`Imported ${index + 1}/${products.length} products.`);
    }
  }
  await prisma.auditLog.create({
    data: {
      action: "catalog.pdf_imported",
      actor: "catalog-import",
      details: { products: products.length, manifestPath },
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });