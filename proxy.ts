import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const locale = request.nextUrl.pathname.startsWith("/en/") || request.nextUrl.pathname === "/en"
    ? "en"
    : "es";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-slowfit-locale", locale);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/es/:path*", "/en/:path*"],
};