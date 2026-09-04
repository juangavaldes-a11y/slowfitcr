"use client";

import {
  DownOutlined,
  LoginOutlined,
  LogoutOutlined,
  MenuOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, Button, Divider, Drawer, Dropdown, Form, Input, Modal, Space, Typography, type MenuProps } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Copy, Locale } from "./i18n";
import { apiRequest } from "./lib/api-client";
import LocaleSwitcher from "./locale-switcher";

type SiteNavigationProps = {
  copy: Copy;
  locale: Locale;
};

export default function SiteNavigation({ copy, locale }: SiteNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [adminLoginError, setAdminLoginError] = useState("");
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  const [customerAuthenticated, setCustomerAuthenticated] = useState(false);
  const [hash, setHash] = useState("");
  const homeHref = `/${locale}`;
  const accountHref = `/${locale}/account`;
  const shopHref = `/${locale}/shop`;
  const collectionsHref = `${homeHref}#collections`;
  const whySlowHref = `${homeHref}#why-slow`;
  const contactHref = `${homeHref}#contacto`;
  const closeMobileMenu = () => setMobileMenuOpen(false);
  const publicRoutes = [
    { href: `/${locale}/shipping`, label: copy.nav.shipping },
    { href: `/${locale}/returns`, label: copy.nav.returns },
    { href: `/${locale}/privacy`, label: copy.nav.privacy },
    { href: `/${locale}/terms`, label: copy.nav.terms },
  ];
  const adminRoutes = [
    { href: `/${locale}/admin/catalog`, label: copy.nav.catalog },
    { href: `/${locale}/admin/reviews`, label: copy.nav.reviews },
    { href: `/${locale}/admin/ops`, label: copy.nav.operations },
  ];
  const sectionHashes = new Set(["#collections", "#why-slow", "#contacto"]);
  const active = {
    home: pathname === homeHref && !sectionHashes.has(hash),
    shop: pathname.startsWith(shopHref) || pathname.startsWith(`/${locale}/product/`),
    collections: pathname === homeHref && hash === "#collections",
    whySlow: pathname === homeHref && hash === "#why-slow",
    contact: pathname === homeHref && hash === "#contacto",
    information: publicRoutes.some((route) => route.href === pathname),
    account: pathname === accountHref,
    administration: adminRoutes.some((route) => route.href === pathname),
  };
  const navClass = (selected: boolean) => `slowfit-nav-button${selected ? " is-active" : ""}`;
  const mobileClass = (selected: boolean) => selected ? "is-active" : undefined;

  const informationItems: MenuProps["items"] = publicRoutes.map((route) => ({
    key: route.href,
    label: <Link href={route.href}>{route.label}</Link>,
  }));
  const adminItems: MenuProps["items"] = adminRoutes.map((route) => ({
    key: route.href,
    label: <Link href={route.href}>{route.label}</Link>,
  }));

  const signOutCustomer = async () => {
    await apiRequest("/api/auth/logout", { method: "POST" });
    setCustomerAuthenticated(false);
    window.dispatchEvent(new Event("slowfit:auth-changed"));
    if (pathname === accountHref) router.push(homeHref);
  };

  const signOutAdmin = async () => {
    await apiRequest("/api/admin/logout", { method: "POST" });
    setAdminAuthorized(false);
    window.dispatchEvent(new Event("slowfit:admin-auth-changed"));
    if (pathname.startsWith(`/${locale}/admin/`)) router.push(homeHref);
  };

  const accountItems: MenuProps["items"] = [
    {
      key: accountHref,
      icon: customerAuthenticated ? <UserOutlined /> : <LoginOutlined />,
      label: <Link href={accountHref}>{customerAuthenticated ? copy.nav.myAccount : copy.nav.signIn}</Link>,
    },
    ...(customerAuthenticated ? [{
      key: "customer-sign-out",
      icon: <LogoutOutlined />,
      label: copy.nav.signOut,
      onClick: () => void signOutCustomer(),
    }] : []),
    { type: "divider" as const },
    ...(!adminAuthorized ? [{
      key: "staff-access",
      icon: <SafetyCertificateOutlined />,
      label: copy.nav.staffAccess,
      onClick: () => { setAdminLoginError(""); setAdminLoginOpen(true); },
    }] : [{
      key: "admin-sign-out",
      icon: <LogoutOutlined />,
      label: copy.nav.adminSignOut,
      onClick: () => void signOutAdmin(),
    }]),
  ];

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname]);

  useEffect(() => {
    let activeRequest = true;
    const checkAdminSession = () => {
      apiRequest<{ authenticated: boolean }>("/api/admin/session")
        .then((payload) => { if (activeRequest) setAdminAuthorized(payload.authenticated); })
        .catch(() => { if (activeRequest) setAdminAuthorized(false); });
    };
    const checkCustomerSession = () => {
      apiRequest<{ authenticated: boolean }>("/api/auth/session")
        .then((payload) => { if (activeRequest) setCustomerAuthenticated(payload.authenticated); })
        .catch(() => { if (activeRequest) setCustomerAuthenticated(false); });
    };
    const handleCustomerAuthChanged = (event: Event) => {
      const authenticated = (event as CustomEvent<{ authenticated?: boolean }>).detail?.authenticated;
      if (typeof authenticated === "boolean") setCustomerAuthenticated(authenticated);
      else checkCustomerSession();
    };
    checkAdminSession();
    checkCustomerSession();
    window.addEventListener("slowfit:admin-auth-changed", checkAdminSession);
    window.addEventListener("slowfit:auth-changed", handleCustomerAuthChanged);
    return () => {
      activeRequest = false;
      window.removeEventListener("slowfit:admin-auth-changed", checkAdminSession);
      window.removeEventListener("slowfit:auth-changed", handleCustomerAuthChanged);
    };
  }, []);

  const submitAdminLogin = async ({ token }: { token: string }) => {
    setAdminLoginLoading(true);
    setAdminLoginError("");
    try {
      await apiRequest("/api/admin/login", { method: "POST", body: JSON.stringify({ token }) });
      setAdminAuthorized(true);
      setAdminLoginOpen(false);
      window.dispatchEvent(new Event("slowfit:admin-auth-changed"));
      router.push(`/${locale}/admin/catalog`);
    } catch {
      setAdminLoginError(copy.nav.adminLoginFailed);
    } finally {
      setAdminLoginLoading(false);
    }
  };

  return (
    <>
      <header className="slowfit-site-header">
        <section className="slowfit-shell slowfit-nav">
          <Link href={homeHref} className="slowfit-brand-block">
            <span className="slowfit-brand-wordmark" role="img" aria-label="Slow Fit CR" />
          </Link>
          <div className="slowfit-nav-actions">
            <Space size={12} wrap>
              <Button type="text" href={homeHref} className={navClass(active.home)}>{copy.nav.home}</Button>
              <Button type="text" href={shopHref} className={navClass(active.shop)}>{copy.nav.shop}</Button>
              <Button type="text" href={collectionsHref} className={navClass(active.collections)}>{copy.nav.collections}</Button>
              <Button type="text" href={whySlowHref} className={navClass(active.whySlow)}>{copy.nav.whySlow}</Button>
              <Button type="text" href={contactHref} className={navClass(active.contact)}>{copy.nav.contact}</Button>
              <Dropdown menu={{ items: informationItems, selectedKeys: active.information ? [pathname] : [] }} trigger={["click"]}>
                <Button type="text" className={navClass(active.information)}>{copy.nav.information} <DownOutlined /></Button>
              </Dropdown>
              <Dropdown menu={{ items: accountItems, selectedKeys: active.account ? [accountHref] : [] }} trigger={["click"]}>
                <Button type="text" icon={<UserOutlined />} className={navClass(active.account)}>
                  {customerAuthenticated ? copy.nav.myAccount : copy.nav.account} <DownOutlined />
                </Button>
              </Dropdown>
              {adminAuthorized ? (
                <Dropdown menu={{ items: adminItems, selectedKeys: active.administration ? [pathname] : [] }} trigger={["click"]}>
                  <Button type="text" icon={<SafetyCertificateOutlined />} className={navClass(active.administration)}>
                    {copy.nav.administration} <DownOutlined />
                  </Button>
                </Dropdown>
              ) : null}
            </Space>
            <LocaleSwitcher locale={locale} />
          </div>
          <Button
            type="text"
            className="slowfit-menu-trigger"
            icon={<MenuOutlined />}
            aria-label={locale === "es" ? "Abrir menú" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          />
        </section>
      </header>

      <Drawer
        className="slowfit-mobile-menu"
        title="Slow Fit CR"
        placement="right"
        size="min(86vw, 360px)"
        open={mobileMenuOpen}
        onClose={closeMobileMenu}
      >
        <nav className="slowfit-mobile-menu-links" aria-label={locale === "es" ? "Navegación principal" : "Main navigation"}>
          <Button className={mobileClass(active.home)} type="text" href={homeHref} onClick={closeMobileMenu}>{copy.nav.home}</Button>
          <Button className={mobileClass(active.shop)} type="text" href={shopHref} onClick={closeMobileMenu}>{copy.nav.shop}</Button>
          <Button className={mobileClass(active.collections)} type="text" href={collectionsHref} onClick={closeMobileMenu}>{copy.nav.collections}</Button>
          <Button className={mobileClass(active.whySlow)} type="text" href={whySlowHref} onClick={closeMobileMenu}>{copy.nav.whySlow}</Button>
          <Button className={mobileClass(active.contact)} type="text" href={contactHref} onClick={closeMobileMenu}>{copy.nav.contact}</Button>
          <Divider plain>{copy.nav.account}</Divider>
          <Button className={mobileClass(active.account)} type="text" icon={<UserOutlined />} href={accountHref} onClick={closeMobileMenu}>
            {customerAuthenticated ? copy.nav.myAccount : copy.nav.signIn}
          </Button>
          {customerAuthenticated ? <Button type="text" icon={<LogoutOutlined />} onClick={() => { closeMobileMenu(); void signOutCustomer(); }}>{copy.nav.signOut}</Button> : null}
          {!adminAuthorized
            ? <Button type="text" icon={<SafetyCertificateOutlined />} onClick={() => { closeMobileMenu(); setAdminLoginOpen(true); }}>{copy.nav.staffAccess}</Button>
            : <Button type="text" icon={<LogoutOutlined />} onClick={() => { closeMobileMenu(); void signOutAdmin(); }}>{copy.nav.adminSignOut}</Button>}
          <Divider plain>{copy.nav.information}</Divider>
          {publicRoutes.map((route) => <Button className={mobileClass(route.href === pathname)} key={route.href} type="text" href={route.href} onClick={closeMobileMenu}>{route.label}</Button>)}
          {adminAuthorized ? (
            <>
              <Divider plain>{copy.nav.administration}</Divider>
              {adminRoutes.map((route) => <Button className={mobileClass(route.href === pathname)} key={route.href} type="text" href={route.href} onClick={closeMobileMenu}>{route.label}</Button>)}
            </>
          ) : null}
          <LocaleSwitcher locale={locale} />
        </nav>
      </Drawer>

      <Modal title={copy.nav.adminAccessTitle} open={adminLoginOpen} footer={null}
        onCancel={() => { setAdminLoginOpen(false); setAdminLoginError(""); }} destroyOnHidden>
        <Typography.Paragraph>{copy.nav.adminAccessCopy}</Typography.Paragraph>
        {adminLoginError ? <Alert type="error" showIcon title={adminLoginError} /> : null}
        <Form layout="vertical" onFinish={(values) => void submitAdminLogin(values)}>
          <Form.Item name="token" label={copy.nav.adminToken} rules={[{ required: true, message: copy.nav.adminRequired }]}>
            <Input.Password autoComplete="off" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={adminLoginLoading} block>{copy.nav.adminSubmit}</Button>
        </Form>
      </Modal>
    </>
  );
}