"use client";

import {
  CheckCircleFilled,
  InstagramOutlined,
  TikTokOutlined,
  UserOutlined,
  WhatsAppOutlined,
} from "@ant-design/icons";
import { Button, Col, Row, Space, Typography } from "antd";
import Image from "next/image";
import ContactForm from "./contact-form";
import LocaleSwitcher from "./locale-switcher";
import { trackEvent } from "./lib/analytics";
import type { Copy, Locale } from "./i18n";

type HomePageProps = {
  copy: Copy;
  locale: Locale;
};

export default function HomePage({ copy, locale }: HomePageProps) {
  const shopHref = `/${locale}/shop`;
  const collectionsHref = `${shopHref}#collections`;
  const whySlowHref = `/${locale}#why-slow`;
  const contactHref = `/${locale}#contacto`;

  return (
    <main className="slowfit-page">
      <section className="slowfit-shell slowfit-nav">
        <div className="slowfit-brand-block">
          <span className="slowfit-kicker">Slow Fit CR</span>
          <Typography.Text className="slowfit-brand-copy">{copy.brandTagline}</Typography.Text>
        </div>
        <div className="slowfit-nav-actions">
          <Space size={12} wrap>
            <Button type="text" href={shopHref} className="slowfit-nav-button">
              {copy.nav.shop}
            </Button>
            <Button type="text" href={collectionsHref} className="slowfit-nav-button">
              {copy.nav.collections}
            </Button>
            <Button type="text" href={whySlowHref} className="slowfit-nav-button">
              {copy.nav.whySlow}
            </Button>
            <Button type="primary" href={contactHref} className="slowfit-secondary-cta">
              {copy.nav.contact}
            </Button>
            <Button type="text" icon={<UserOutlined />} href={`/${locale}/account`} className="slowfit-nav-button">
              {copy.nav.account}
            </Button>
          </Space>
          <LocaleSwitcher locale={locale} />
        </div>
      </section>

      <section className="slowfit-shell slowfit-hero">
        <div className="slowfit-hero-media">
          <Image
            src="/slowfit/hero.jpg"
            alt={copy.hero.imageAlt}
            fill
            priority
            sizes="100vw"
            className="slowfit-cover"
          />
          <div className="slowfit-hero-overlay">
            <Image
              src="/slowfit/hero-mark.png"
              alt={copy.hero.markAlt}
              width={390}
              height={136}
              className="slowfit-hero-mark"
            />
            <Typography.Paragraph className="slowfit-hero-line">{copy.brandTagline}</Typography.Paragraph>
            <Typography.Paragraph className="slowfit-hero-line">{copy.hero.eyebrow}</Typography.Paragraph>
            <Typography.Paragraph className="slowfit-hero-line">{copy.hero.description}</Typography.Paragraph>
          </div>
        </div>
      </section>

      <section className="slowfit-manifesto">
        <div className="slowfit-shell">
          <Row gutter={[32, 32]} align="middle">
            <Col xs={24} md={12}>
              <Typography.Title level={2} className="slowfit-display slowfit-manifesto-title">
                {copy.hero.titleLineOne}
                <br />
                {copy.hero.titleLineTwo}
              </Typography.Title>
              <div className="slowfit-ring-panel">
                <Image src="/slowfit/hero-mark.png" alt={copy.manifesto.imageAlt} width={170} height={60} />
              </div>
            </Col>
            <Col xs={24} md={12}>
              <Typography.Paragraph className="slowfit-manifesto-copy">
                {copy.manifesto.title}
                <br />
                {copy.manifesto.description}
              </Typography.Paragraph>
            </Col>
          </Row>
        </div>
      </section>

      <section id="collections" className="slowfit-shell slowfit-section">
        {copy.collections.items.map((collection, index) => (
          <div
            key={collection.title}
            className={`slowfit-collection-block${index % 2 === 1 ? " slowfit-collection-block--reversed" : ""}`}
          >
            <div className="slowfit-collection-media">
              <Image
                src={collection.image}
                alt={collection.imageAlt}
                fill
                sizes="(max-width: 991px) 100vw, 50vw"
                className="slowfit-cover"
              />
            </div>
            <div className="slowfit-collection-content">
              <Typography.Title className="slowfit-display slowfit-collection-title">
                {collection.title}
              </Typography.Title>
              <Typography.Paragraph className="slowfit-collection-copy">
                {collection.description}
              </Typography.Paragraph>
              <Button type="primary" href={shopHref} className="slowfit-block-cta">
                {collection.ctaLabel}
              </Button>
            </div>
          </div>
        ))}
      </section>

      <section id="why-slow" className="slowfit-values">
        <div className="slowfit-shell">
          <div className="slowfit-section-heading centered">
            <Typography.Title className="slowfit-display slowfit-section-title light">
              {copy.values.kicker}
            </Typography.Title>
          </div>
          <Row gutter={[20, 20]}>
            {copy.values.items.map((value) => (
              <Col xs={24} md={8} key={value.title}>
                <div className="slowfit-value-media">
                  <Image
                    src={value.image ?? "/slowfit/value-3.jpg"}
                    alt={value.imageAlt ?? value.title}
                    fill
                    sizes="(max-width: 767px) 100vw, 33vw"
                    className="slowfit-cover"
                  />
                </div>
                <Typography.Paragraph className="slowfit-value-copy">
                  <CheckCircleFilled />
                  <span>{value.title}</span>
                </Typography.Paragraph>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      <section id="contacto" className="slowfit-shell slowfit-story">
        <Row gutter={[32, 32]} align="middle">
          <Col xs={24} lg={10}>
            <div className="slowfit-story-media">
              <Image
                src="/slowfit/story.jpg"
                alt={copy.story.imageAlt}
                fill
                sizes="(max-width: 991px) 100vw, 40vw"
                className="slowfit-cover"
              />
            </div>
          </Col>
          <Col xs={24} lg={14}>
            <Typography.Paragraph className="slowfit-story-quote">{copy.story.title}</Typography.Paragraph>
            <Typography.Paragraph className="slowfit-story-quote">{copy.story.description}</Typography.Paragraph>
            <Typography.Paragraph className="slowfit-story-sign">SLOW.</Typography.Paragraph>
            <ContactForm copy={copy.contactForm} locale={locale} />
          </Col>
        </Row>
      </section>

      <section className="slowfit-footer-contact">
        <div className="slowfit-shell">
          <div className="slowfit-footer-mark">
            <Image src="/slowfit/hero-mark.png" alt={copy.hero.markAlt} width={420} height={146} />
          </div>
          <Space size={18} className="slowfit-policy-links" wrap>
            <a href={`/${locale}/shipping`}>{copy.policies.shipping.title}</a>
            <a href={`/${locale}/returns`}>{copy.policies.returns.title}</a>
            <a href={`/${locale}/privacy`}>{copy.policies.privacy.title}</a>
            <a href={`/${locale}/terms`}>{copy.policies.terms.title}</a>
          </Space>
          <Space size={42} className="slowfit-footer-links" wrap>
            <a
              className="slowfit-footer-link"
              href="https://wa.me/50686437162?text=Hola%20Slow%20Fit%2C%20quiero%20mas%20informacion"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              onClick={() => trackEvent("contact_whatsapp_click", { locale })}
            >
              <WhatsAppOutlined />
              <span>8643-7162</span>
            </a>
            <a
              className="slowfit-footer-link"
              href="https://www.instagram.com/slowfitcr/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              onClick={() => trackEvent("social_click", { locale, network: "instagram" })}
            >
              <InstagramOutlined />
              <span>slowfitcr</span>
            </a>
            <a
              className="slowfit-footer-link"
              href="https://www.tiktok.com/@slowfitcr"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TikTok"
              onClick={() => trackEvent("social_click", { locale, network: "tiktok" })}
            >
              <TikTokOutlined />
              <span>slowfitcr</span>
            </a>
          </Space>
        </div>
      </section>
    </main>
  );
}