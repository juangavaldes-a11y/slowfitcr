"use client";

import { ConfigProvider } from "antd";
import type { PropsWithChildren } from "react";
import { projectConfig } from "../packages/core/config";
import { CartDock, CartProvider } from "./cart/cart-context";

export default function Providers({ children }: PropsWithChildren) {
  const theme = projectConfig.theme;

  return (
    <CartProvider>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: theme.primaryColor,
            colorInfo: theme.infoColor,
            colorText: theme.textColor,
            colorTextSecondary: theme.textSecondaryColor,
            colorBgBase: theme.bgBase,
            colorBorder: theme.borderColor,
            borderRadius: theme.borderRadius,
            fontFamily: theme.bodyFontVar,
          },
        }}
      >
        {children}
        {projectConfig.featureFlags.showCartDock ? <CartDock /> : null}
      </ConfigProvider>
    </CartProvider>
  );
}