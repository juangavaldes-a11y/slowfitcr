"use client";

import { LockOutlined, LogoutOutlined, ShoppingOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Form, Input, Space, Spin, Tabs, Tag, Typography } from "antd";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "./i18n";

type Customer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  locale: Locale;
};

type Order = {
  id: string;
  orderNumber: string | null;
  name: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  total: string | null;
  currency: string | null;
  items: Array<{ title?: string; quantity?: number }>;
  shopifyCreatedAt: string | null;
  updatedAt: string;
};

type AccountPanelProps = {
  locale: Locale;
};

async function apiRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

export default function AccountPanel({ locale }: AccountPanelProps) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const labels = locale === "es"
    ? {
        kicker: "Cuenta Slow Fit",
        title: "Tu progreso, también fuera del entrenamiento.",
        intro: "Guarda tus datos y consulta el estado de tus pedidos en un solo lugar.",
        login: "Iniciar sesión",
        register: "Crear cuenta",
        admin: "Administración",
        email: "Correo",
        password: "Contraseña",
        firstName: "Nombre",
        lastName: "Apellido (opcional)",
        submitLogin: "Entrar",
        submitRegister: "Crear mi cuenta",
        adminToken: "Token de administración",
        adminSubmit: "Entrar al panel",
        passwordHint: "Usa al menos 8 caracteres.",
        adminHint: "Acceso reservado para el equipo de Slow Fit.",
        profile: "Tu perfil",
        orders: "Tus pedidos",
        noOrders: "Tus pedidos aparecerán aquí cuando Shopify confirme la compra con este correo.",
        paid: "Pago",
        fulfillment: "Entrega",
        items: "artículos",
        signOut: "Cerrar sesión",
        shop: "Seguir comprando",
        required: "Este campo es obligatorio.",
        invalidEmail: "Ingresa un correo válido.",
      }
    : {
        kicker: "Slow Fit account",
        title: "Your progress, beyond training.",
        intro: "Save your details and check your order status in one place.",
        login: "Sign in",
        register: "Create account",
        admin: "Admin",
        email: "Email",
        password: "Password",
        firstName: "First name",
        lastName: "Last name (optional)",
        submitLogin: "Sign in",
        submitRegister: "Create my account",
        adminToken: "Admin token",
        adminSubmit: "Open admin panel",
        passwordHint: "Use at least 8 characters.",
        adminHint: "Reserved for the Slow Fit team.",
        profile: "Your profile",
        orders: "Your orders",
        noOrders: "Orders will appear here when Shopify confirms a purchase using this email.",
        paid: "Payment",
        fulfillment: "Delivery",
        items: "items",
        signOut: "Sign out",
        shop: "Continue shopping",
        required: "This field is required.",
        invalidEmail: "Enter a valid email.",
      };

  async function loadOrders() {
    const payload = await apiRequest("/api/account/orders");
    setOrders(payload.orders || []);
  }

  useEffect(() => {
    let active = true;
    apiRequest("/api/auth/session")
      .then(async (payload) => {
        if (!active) return;
        setCustomer(payload.customer);
        const orderPayload = await apiRequest("/api/account/orders");
        if (active) setOrders(orderPayload.orders || []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submitCustomer(path: string, values: Record<string, string>) {
    setLoading(true);
    setError("");
    try {
      const payload = await apiRequest(path, {
        method: "POST",
        body: JSON.stringify({ ...values, locale }),
      });
      setCustomer(payload.customer);
      await loadOrders();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function submitAdmin(values: { token: string }) {
    setLoading(true);
    setError("");
    try {
      await apiRequest("/api/admin/login", { method: "POST", body: JSON.stringify(values) });
      window.location.assign(`/${locale}/admin/reviews`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed");
      setLoading(false);
    }
  }

  async function signOut() {
    await apiRequest("/api/auth/logout", { method: "POST" });
    setCustomer(null);
    setOrders([]);
  }

  if (checking) {
    return <div className="slowfit-account-loading"><Spin size="large" /></div>;
  }

  if (customer) {
    return (
      <main className="slowfit-policy-page">
        <section className="slowfit-shell slowfit-account-header">
          <div>
            <span className="slowfit-kicker">{labels.kicker}</span>
            <Typography.Title className="slowfit-display slowfit-section-title">
              {customer.firstName}
            </Typography.Title>
            <Typography.Text>{customer.email}</Typography.Text>
          </div>
          <Space wrap>
            <Link href={`/${locale}/shop`}><Button icon={<ShoppingOutlined />}>{labels.shop}</Button></Link>
            <Button icon={<LogoutOutlined />} onClick={() => void signOut()}>{labels.signOut}</Button>
          </Space>
        </section>

        <section className="slowfit-shell slowfit-account-dashboard">
          <aside className="slowfit-account-profile">
            <UserOutlined />
            <Typography.Title level={3}>{labels.profile}</Typography.Title>
            <Typography.Text strong>{[customer.firstName, customer.lastName].filter(Boolean).join(" ")}</Typography.Text>
            <Typography.Text>{customer.email}</Typography.Text>
          </aside>
          <div className="slowfit-account-orders">
            <Typography.Title level={2} className="slowfit-display">{labels.orders}</Typography.Title>
            {!orders.length ? <Empty description={labels.noOrders} /> : orders.map((order) => (
              <article className="slowfit-order-row" key={order.id}>
                <div>
                  <Typography.Title level={4}>{order.name || `#${order.orderNumber || order.id}`}</Typography.Title>
                  <Typography.Text type="secondary">
                    {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(order.shopifyCreatedAt || order.updatedAt))}
                  </Typography.Text>
                </div>
                <div className="slowfit-order-status">
                  <span>{labels.paid}: <Tag>{order.financialStatus || "pending"}</Tag></span>
                  <span>{labels.fulfillment}: <Tag color={order.fulfillmentStatus === "fulfilled" ? "green" : "gold"}>{order.fulfillmentStatus || "unfulfilled"}</Tag></span>
                </div>
                <Typography.Text strong>{order.total ? `${order.total} ${order.currency || ""}` : ""}</Typography.Text>
                <Typography.Text>{Array.isArray(order.items) ? order.items.length : 0} {labels.items}</Typography.Text>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const emailRules = [
    { required: true, message: labels.required },
    { type: "email" as const, message: labels.invalidEmail },
  ];
  const passwordRules = [
    { required: true, message: labels.required },
    { min: 8, message: labels.passwordHint },
  ];

  return (
    <main className="slowfit-account-page">
      <section className="slowfit-account-media">
        <Image src="/slowfit/performance-collection.jpg" alt="Slow Fit Performance Collection" fill priority sizes="(max-width: 900px) 100vw, 48vw" className="slowfit-cover" />
      </section>
      <section className="slowfit-account-access">
        <div className="slowfit-account-access-inner">
          <Link href={`/${locale}`} className="slowfit-kicker">Slow Fit CR</Link>
          <Typography.Title className="slowfit-display slowfit-account-title">{labels.title}</Typography.Title>
          <Typography.Paragraph className="slowfit-policy-lead">{labels.intro}</Typography.Paragraph>
          {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError("")} /> : null}
          <Tabs
            items={[
              {
                key: "login",
                label: labels.login,
                children: (
                  <Form layout="vertical" onFinish={(values) => void submitCustomer("/api/auth/login", values)}>
                    <Form.Item name="email" label={labels.email} rules={emailRules}><Input prefix={<UserOutlined />} autoComplete="email" /></Form.Item>
                    <Form.Item name="password" label={labels.password} rules={passwordRules}><Input.Password prefix={<LockOutlined />} autoComplete="current-password" /></Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading} block>{labels.submitLogin}</Button>
                  </Form>
                ),
              },
              {
                key: "register",
                label: labels.register,
                children: (
                  <Form layout="vertical" onFinish={(values) => void submitCustomer("/api/auth/register", values)}>
                    <div className="slowfit-account-name-grid">
                      <Form.Item name="firstName" label={labels.firstName} rules={[{ required: true, message: labels.required }]}><Input autoComplete="given-name" /></Form.Item>
                      <Form.Item name="lastName" label={labels.lastName}><Input autoComplete="family-name" /></Form.Item>
                    </div>
                    <Form.Item name="email" label={labels.email} rules={emailRules}><Input prefix={<UserOutlined />} autoComplete="email" /></Form.Item>
                    <Form.Item name="password" label={labels.password} extra={labels.passwordHint} rules={passwordRules}><Input.Password prefix={<LockOutlined />} autoComplete="new-password" /></Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading} block>{labels.submitRegister}</Button>
                  </Form>
                ),
              },
              {
                key: "admin",
                label: labels.admin,
                children: (
                  <Form layout="vertical" onFinish={(values) => void submitAdmin(values)}>
                    <Typography.Paragraph>{labels.adminHint}</Typography.Paragraph>
                    <Form.Item name="token" label={labels.adminToken} rules={[{ required: true, message: labels.required }]}><Input.Password prefix={<LockOutlined />} autoComplete="off" /></Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading} block>{labels.adminSubmit}</Button>
                  </Form>
                ),
              },
            ]}
          />
        </div>
      </section>
    </main>
  );
}