import type { NextConfig } from "next";

const developmentScriptSources = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
const developmentConnectSources = process.env.NODE_ENV === "development" ? " ws: http:" : "";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: https:",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${developmentScriptSources} https://www.googletagmanager.com`,
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self'${developmentConnectSources} https://www.google-analytics.com https://*.google-analytics.com https://*.r2.cloudflarestorage.com`,
  "upgrade-insecure-requests",
].join("; ");

function hostnameOf(urlString?: string) {
  if (!urlString) return undefined;
  try {
    return new URL(urlString).hostname;
  } catch {
    return undefined;
  }
}

const r2Hostname = hostnameOf(process.env.R2_PUBLIC_URL);
const testImageHost = process.env.TEST_IMAGE_HOST;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // In e2e tests, images point at a fake host; skip server-side optimization so a failed
    // upstream fetch doesn't crash rendering (a broken <img> is fine, a thrown fetch is not).
    unoptimized: Boolean(testImageHost),
    remotePatterns: [
      ...(r2Hostname ? [{ protocol: "https" as const, hostname: r2Hostname }] : []),
      { protocol: "https" as const, hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https" as const, hostname: "*.r2.dev" },
      ...(testImageHost ? [{ protocol: "https" as const, hostname: testImageHost }] : []),
    ],
  },
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
