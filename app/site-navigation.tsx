"use client";

import { MenuOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Drawer, Space, Typography } from "antd";
import { useState } from "react";
import type { Copy, Locale } from "./i18n";
import LocaleSwitcher from "./locale-switcher";

type SiteNavigationProps = {
  copy: Copy;
  locale: Locale;
};

export default function SiteNavigation({ copy, locale }: SiteNavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const shopHref = `/${locale}/shop`;
  const collectionsHref = `${shopHref}#collections`;
  const whySlowHref = `/${locale}#why-slow`;
  const contactHref = `/${locale}#contacto`;
  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <>
      <section className="slowfit-shell slowfit-nav">
        <div className="slowfit-brand-block">
          <span className="slowfit-kicker">Slow Fit CR</span>
          <Typography.Text className="slowfit-brand-copy">{copy.brandTagline}</Typography.Text>
        </div>
        <div className="slowfit-nav-actions">
          <Space size={12} wrap>
            <Button type="text" href={shopHref} className="slowfit-nav-button">{copy.nav.shop}</Button>
            <Button type="text" href={collectionsHref} className="slowfit-nav-button">{copy.nav.collections}</Button>
            <Button type="text" href={whySlowHref} className="slowfit-nav-button">{copy.nav.whySlow}</Button>
            <Button type="primary" href={contactHref} className="slowfit-secondary-cta">{copy.nav.contact}</Button>
            <Button type="text" icon={<UserOutlined />} href={`/${locale}/account`} className="slowfit-nav-button">
              {copy.nav.account}
            </Button>
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
          <Button type="text" href={shopHref} onClick={closeMobileMenu}>{copy.nav.shop}</Button>
          <Button type="text" href={collectionsHref} onClick={closeMobileMenu}>{copy.nav.collections}</Button>
          <Button type="text" href={whySlowHref} onClick={closeMobileMenu}>{copy.nav.whySlow}</Button>
          <Button type="text" href={contactHref} onClick={closeMobileMenu}>{copy.nav.contact}</Button>
          <Button type="text" icon={<UserOutlined />} href={`/${locale}/account`} onClick={closeMobileMenu}>{copy.nav.account}</Button>
          <LocaleSwitcher locale={locale} />
        </nav>
      </Drawer>
    </>
  );
}