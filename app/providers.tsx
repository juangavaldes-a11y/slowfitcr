"use client";

import { ConfigProvider } from "antd";
import type { PropsWithChildren } from "react";

export default function Providers({ children }: PropsWithChildren) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#b1a497",
          colorInfo: "#b1a497",
          colorText: "#2f2a28",
          colorTextSecondary: "#6d6968",
          colorBgBase: "#f5f0e8",
          colorBorder: "#d7d2cd",
          borderRadius: 18,
          fontFamily: "var(--font-body)",
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}