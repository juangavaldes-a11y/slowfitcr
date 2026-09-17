import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Cormorant_Garamond, Questrial } from "next/font/google";
import { headers } from "next/headers";
import "antd/dist/reset.css";
import "./globals.css";
import Analytics from "./analytics";
import { getPreferredLocale } from "./i18n";
import Providers from "./providers";
import { projectConfig } from "../packages/core/config";

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
  metadataBase: new URL("https://slowfitcr.com"),
  title: {
    default: `${projectConfig.brand.name} CR | Ropa deportiva en Costa Rica`,
    template: `%s | ${projectConfig.brand.name} CR`,
  },
  description:
    `Ropa deportiva y accesorios para entrenar y vivir con propósito en Costa Rica. Compra las colecciones de ${projectConfig.brand.name} CR en línea.`,
  applicationName: `${projectConfig.brand.name} CR`,
  category: "Ropa deportiva",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = getPreferredLocale((await headers()).get("accept-language"));

  return (
    <html lang={locale} className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        <AntdRegistry>
          <Analytics />
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
