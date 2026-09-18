import { NextResponse } from "next/server";
import { isModuleEnabled, isRuntimeFeatureEnabled, type ProjectModuleKey } from "../../../packages/core/config";

const BACKEND_ORIGIN = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const MAX_API_BODY_BYTES = 1024 * 1024;

type ApiRequirement =
  | { module: ProjectModuleKey }
  | { feature: Parameters<typeof isRuntimeFeatureEnabled>[0] };

function getApiRequirements(targetPath: string): ApiRequirement[] {
  if (targetPath === "catalog/products" || targetPath.startsWith("catalog/products/")) {
    return [{ module: "catalog" }];
  }
  if (targetPath === "cart/checkout") {
    return [{ module: "checkout" }];
  }
  if (targetPath === "reviews/moderate" || targetPath === "reviews/moderate/bulk") {
    return [{ module: "reviews" }, { feature: "reviewModeration" }];
  }
  if (targetPath === "reviews" || targetPath.startsWith("reviews/")) {
    return [{ module: "reviews" }];
  }
  if (targetPath === "contact") {
    return [{ feature: "contactForm" }];
  }
  if (targetPath === "events") {
    return [{ module: "analytics" }, { feature: "analytics" }];
  }
  if (targetPath.startsWith("auth/") || targetPath.startsWith("account/")) {
    return [{ module: "customerAccount" }];
  }
  if (targetPath.startsWith("delivery/")) {
    return [{ module: "delivery" }];
  }
  if (targetPath.startsWith("admin/") || targetPath === "admin") {
    return [{ module: "admin" }];
  }
  if (targetPath === "webhooks/payments" || targetPath.startsWith("webhooks/payments/")) {
    return [{ module: "checkout" }];
  }
  if (targetPath.startsWith("webhooks/deliveries/")) {
    return [{ module: "delivery" }];
  }
  return [];
}

function isApiEnabled(targetPath: string) {
  return getApiRequirements(targetPath).every((requirement) =>
    "module" in requirement
      ? isModuleEnabled(requirement.module)
      : isRuntimeFeatureEnabled(requirement.feature),
  );
}

async function proxy(request: Request, params: Promise<{ path: string[] }>) {
  const { path } = await params;
  const url = new URL(request.url);
  const targetPath = Array.isArray(path) ? path.join("/") : "";

  if (!isApiEnabled(targetPath)) {
    return NextResponse.json({ error: "This feature is not enabled" }, { status: 404 });
  }

  const targetUrl = new URL(`/api/${targetPath}${url.search}`, BACKEND_ORIGIN);

  const headers = new Headers(request.headers);
  headers.delete("host");
  const isPublicCatalogGet = request.method.toUpperCase() === "GET"
    && (targetPath === "catalog/products" || targetPath.startsWith("catalog/products/"));

  let body: string | undefined;
  if (!["GET", "HEAD"].includes(request.method.toUpperCase())) {
    const declaredLength = Number.parseInt(headers.get("content-length") || "0", 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_API_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }

    body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_API_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
  }

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    ...(isPublicCatalogGet ? { next: { revalidate: 60 } } : { cache: "no-store" }),
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  if (isPublicCatalogGet && response.ok) {
    responseHeaders.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function OPTIONS(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}