import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { genderTagsForSource, mergeCatalogGenderTags } from "./catalog-gender.mjs";

const prisma = new PrismaClient();
const defaultManifestUrl = new URL("../data/catalog-products.json", import.meta.url);
const manifestPath = process.env.CATALOG_IMPORT_PATH || fileURLToPath(defaultManifestUrl);
const applyChanges = process.argv.includes("--apply");

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(manifest) || !manifest.length) {
    throw new Error("Catalog manifest must contain at least one product");
  }

  const assignments = new Map(manifest.map((product) => [product.handle, {
    sourceFile: product.source?.file,
    assignedTags: genderTagsForSource(product.source?.file),
  }]));
  if (assignments.size !== manifest.length) {
    throw new Error("Catalog manifest contains duplicate product handles");
  }

  const existingProducts = [];
  const handles = [...assignments.keys()];
  for (let index = 0; index < handles.length; index += 200) {
    existingProducts.push(...await prisma.product.findMany({
      where: { handle: { in: handles.slice(index, index + 200) } },
      select: { id: true, handle: true, tags: true },
    }));
  }

  const changes = existingProducts.flatMap((product) => {
    const tags = mergeCatalogGenderTags(product.tags, assignments.get(product.handle).sourceFile);
    return tags.join("\0") === product.tags.join("\0") ? [] : [{ id: product.id, tags }];
  });
  const missing = manifest.length - existingProducts.length;

  console.log(`${applyChanges ? "Applying" : "Dry run:"} ${changes.length} gender tag updates; ${existingProducts.length - changes.length} unchanged; ${missing} absent from the database.`);
  if (!applyChanges) {
    console.log("Run again with --apply to update tags only.");
    return;
  }

  for (let index = 0; index < changes.length; index += 100) {
    const batch = changes.slice(index, index + 100);
    await prisma.$transaction(batch.map((change) => prisma.product.update({
      where: { id: change.id },
      data: { tags: change.tags },
    })));
  }

  await prisma.auditLog.create({
    data: {
      action: "catalog.gender_tags_updated",
      actor: "catalog-tag-gender",
      details: { updated: changes.length, unchanged: existingProducts.length - changes.length, missing, manifestPath },
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