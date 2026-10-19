import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const LOCAL_IMAGE_DIR = path.join(process.cwd(), "public", "slowfit", "catalog-products");
const FETCH_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

async function readLocal(url: string) {
  const name = decodeURIComponent(url.split("?")[0].split("/").pop() ?? "");
  if (!name || name.includes("..")) return null;
  return fs.readFile(path.join(LOCAL_IMAGE_DIR, name)).catch(() => null);
}

// Remote product photos first; the repo's local copy of the same file is the fallback.
export async function loadCatalogImage(url: string): Promise<Buffer | null> {
  if (/^https:\/\//i.test(url)) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength <= MAX_IMAGE_BYTES) return bytes;
      }
    } catch {
      // fall through to the local copy
    }
  }
  return readLocal(url);
}

// Crops to the box like CSS object-fit: cover and re-encodes as JPEG (the product photos are WebP, which PDF cannot embed).
export async function fitCatalogImage(bytes: Buffer, width: number, height: number): Promise<Buffer | null> {
  try {
    return await sharp(bytes).resize(Math.round(width * 3), Math.round(height * 3), { fit: "cover", position: "centre" }).flatten({ background: "#ede6e2" }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return null;
  }
}
