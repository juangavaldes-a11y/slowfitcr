"use client";

import { LinkOutlined } from "@ant-design/icons";
import { Button, Space, Typography, message } from "antd";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import AdminShell from "./admin-shell";
import { apiRequest, formatApiError } from "./lib/api-client";

// Loyverse sends X-Frame-Options: sameorigin on its login, so it cannot be embedded; the POS opens in its own tab.
const LOYVERSE_BACK_OFFICE_URL = "https://r.loyverse.com/dashboard/";

export default function PosPanel({ locale }: { locale: "es" | "en" }) {
  const [api, contextHolder] = message.useMessage();
  const [sessionReady, setSessionReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const es = locale === "es";

  const labels = useMemo(() => es ? {
    title: "Punto de venta",
    subtitle: "Ventas en tienda con Loyverse, sincronizadas con el inventario del sitio.",
    open: "Abrir Loyverse",
    whyTitle: "Por que se abre en otra pestana",
    why: "Loyverse no permite mostrarse dentro de otro sitio, asi que el punto de venta se abre en su propia pestana. Inicia sesion ahi con tu cuenta de Loyverse.",
    syncTitle: "Sincronizacion",
    sync: "Las ordenes pagadas en el sitio descuentan existencias en Loyverse, y las ventas de Loyverse descuentan el inventario del sitio. Las variantes se enlazan por SKU, por eso cada variante necesita uno.",
    manage: "Sincronizar el catalogo con Loyverse se hace desde Inventario y costos.",
  } : {
    title: "Point of sale",
    subtitle: "In-store sales with Loyverse, kept in sync with the site inventory.",
    open: "Open Loyverse",
    whyTitle: "Why it opens in another tab",
    why: "Loyverse does not allow itself to be shown inside another site, so the point of sale opens in its own tab. Sign in there with your Loyverse account.",
    syncTitle: "Sync",
    sync: "Paid website orders reduce stock in Loyverse, and Loyverse sales reduce the site inventory. Variants are matched by SKU, so every variant needs one.",
    manage: "Syncing the catalog with Loyverse is done from Inventory & costs.",
  }, [es]);

  const checkSession = async () => {
    try {
      const session = await apiRequest<{ authenticated: boolean }>("/api/admin/session", { cache: "no-store" });
      setAuthorized(session.authenticated);
    } catch {
      setAuthorized(false);
    } finally {
      setSessionReady(true);
    }
  };

  const checkInitial = useEffectEvent(() => checkSession());
  useEffect(() => {
    const timeout = window.setTimeout(() => void checkInitial(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const onLogin = async (credentials: { token?: string; email?: string; password?: string; otp?: string }) => {
    setLoginLoading(true);
    try {
      await apiRequest("/api/admin/login", { method: "POST", body: JSON.stringify(credentials) });
      await checkSession();
    } catch (error) {
      api.error(formatApiError(error, locale, { preserveClientMessage: false }));
    } finally {
      setLoginLoading(false);
      setSessionReady(true);
    }
  };

  const onLogout = async () => {
    await apiRequest("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    setAuthorized(false);
  };

  return (
    <>
      {contextHolder}
      <AdminShell locale={locale} title={labels.title} subtitle={labels.subtitle}
        sessionReady={sessionReady} authorized={authorized} loginLoading={loginLoading}
        onLogin={onLogin} onLogout={onLogout}>
        <section className="slowfit-policy-card slowfit-admin-card">
          <Space orientation="vertical" size={16}>
            <Button type="primary" size="large" icon={<LinkOutlined />} href={LOYVERSE_BACK_OFFICE_URL} target="_blank" rel="noopener noreferrer">
              {labels.open}
            </Button>
            <div>
              <Typography.Title level={5}>{labels.whyTitle}</Typography.Title>
              <Typography.Paragraph>{labels.why}</Typography.Paragraph>
            </div>
            <div>
              <Typography.Title level={5}>{labels.syncTitle}</Typography.Title>
              <Typography.Paragraph>{labels.sync}</Typography.Paragraph>
              <Typography.Paragraph type="secondary">{labels.manage}</Typography.Paragraph>
            </div>
          </Space>
        </section>
      </AdminShell>
    </>
  );
}
