"use client";

import { HeartFilled, LockOutlined, LogoutOutlined, ShoppingOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Collapse, Empty, Form, Input, Pagination, Rate, Space, Tabs, Tag, Typography } from "antd";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Locale } from "./i18n";
import { apiRequest, formatApiError, isApiErrorStatus } from "./lib/api-client";
import { getPublicProductTitle } from "./lib/product-presentation";

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
  paymentCreatedAt: string | null;
  updatedAt: string;
  delivery: {
    provider: string;
    status: string;
    feeMinor: number;
    currency: string;
    dropoffEta: string | null;
    trackingUrl: string | null;
  } | null;
};

type CustomerReview = {
  id: string;
  productHandle: string;
  locale: Locale;
  rating: number;
  content: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  moderatedAt: string | null;
};

type FavoriteProduct = {
  id: string;
  handle: string;
  title: string;
  images: Array<{ id: string; url: string; altText: string }>;
};

type AccountPanelProps = {
  locale: Locale;
  resetToken?: string;
  paymentStatus?: "success" | "cancelled";
  reference?: string;
};

export default function AccountPanel({ locale, resetToken, paymentStatus, reference }: AccountPanelProps) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [favorites, setFavorites] = useState<FavoriteProduct[]>([]);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recoveryMode, setRecoveryMode] = useState<"none" | "request" | "reset">(resetToken ? "reset" : "none");
  const accountLoadError = locale === "es"
    ? "No pudimos cargar tu cuenta. Intenta de nuevo."
    : "We could not load your account. Try again.";

  const labels = locale === "es"
    ? {
        kicker: "Cuenta Slow Fit",
        title: "Tu progreso, también fuera del entrenamiento.",
        intro: "Guarda tus datos y consulta el estado de tus pedidos en un solo lugar.",
        login: "Iniciar sesión",
        register: "Crear cuenta",
        email: "Correo",
        password: "Contraseña",
        firstName: "Nombre",
        lastName: "Apellido (opcional)",
        submitLogin: "Entrar",
        submitRegister: "Crear mi cuenta",
        passwordHint: "Usa al menos 8 caracteres.",
        profile: "Tu perfil",
        orders: "Tus pedidos",
        noOrders: "Tus pedidos aparecerán aqui cuando el banco confirme una compra con este correo.",
        paid: "Pago",
        fulfillment: "Entrega",
        deliveryProvider: "Proveedor",
        deliveryFee: "Costo de entrega",
        deliveryEta: "Llegada estimada",
        trackDelivery: "Seguir entrega",
        items: "artículos",
        orderDetails: "Ver artículos",
        reviews: "Tus reseñas",
        noReviews: "Las reseñas enviadas con este correo aparecerán aquí.",
        favorites: "Favoritos",
        noFavorites: "Guarda productos desde la tienda para encontrarlos aquí.",
        removeFavorite: "Quitar de favoritos",
        pending: "Pendiente",
        approved: "Aprobada",
        rejected: "Rechazada",
        shipping: "Envíos",
        returns: "Cambios y devoluciones",
        signOut: "Cerrar sesión",
        shop: "Seguir comprando",
        required: "Este campo es obligatorio.",
        invalidEmail: "Ingresa un correo válido.",
        sessionExpired: "Tu sesión expiró. Inicia sesión de nuevo.",
        requestFailed: "No pudimos cargar tu cuenta. Intenta de nuevo.",
        forgotPassword: "¿Olvidaste tu contraseña?",
        recoveryTitle: "Recuperar contraseña",
        recoveryIntro: "Te enviaremos un enlace seguro si existe una cuenta con este correo.",
        sendReset: "Enviar enlace",
        resetTitle: "Crear nueva contraseña",
        resetPassword: "Guardar nueva contraseña",
        backToLogin: "Volver a iniciar sesión",
        resetRequested: "Si existe una cuenta, recibirás un enlace de recuperación por correo.",
        resetCompleted: "Tu contraseña fue actualizada. Ya puedes iniciar sesión.",
        resetFailed: "El enlace es inválido o venció. Solicita uno nuevo.",
        preorderConfirmation: "Tu preventa quedó confirmada. Hemos recibido el pago del 50% y no se aplicará el flujo de entrega para este pedido.",
        orderConfirmation: "Tu pedido quedó confirmado.",
      }
    : {
        kicker: "Slow Fit account",
        title: "Your progress, beyond training.",
        intro: "Save your details and check your order status in one place.",
        login: "Sign in",
        register: "Create account",
        email: "Email",
        password: "Password",
        firstName: "First name",
        lastName: "Last name (optional)",
        submitLogin: "Sign in",
        submitRegister: "Create my account",
        passwordHint: "Use at least 8 characters.",
        profile: "Your profile",
        orders: "Your orders",
        noOrders: "Orders will appear here when the payment provider confirms a purchase using this email.",
        paid: "Payment",
        fulfillment: "Delivery",
        deliveryProvider: "Provider",
        deliveryFee: "Delivery cost",
        deliveryEta: "Estimated arrival",
        trackDelivery: "Track delivery",
        items: "items",
        orderDetails: "View items",
        reviews: "Your reviews",
        noReviews: "Reviews submitted with this email will appear here.",
        favorites: "Favorites",
        noFavorites: "Save products from the shop to find them here.",
        removeFavorite: "Remove favorite",
        pending: "Pending",
        approved: "Approved",
        rejected: "Rejected",
        shipping: "Shipping",
        returns: "Returns",
        signOut: "Sign out",
        shop: "Continue shopping",
        required: "This field is required.",
        invalidEmail: "Enter a valid email.",
        sessionExpired: "Your session expired. Sign in again.",
        requestFailed: "We could not load your account. Try again.",
        forgotPassword: "Forgot your password?",
        recoveryTitle: "Recover password",
        recoveryIntro: "We will send a secure link if an account exists for this email.",
        sendReset: "Send reset link",
        resetTitle: "Create new password",
        resetPassword: "Save new password",
        backToLogin: "Back to sign in",
        resetRequested: "If an account exists, you will receive a recovery link by email.",
        resetCompleted: "Your password was updated. You can now sign in.",
        resetFailed: "This link is invalid or expired. Request a new one.",
        preorderConfirmation: "Your preorder is confirmed. We received the 50% deposit and no delivery flow will be used for this order.",
        orderConfirmation: "Your order is confirmed.",
      };

  async function requestPasswordReset(values: { email: string }) {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest("/api/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ ...values, locale }),
      });
      setSuccess(labels.resetRequested);
    } catch (requestError) {
      setError(formatApiError(requestError, locale, { fallback: labels.requestFailed }));
    } finally {
      setLoading(false);
    }
  }

  async function completePasswordReset(values: { password: string }) {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest("/api/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, password: values.password }),
      });
      setRecoveryMode("none");
      setSuccess(labels.resetCompleted);
      router.replace(`/${locale}/account`);
    } catch {
      setError(labels.resetFailed);
    } finally {
      setLoading(false);
    }
  }

  function handleAccountError(requestError: unknown) {
    if (isApiErrorStatus(requestError, 401)) {
      setCustomer(null);
      setOrders([]);
      setReviews([]);
      setReviewTotal(0);
      setError(labels.sessionExpired);
      return;
    }

    setError(formatApiError(requestError, locale, { fallback: labels.requestFailed }));
  }

  async function loadOrders() {
    const payload = await apiRequest<{ orders: Order[] }>("/api/account/orders");
    setOrders(payload.orders || []);
  }

  async function loadReviews(page = 1) {
    const payload = await apiRequest<{ reviews: CustomerReview[]; total: number }>(`/api/account/reviews?page=${page}&pageSize=6`);
    setReviews(payload.reviews || []);
    setReviewTotal(payload.total || 0);
    setReviewPage(page);
  }

  async function loadAccountData() {
    const favoritePayload = apiRequest<{ products: FavoriteProduct[] }>("/api/account/favorites")
      .then((payload) => setFavorites(payload.products || []));
    await Promise.all([loadOrders(), loadReviews(), favoritePayload]);
  }

  useEffect(() => {
    let active = true;
    apiRequest<{ customer: Customer }>("/api/auth/session")
      .then(async (payload) => {
        if (!active) return;
        setCustomer(payload.customer);
        const [orderPayload, reviewPayload, favoritePayload] = await Promise.all([
          apiRequest<{ orders: Order[] }>("/api/account/orders"),
          apiRequest<{ reviews: CustomerReview[]; total: number }>("/api/account/reviews?page=1&pageSize=6"),
          apiRequest<{ products: FavoriteProduct[] }>("/api/account/favorites"),
        ]);
        if (active) {
          setOrders(orderPayload.orders || []);
          setReviews(reviewPayload.reviews || []);
          setReviewTotal(reviewPayload.total || 0);
          setFavorites(favoritePayload.products || []);
        }
      })
      .catch((requestError) => {
        if (!isApiErrorStatus(requestError, 401) && active) {
          setError(formatApiError(requestError, locale, { fallback: accountLoadError }));
        }
      })
    return () => {
      active = false;
    };
  }, [accountLoadError, locale]);

  async function submitCustomer(path: string, values: Record<string, string>) {
    setLoading(true);
    setError("");
    try {
      const payload = await apiRequest<{ customer: Customer }>(path, {
        method: "POST",
        body: JSON.stringify({ ...values, locale }),
      });
      setCustomer(payload.customer);
      window.dispatchEvent(new CustomEvent("slowfit:auth-changed", { detail: { authenticated: true } }));
      await loadAccountData();
    } catch (requestError) {
      setError(formatApiError(requestError, locale, { fallback: labels.requestFailed, preserveClientMessage: true }));
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setError("");
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      setCustomer(null);
      setOrders([]);
      setReviews([]);
      setFavorites([]);
      window.dispatchEvent(new CustomEvent("slowfit:auth-changed", { detail: { authenticated: false } }));
    } catch (requestError) {
      handleAccountError(requestError);
    }
  }

  const paymentSuccessNotice = paymentStatus === "success" ? (
    <Alert
      type="success"
      showIcon
      message={reference ? `${labels.orderConfirmation} #${reference.slice(0, 8)}` : labels.orderConfirmation}
      description={labels.preorderConfirmation}
      closable
      onClose={() => setSuccess("")}
      style={{ marginBottom: 16 }}
    />
  ) : null;

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
          {error ? <Alert type="error" showIcon title={error} closable onClose={() => setError("")} /> : null}
          {paymentSuccessNotice}
          <aside className="slowfit-account-profile">
            <UserOutlined />
            <Typography.Title level={3}>{labels.profile}</Typography.Title>
            <Typography.Text strong>{[customer.firstName, customer.lastName].filter(Boolean).join(" ")}</Typography.Text>
            <Typography.Text>{customer.email}</Typography.Text>
          </aside>
          <Tabs items={[
            {
              key: "orders",
              label: `${labels.orders} (${orders.length})`,
              children: !orders.length ? <Empty description={labels.noOrders} /> : <div className="slowfit-account-orders">
                {orders.map((order) => (
                  <article className="slowfit-order-row" key={order.id}>
                    <div>
                      <Typography.Title level={4}>{order.name || `#${order.orderNumber || order.id}`}</Typography.Title>
                      <Typography.Text type="secondary">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(order.paymentCreatedAt || order.updatedAt))}</Typography.Text>
                    </div>
                    <div className="slowfit-order-status">
                      <span>{labels.paid}: <Tag color={order.financialStatus === "paid" ? "success" : "warning"}>{order.financialStatus || "pending"}</Tag></span>
                      <span>{labels.fulfillment}: <Tag color={order.delivery?.status === "COMPLETED" || order.fulfillmentStatus === "fulfilled" ? "success" : "warning"}>{order.delivery?.status || order.fulfillmentStatus || "unfulfilled"}</Tag></span>
                    </div>
                    <Typography.Text strong>{order.total ? `${order.total} ${order.currency || ""}` : ""}</Typography.Text>
                    {order.delivery ? (
                      <Space wrap>
                        <Typography.Text>{labels.deliveryProvider}: {order.delivery.provider === "uber" ? "Uber Direct" : "DiDi"}</Typography.Text>
                        <Typography.Text>
                          {labels.deliveryFee}: {new Intl.NumberFormat(locale === "es" ? "es-CR" : "en-US", {
                            style: "currency",
                            currency: order.delivery.currency,
                          }).format(order.delivery.feeMinor / 100)}
                        </Typography.Text>
                        {order.delivery.dropoffEta ? (
                          <Typography.Text>{labels.deliveryEta}: {new Date(order.delivery.dropoffEta).toLocaleString(locale === "es" ? "es-CR" : "en-US")}</Typography.Text>
                        ) : null}
                        {order.delivery.trackingUrl ? (
                          <Button type="link" href={order.delivery.trackingUrl} target="_blank" rel="noreferrer">
                            {labels.trackDelivery}
                          </Button>
                        ) : null}
                      </Space>
                    ) : null}
                    <Collapse ghost items={[{ key: "items", label: `${labels.orderDetails} (${Array.isArray(order.items) ? order.items.length : 0})`, children: Array.isArray(order.items) && order.items.length ? order.items.map((item, index) => <Typography.Paragraph key={`${item.title}-${index}`}>{item.quantity || 1} × {item.title || labels.items}</Typography.Paragraph>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> }]} />
                  </article>
                ))}
                <Space wrap><Link href={`/${locale}/shipping`}>{labels.shipping}</Link><Link href={`/${locale}/returns`}>{labels.returns}</Link></Space>
              </div>,
            },
            {
              key: "favorites",
              label: `${labels.favorites} (${favorites.length})`,
              children: !favorites.length ? <Empty description={labels.noFavorites} /> : <div className="slowfit-account-favorites">
                {favorites.map((product) => (
                  <article className="slowfit-account-favorite" key={product.id}>
                    <Link href={`/${locale}/product/${product.handle}`} className="slowfit-account-favorite-media">
                      <Image src={product.images[0]?.url || "/slowfit/hero.jpg"} alt={product.images[0]?.altText || getPublicProductTitle(product.title)}
                        fill unoptimized sizes="(max-width: 767px) 40vw, 180px" className="slowfit-cover" />
                    </Link>
                    <div>
                      <Link href={`/${locale}/product/${product.handle}`}><Typography.Title level={4}>{getPublicProductTitle(product.title)}</Typography.Title></Link>
                      <Button danger type="text" icon={<HeartFilled />} onClick={() => void apiRequest(`/api/account/favorites/${encodeURIComponent(product.id)}`, { method: "DELETE" })
                        .then(() => setFavorites((current) => current.filter((favorite) => favorite.id !== product.id)))
                        .catch(handleAccountError)}>{labels.removeFavorite}</Button>
                    </div>
                  </article>
                ))}
              </div>,
            },
            {
              key: "reviews",
              label: `${labels.reviews} (${reviewTotal})`,
              children: !reviews.length ? <Empty description={labels.noReviews} /> : <div>
                {reviews.map((review) => (
                  <article className="slowfit-order-row" key={review.id}>
                    <div><Link href={`/${locale}/product/${review.productHandle}`}><Typography.Text strong>{review.productHandle}</Typography.Text></Link><br /><Typography.Text type="secondary">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(review.createdAt))}</Typography.Text></div>
                    <Rate disabled value={review.rating} />
                    <Typography.Paragraph>{review.content}</Typography.Paragraph>
                    <Tag color={review.status === "APPROVED" ? "success" : review.status === "REJECTED" ? "error" : "warning"}>{review.status === "APPROVED" ? labels.approved : review.status === "REJECTED" ? labels.rejected : labels.pending}</Tag>
                  </article>
                ))}
                <Pagination
                  current={reviewPage}
                  pageSize={6}
                  total={reviewTotal}
                  hideOnSinglePage
                  onChange={(page) => void loadReviews(page).catch(handleAccountError)}
                />
              </div>,
            },
          ]} />
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
      {paymentSuccessNotice}
      <section className="slowfit-account-media">
        <Image src="/slowfit/performance-collection.jpg" alt="Slow Fit Performance Collection" fill priority sizes="(max-width: 900px) 100vw, 48vw" className="slowfit-cover" />
      </section>
      <section className="slowfit-account-access">
        <div className="slowfit-account-access-inner">
          <Link href={`/${locale}`} className="slowfit-kicker">Slow Fit CR</Link>
          <Typography.Title className="slowfit-display slowfit-account-title">{labels.title}</Typography.Title>
          <Typography.Paragraph className="slowfit-policy-lead">{labels.intro}</Typography.Paragraph>
          {error ? <Alert type="error" showIcon title={error} closable onClose={() => setError("")} /> : null}
          {success ? <Alert type="success" showIcon title={success} closable onClose={() => setSuccess("")} /> : null}
          {recoveryMode === "request" ? (
            <div>
              <Typography.Title level={3}>{labels.recoveryTitle}</Typography.Title>
              <Typography.Paragraph>{labels.recoveryIntro}</Typography.Paragraph>
              <Form layout="vertical" onFinish={(values) => void requestPasswordReset(values)}>
                <Form.Item name="email" label={labels.email} rules={emailRules}><Input prefix={<UserOutlined />} autoComplete="email" /></Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block>{labels.sendReset}</Button>
              </Form>
              <Button type="link" block onClick={() => { setRecoveryMode("none"); setError(""); }}>{labels.backToLogin}</Button>
            </div>
          ) : recoveryMode === "reset" ? (
            <div>
              <Typography.Title level={3}>{labels.resetTitle}</Typography.Title>
              <Form layout="vertical" onFinish={(values) => void completePasswordReset(values)}>
                <Form.Item name="password" label={labels.password} extra={labels.passwordHint} rules={passwordRules}><Input.Password prefix={<LockOutlined />} autoComplete="new-password" /></Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block>{labels.resetPassword}</Button>
              </Form>
              <Button type="link" block onClick={() => { setRecoveryMode("request"); setError(""); }}>{labels.forgotPassword}</Button>
            </div>
          ) : <Tabs
            items={[
              {
                key: "login",
                label: labels.login,
                children: (
                  <Form layout="vertical" onFinish={(values) => void submitCustomer("/api/auth/login", values)}>
                    <Form.Item name="email" label={labels.email} rules={emailRules}><Input prefix={<UserOutlined />} autoComplete="email" /></Form.Item>
                    <Form.Item name="password" label={labels.password} rules={passwordRules}><Input.Password prefix={<LockOutlined />} autoComplete="current-password" /></Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading} block>{labels.submitLogin}</Button>
                    <Button type="link" block onClick={() => { setRecoveryMode("request"); setError(""); setSuccess(""); }}>{labels.forgotPassword}</Button>
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
            ]}
          />}
        </div>
      </section>
    </main>
  );
}