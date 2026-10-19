import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { buildCatalogEntries, type CatalogProductImages, type InventoryViewLine } from "../../../../lib/catalog-pdf/data";
import { renderCatalogPdf } from "../../../../lib/catalog-pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_ORIGIN = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const PRODUCT_PAGE_SIZE = 100;
const MAX_PRODUCT_PAGES = 20;

class UpstreamError extends Error {
  constructor(public status: number) {
    super(`UPSTREAM_${status}`);
  }
}

// The admin session cookie is forwarded so the backend decides who may read the inventory.
async function backendJson<T>(request: NextRequest, pathAndQuery: string): Promise<T> {
  const response = await fetch(new URL(pathAndQuery, BACKEND_ORIGIN), { headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store" });
  if (!response.ok) throw new UpstreamError(response.status);
  return (await response.json()) as T;
}

async function loadProductImages(request: NextRequest) {
  const products: CatalogProductImages[] = [];
  for (let page = 1; page <= MAX_PRODUCT_PAGES; page += 1) {
    const data = await backendJson<{ products: CatalogProductImages[]; total: number }>(request, `/api/admin/catalog/products?page=${page}&pageSize=${PRODUCT_PAGE_SIZE}`);
    products.push(...data.products.map(({ handle, images }) => ({ handle, images })));
    if (products.length >= data.total || !data.products.length) break;
  }
  return products;
}

export async function POST(request: NextRequest) {
  try {
    const [inventory, products] = await Promise.all([
      backendJson<{ lines: InventoryViewLine[] }>(request, "/api/admin/inventory"),
      loadProductImages(request),
    ]);
    const entries = buildCatalogEntries(inventory.lines, products);
    if (!entries.length) return NextResponse.json({ success: false, message: "No hay inventario disponible para el catálogo." }, { status: 409 });

    const pdf = await renderCatalogPdf(entries);

    // Keep the public download (linked from the shop) in sync; the export itself does not depend on it.
    await fs.writeFile(path.join(process.cwd(), "public", "slowfit", "catalog.pdf"), pdf).catch(() => undefined);

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="Catalogo_Slow.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof UpstreamError && (error.status === 401 || error.status === 403)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    console.error("Error generating catalog:", error);
    return NextResponse.json({ success: false, message: "Failed to generate catalog" }, { status: 500 });
  }
}
