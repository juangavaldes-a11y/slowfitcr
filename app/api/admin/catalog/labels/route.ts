import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { backendJson, UpstreamError } from "../../../../lib/admin-backend";
import { labelFits, MAX_LABELS, renderLabelsPdf, type LabelFormat, type LabelItem } from "../../../../lib/barcode-labels/render";
import { isCode128Encodable } from "../../../../lib/barcode-labels/code128";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCT_PAGE_SIZE = 100;
const MAX_PRODUCT_PAGES = 20;
const MAX_COPIES = 500;

type Variant = { sku?: string | null; size?: string | null; color?: string | null; price: number; inventoryQuantity: number };
type Product = { id: string; title: string; variants: Variant[] };

async function loadProducts(request: NextRequest) {
  const products: Product[] = [];
  for (let page = 1; page <= MAX_PRODUCT_PAGES; page += 1) {
    const data = await backendJson<{ products: Product[]; total: number }>(request, `/api/admin/catalog/products?page=${page}&pageSize=${PRODUCT_PAGE_SIZE}`);
    products.push(...data.products);
    if (products.length >= data.total || !data.products.length) break;
  }
  return products;
}

const failure = (message: string, status: number) => NextResponse.json({ success: false, message }, { status });

// Body: { productIds?: string[], format: "thermal" | "a4", copies: number, perStock: boolean }.
// With no productIds every product is printed. With perStock, each variant prints as many labels as it has units in stock.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const format: LabelFormat = body.format === "a4" ? "a4" : "thermal";
    const productIds = Array.isArray(body.productIds) ? new Set(body.productIds.map(String)) : null;
    const perStock = body.perStock === true;
    const copies = Math.min(MAX_COPIES, Math.max(1, Math.floor(Number(body.copies) || 1)));

    const products = await loadProducts(request);
    const items: LabelItem[] = [];
    const skipped = new Set<string>();
    for (const product of products) {
      if (productIds && !productIds.has(product.id)) continue;
      for (const variant of product.variants) {
        const sku = String(variant.sku ?? "").trim();
        const count = perStock ? Math.min(MAX_COPIES, variant.inventoryQuantity) : copies;
        if (count < 1) continue;
        if (!sku || !isCode128Encodable(sku) || !labelFits(sku, format)) {
          skipped.add(`${product.title}${variant.size ? ` (${variant.size})` : ""}`);
          continue;
        }
        items.push({ sku, name: product.title, size: variant.size, color: variant.color, price: variant.price, copies: count });
      }
    }
    if (!items.length) return failure("Ninguna variante seleccionada tiene un SKU válido para imprimir.", 409);
    if (items.reduce((total, item) => total + item.copies, 0) > MAX_LABELS) {
      return failure(`Máximo ${MAX_LABELS} etiquetas por impresión.`, 413);
    }

    const pdf = await renderLabelsPdf(items, format);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="Etiquetas_Slow.pdf"',
        "Cache-Control": "no-store",
        "X-Labels-Skipped": String(skipped.size),
      },
    });
  } catch (error) {
    if (error instanceof UpstreamError && (error.status === 401 || error.status === 403)) return failure("Unauthorized", 401);
    console.error("Error generating labels:", error);
    return failure("Failed to generate labels", 500);
  }
}
