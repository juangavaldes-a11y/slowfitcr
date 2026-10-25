import type { NextRequest } from "next/server";

const BACKEND_ORIGIN = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";

export class UpstreamError extends Error {
  constructor(public status: number) {
    super(`UPSTREAM_${status}`);
  }
}

// The admin session cookie is forwarded so the backend decides who may read the data.
export async function backendJson<T>(request: NextRequest, pathAndQuery: string): Promise<T> {
  const response = await fetch(new URL(pathAndQuery, BACKEND_ORIGIN), { headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store" });
  if (!response.ok) throw new UpstreamError(response.status);
  return (await response.json()) as T;
}
