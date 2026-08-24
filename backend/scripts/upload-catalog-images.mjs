import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { access, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const manifestUrl = new URL("../data/catalog-products.json", import.meta.url);
const manifestPath = process.env.CATALOG_IMPORT_PATH || fileURLToPath(manifestUrl);
const assetsDirectory = fileURLToPath(new URL("../../public/slowfit/catalog-products/", import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const concurrency = 8;

function requiredEnvironment(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function objectExists(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") {
      return false;
    }
    throw error;
  }
}

async function main() {
  const products = JSON.parse(await readFile(manifestPath, "utf8"));
  const images = products.flatMap((product) => product.images);
  const files = new Map(images.map((image) => {
    const fileName = basename(new URL(image.url).pathname);
    return [fileName, { fileName, path: join(assetsDirectory, fileName), key: `products/pdf-import/${fileName}` }];
  }));
  const entries = [...files.values()];
  await Promise.all(entries.map((entry) => access(entry.path)));

  if (dryRun) {
    console.log(`Ready to upload ${entries.length} catalog images.`);
    return;
  }

  const accountId = requiredEnvironment("R2_ACCOUNT_ID");
  const accessKeyId = requiredEnvironment("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnvironment("R2_SECRET_ACCESS_KEY");
  const bucket = requiredEnvironment("R2_BUCKET_NAME");
  const publicUrl = requiredEnvironment("R2_PUBLIC_URL").replace(/\/$/, "");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  let completed = 0;
  let uploaded = 0;
  let skipped = 0;

  async function worker() {
    while (entries.length) {
      const entry = entries.shift();
      if (!entry) {
        return;
      }
      if (!force && await objectExists(client, bucket, entry.key)) {
        skipped += 1;
      } else {
        await client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: entry.key,
          Body: await readFile(entry.path),
          ContentType: "image/webp",
          CacheControl: "public, max-age=31536000, immutable",
        }));
        uploaded += 1;
      }
      completed += 1;
      if (completed % 100 === 0 || completed === files.size) {
        console.log(`Processed ${completed}/${files.size} images.`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  for (const image of images) {
    const fileName = basename(new URL(image.url).pathname);
    image.url = `${publicUrl}/products/pdf-import/${fileName}`;
  }
  const temporaryPath = `${manifestPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  await rename(temporaryPath, manifestPath);
  console.log(`Uploaded ${uploaded} images; skipped ${skipped} existing images; updated ${manifestPath}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});