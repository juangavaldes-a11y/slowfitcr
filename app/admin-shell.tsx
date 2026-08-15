"use client";

import { Button, Form, Input, Space, Typography } from "antd";
import Link from "next/link";
import type { ReactNode } from "react";

type AdminShellProps = {
  locale: "es" | "en";
  title: string;
  subtitle: string;
  sessionReady: boolean;
  authorized: boolean;
  loginLoading: boolean;
  onLogin: (values: { token: string }) => Promise<void>;
  onLogout: () => Promise<void>;
  children: ReactNode;
};

export default function AdminShell({
  locale,
  title,
  subtitle,
  sessionReady,
  authorized,
  loginLoading,
  onLogin,
  onLogout,
  children,
}: AdminShellProps) {
  const labels = locale === "es"
    ? {
        reviews: "Resenas",
        operations: "Operaciones",
        authTitle: "Acceso de moderacion",
        authCopy: "La sesion permanece activa hasta que expire o cierres sesion.",
        token: "Token de moderacion",
        signIn: "Entrar",
        signOut: "Salir",
        checking: "Verificando sesion...",
        required: "Ingresa el token de moderacion.",
      }
    : {
        reviews: "Reviews",
        operations: "Operations",
        authTitle: "Moderation access",
        authCopy: "Your session remains active until it expires or you sign out.",
        token: "Moderation token",
        signIn: "Sign in",
        signOut: "Sign out",
        checking: "Checking session...",
        required: "Enter the moderation token.",
      };

  return (
    <main className="slowfit-policy-page">
      <section className="slowfit-shell slowfit-policy-hero">
        <span className="slowfit-kicker">Slow Fit Admin</span>
        <Typography.Title className="slowfit-display slowfit-section-title">{title}</Typography.Title>
        <Typography.Paragraph className="slowfit-policy-lead">{subtitle}</Typography.Paragraph>
      </section>

      <section className="slowfit-shell slowfit-policy-section">
        <Space className="slowfit-admin-nav" wrap>
          <Space wrap>
            <Link href={`/${locale}/admin/reviews`}>
              <Button>{labels.reviews}</Button>
            </Link>
            <Link href={`/${locale}/admin/ops`}>
              <Button>{labels.operations}</Button>
            </Link>
          </Space>
          {authorized ? <Button onClick={() => void onLogout()}>{labels.signOut}</Button> : null}
        </Space>

        {!sessionReady ? (
          <article className="slowfit-policy-card slowfit-admin-auth-card">
            <Typography.Title level={4}>{labels.checking}</Typography.Title>
          </article>
        ) : !authorized ? (
          <article className="slowfit-policy-card slowfit-admin-auth-card">
            <Typography.Title level={4}>{labels.authTitle}</Typography.Title>
            <Typography.Paragraph className="slowfit-policy-lead">{labels.authCopy}</Typography.Paragraph>
            <Form layout="vertical" onFinish={onLogin}>
              <Form.Item name="token" label={labels.token} rules={[{ required: true, message: labels.required }]}>
                <Input.Password autoComplete="off" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={loginLoading}>
                {labels.signIn}
              </Button>
            </Form>
          </article>
        ) : children}
      </section>
    </main>
  );
}