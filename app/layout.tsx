import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Cormorant_Garamond, Questrial } from "next/font/google";
import { headers } from "next/headers";
import "antd/dist/reset.css";
import "./globals.css";
import { defaultLocale, getPreferredLocale, isLocale } from "./i18n";
import Providers from "./providers";

const displayFont = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const bodyFont = Questrial({
  variable: "--font-body",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Slow Fit CR",
  description: "Responsive Ant Design rebuild of the Slow Fit Costa Rica landing page.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const localeFromPath = requestHeaders.get("x-slowfit-locale");
  const locale = localeFromPath && isLocale(localeFromPath)
    ? localeFromPath
    : getPreferredLocale(requestHeaders.get("accept-language")) ?? defaultLocale;

  return (
    <html lang={locale} className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
