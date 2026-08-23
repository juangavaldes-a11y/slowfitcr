"use client";

import { DownOutlined, MenuOutlined, SafetyCertificateOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Divider, Drawer, Dropdown, Space, Typography, type MenuProps } from "antd";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Copy, Locale } from "./i18n";
import { apiRequest } from "./lib/api-client";
import LocaleSwitcher from "./locale-switcher";

type SiteNavigationProps = {
  copy: Copy;
  locale: Locale;
};

export default function SiteNavigation({ copy, locale }: SiteNavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  const homeHref = `/${locale}`;
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
  const informationItems: MenuProps["items"] = publicRoutes.map((route) => ({
    key: route.href,
    label: <Link href={route.href}>{route.label}</Link>,
  }));
  const adminItems: MenuProps["items"] = adminRoutes.map((route) => ({
    key: route.href,
    label: <Link href={route.href}>{route.label}</Link>,
  }));

  useEffect(() => {
    let active = true;
    const checkAdminSession = () => {
      apiRequest<{ authenticated: boolean }>("/api/admin/session")
        .then((payload) => { if (active) setAdminAuthorized(payload.authenticated); })
        .catch(() => { if (active) setAdminAuthorized(false); });
    };
    checkAdminSession();
    window.addEventListener("slowfit:admin-auth-changed", checkAdminSession);
    return () => {
      active = false;
      window.removeEventListener("slowfit:admin-auth-changed", checkAdminSession);
    };
  }, []);

  return (
    <>
      <section className="slowfit-shell slowfit-nav">
        <Link href={homeHref} className="slowfit-brand-block">
          <span className="slowfit-kicker">Slow Fit CR</span>
          <Typography.Text className="slowfit-brand-copy">{copy.brandTagline}</Typography.Text>
        </Link>
        <div className="slowfit-nav-actions">
          <Space size={12} wrap>
            <Button type="text" href={homeHref} className="slowfit-nav-button">{copy.nav.home}</Button>
            <Button type="text" href={shopHref} className="slowfit-nav-button">{copy.nav.shop}</Button>
            <Button type="text" href={collectionsHref} className="slowfit-nav-button">{copy.nav.collections}</Button>
            <Button type="text" href={whySlowHref} className="slowfit-nav-button">{copy.nav.whySlow}</Button>
            <Button type="primary" href={contactHref} className="slowfit-secondary-cta">{copy.nav.contact}</Button>
            <Dropdown menu={{ items: informationItems }} trigger={["click"]}>
              <Button type="text" className="slowfit-nav-button">{copy.nav.information} <DownOutlined /></Button>
            </Dropdown>
            <Button type="text" icon={<UserOutlined />} href={`/${locale}/account`} className="slowfit-nav-button">
              {copy.nav.account}
            </Button>
            {adminAuthorized ? (
              <Dropdown menu={{ items: adminItems }} trigger={["click"]}>
                <Button type="text" icon={<SafetyCertificateOutlined />} className="slowfit-nav-button">
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

      <Drawer
        className="slowfit-mobile-menu"
        title="Slow Fit CR"
        placement="right"
        size="min(86vw, 360px)"
        open={mobileMenuOpen}
        onClose={closeMobileMenu}
      >
        <nav className="slowfit-mobile-menu-links" aria-label={locale === "es" ? "Navegación principal" : "Main navigation"}>
          <Button type="text" href={homeHref} onClick={closeMobileMenu}>{copy.nav.home}</Button>
          <Button type="text" href={shopHref} onClick={closeMobileMenu}>{copy.nav.shop}</Button>
          <Button type="text" href={collectionsHref} onClick={closeMobileMenu}>{copy.nav.collections}</Button>
          <Button type="text" href={whySlowHref} onClick={closeMobileMenu}>{copy.nav.whySlow}</Button>
          <Button type="text" href={contactHref} onClick={closeMobileMenu}>{copy.nav.contact}</Button>
          <Button type="text" icon={<UserOutlined />} href={`/${locale}/account`} onClick={closeMobileMenu}>{copy.nav.account}</Button>
          <Divider plain>{copy.nav.information}</Divider>
          {publicRoutes.map((route) => <Button key={route.href} type="text" href={route.href} onClick={closeMobileMenu}>{route.label}</Button>)}
          {adminAuthorized ? (
            <>
              <Divider plain>{copy.nav.administration}</Divider>
              {adminRoutes.map((route) => <Button key={route.href} type="text" href={route.href} onClick={closeMobileMenu}>{route.label}</Button>)}
            </>
          ) : null}
          <LocaleSwitcher locale={locale} />
        </nav>
      </Drawer>
    </>
  );
}