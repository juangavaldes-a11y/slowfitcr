import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { defaultLocale, getPreferredLocale, isLocale } from "./app/i18n";

export function proxy(request: NextRequest) {
  const { pathname, search, hash } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname.includes(".")) {
    return NextResponse.next();
  }

  const pathnameParts = pathname.split("/").filter(Boolean);
  const localeFromPath = pathnameParts[0];

  if (!localeFromPath) {
    const locale = getPreferredLocale(request.headers.get("accept-language"));
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}`;
    url.search = search;
    url.hash = hash;
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    "x-slowfit-locale",
    isLocale(localeFromPath) ? localeFromPath : defaultLocale,
  );

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};