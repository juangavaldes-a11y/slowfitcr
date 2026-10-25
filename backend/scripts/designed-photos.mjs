import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Photos cropped from the designed catalog (tools/catalog-import/extract_new_catalog.py).
//   node scripts/designed-photos.mjs upload [--dry-run]   copies them to R2 under products/catalog-photos/ (skips existing)
//   node scripts/designed-photos.mjs apply  [--dry-run]   adds them as ProductImage rows (skips URLs already present)
// SLW-NNN is the Nth product of data/sammy-invoice-2026-09-18.json, the same order the catalog export numbers products in.
const photosDir = new URL("../../public/slowfit/catalog-photos/", import.meta.url);
const invoiceUrl = new URL("../data/sammy-invoice-2026-09-18.json", import.meta.url);
const [mode] = process.argv.slice(2);
const dryRun = process.argv.includes("--dry-run");

const required = (name) => {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const manifest = JSON.parse(await readFile(new URL("manifest.json", photosDir), "utf8"));
const photos = Object.entries(manifest).flatMap(([code, { colors }]) => colors.flatMap((color) => color.photos.map((file) => ({ code, color: color.raw, file }))));
const keyOf = (file) => `products/catalog-photos/${file}`;

async function upload() {
  console.log(`${photos.length} photos from ${Object.keys(manifest).length} products.`);
  if (dryRun) return;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY") },
  });
  const bucket = required("R2_BUCKET_NAME");
  const queue = [...photos];
  let uploaded = 0;
  let skipped = 0;
  const worker = async () => {
    for (let photo = queue.shift(); photo; photo = queue.shift()) {
      const exists = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: keyOf(photo.file) })).then(() => true, (error) => {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return false;
        throw error;
      });
      if (exists) {
        skipped += 1;
        continue;
      }
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: keyOf(photo.file),
        Body: await readFile(new URL(photo.file, photosDir)),
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=31536000, immutable",
      }));
      uploaded += 1;
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`Uploaded ${uploaded}; skipped ${skipped} already in R2.`);
}

async function apply() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const publicUrl = required("R2_PUBLIC_URL").replace(/\/$/, "");
    const { products } = JSON.parse(await readFile(invoiceUrl, "utf8"));
    let added = 0;
    let present = 0;
    for (const [code, { colors }] of Object.entries(manifest)) {
      const handle = products[Number(code.slice(4)) - 1]?.handle;
      const product = handle && (await prisma.product.findUnique({ where: { handle }, select: { id: true, images: { select: { url: true, position: true } } } }));
      if (!product) {
        console.warn(`${code}: product ${handle ?? "?"} not found, skipped.`);
        continue;
      }
      const known = new Set(product.images.map((image) => image.url));
      let position = Math.max(-1, ...product.images.map((image) => image.position)) + 1;
      for (const color of colors) {
        for (const file of color.photos) {
          const url = `${publicUrl}/${keyOf(file)}`;
          if (known.has(url)) {
            present += 1;
          } else if (!dryRun) {
            await prisma.productImage.create({ data: { productId: product.id, url, altText: `${code} ${color.label}`, color: color.raw, position: position++ } });
            added += 1;
          } else {
            added += 1;
          }
        }
      }
    }
    console.log(`${dryRun ? "Would add" : "Added"} ${added} images; ${present} already present.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (mode === "upload") await upload();
else if (mode === "apply") await apply();
else throw new Error("Usage: designed-photos.mjs upload|apply [--dry-run]");
