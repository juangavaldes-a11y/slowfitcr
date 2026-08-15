"use client";

import { HomeOutlined, ReloadOutlined, ShoppingOutlined } from "@ant-design/icons";
import { Button, Space, Typography } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";

type ErrorRecoveryProps = {
  kind: "error" | "not-found";
  reset?: () => void;
};

export default function ErrorRecovery({ kind, reset }: ErrorRecoveryProps) {
  const pathname = usePathname();
  const locale = pathname === "/en" || pathname.startsWith("/en/") ? "en" : "es";
  const labels = locale === "es"
    ? {
        kicker: kind === "error" ? "Algo salió mal" : "Página no encontrada",
        title: kind === "error" ? "No pudimos completar esta solicitud." : "Esta página no está disponible.",
        description: kind === "error"
          ? "Intenta de nuevo. Si el problema continúa, vuelve al inicio para seguir navegando."
          : "El enlace puede haber cambiado o la página ya no existe.",
        retry: "Intentar de nuevo",
        home: "Volver al inicio",
        shop: "Ir a la tienda",
      }
    : {
        kicker: kind === "error" ? "Something went wrong" : "Page not found",
        title: kind === "error" ? "We could not complete this request." : "This page is not available.",
        description: kind === "error"
          ? "Try again. If the problem continues, return home to keep browsing."
          : "The link may have changed or the page may no longer exist.",
        retry: "Try again",
        home: "Return home",
        shop: "Go to shop",
      };

  return (
    <main className="slowfit-recovery-page">
      <section className="slowfit-recovery-content" aria-labelledby="recovery-title">
        <span className="slowfit-kicker">{labels.kicker}</span>
        <Typography.Title id="recovery-title" className="slowfit-display slowfit-recovery-title">
          {labels.title}
        </Typography.Title>
        <Typography.Paragraph className="slowfit-policy-lead">
          {labels.description}
        </Typography.Paragraph>
        <Space wrap>
          {kind === "error" && reset ? (
            <Button type="primary" icon={<ReloadOutlined />} onClick={reset}>
              {labels.retry}
            </Button>
          ) : null}
          <Link href={`/${locale}`}>
            <Button icon={<HomeOutlined />}>{labels.home}</Button>
          </Link>
          <Link href={`/${locale}/shop`}>
            <Button icon={<ShoppingOutlined />}>{labels.shop}</Button>
          </Link>
        </Space>
      </section>
    </main>
  );
}