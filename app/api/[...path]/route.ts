import { NextResponse } from "next/server";

const BACKEND_ORIGIN = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const MAX_API_BODY_BYTES = 1024 * 1024;

async function proxy(request: Request, params: Promise<{ path: string[] }>) {
  const { path } = await params;
  const url = new URL(request.url);
  const targetPath = Array.isArray(path) ? path.join("/") : "";
  const targetUrl = new URL(`/api/${targetPath}${url.search}`, BACKEND_ORIGIN);

  const headers = new Headers(request.headers);
  headers.delete("host");

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
    cache: "no-store",
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

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