"use client";

import {
  ArrowRightOutlined,
  CheckCircleFilled,
  GlobalOutlined,
  InstagramOutlined,
  PhoneOutlined,
  WhatsAppOutlined,
} from "@ant-design/icons";
import { Button, Col, Divider, Flex, Row, Space, Tag, Tooltip, Typography } from "antd";
import Image from "next/image";
import LocaleSwitcher from "./locale-switcher";
import type { Copy, Locale } from "./i18n";

type HomePageProps = {
  copy: Copy;
  locale: Locale;
};

export default function HomePage({ copy, locale }: HomePageProps) {
  const collectionsHref = `/${locale}#collections`;
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
            <Button type="text" href={collectionsHref} className="slowfit-nav-button">
              {copy.nav.collections}
            </Button>
            <Button type="text" href={whySlowHref} className="slowfit-nav-button">
              {copy.nav.whySlow}
            </Button>
            <Button type="primary" href={contactHref} className="slowfit-secondary-cta">
              {copy.nav.contact}
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
            <Tag variant="filled" className="slowfit-pill">
              {copy.hero.eyebrow}
            </Tag>
            <Typography.Title className="slowfit-display slowfit-hero-title">
              {copy.hero.titleLineOne}
              <br />
              {copy.hero.titleLineTwo}
            </Typography.Title>
            <Typography.Paragraph className="slowfit-lead">{copy.hero.description}</Typography.Paragraph>
            <Flex gap={12} wrap>
              <Button
                type="primary"
                size="large"
                href={collectionsHref}
                icon={<ArrowRightOutlined />}
                className="slowfit-primary-cta"
              >
                {copy.hero.primaryCta}
              </Button>
              <Button size="large" href={contactHref} className="slowfit-secondary-cta">
                {copy.hero.secondaryCta}
              </Button>
            </Flex>
          </div>
        </div>
      </section>

      <section className="slowfit-manifesto">
        <div className="slowfit-shell">
          <Row gutter={[32, 32]} align="middle">
            <Col xs={24} md={15}>
              <Typography.Title level={2} className="slowfit-display slowfit-manifesto-title">
                {copy.manifesto.title}
              </Typography.Title>
              <Typography.Paragraph className="slowfit-manifesto-copy">
                {copy.manifesto.description}
              </Typography.Paragraph>
            </Col>
            <Col xs={24} md={9}>
              <div className="slowfit-ring-panel">
                <Image src="/slowfit/ring.png" alt={copy.manifesto.imageAlt} width={220} height={220} />
              </div>
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
              <Button type="primary" href="https://slowfitcr.com/" target="_blank" className="slowfit-block-cta">
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
            <Typography.Text className="slowfit-kicker">{copy.story.kicker}</Typography.Text>
            <Typography.Title className="slowfit-display slowfit-section-title">
              {copy.story.title}
            </Typography.Title>
            <Typography.Paragraph className="slowfit-lead">{copy.story.description}</Typography.Paragraph>
            <Divider className="slowfit-divider" />
            <Space orientation="vertical" size={12} className="w-full">
              <Button icon={<PhoneOutlined />} size="large" href="tel:+50686437162">
                8643-7162
              </Button>
              <Space size={14} className="slowfit-social-row" wrap>
                <Tooltip title="WhatsApp">
                  <Button
                    icon={<WhatsAppOutlined />}
                    size="large"
                    shape="circle"
                    className="slowfit-social-icon"
                    href="https://wa.me/50686437162?text=Hola%20Slow%20Fit%2C%20quiero%20mas%20informacion"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="WhatsApp"
                  />
                </Tooltip>
                <Tooltip title="Instagram">
                  <Button
                    icon={<InstagramOutlined />}
                    size="large"
                    shape="circle"
                    className="slowfit-social-icon"
                    href="https://www.instagram.com/slowfitcr/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                  />
                </Tooltip>
                <Tooltip title="TikTok">
                  <Button
                    icon={<GlobalOutlined />}
                    size="large"
                    shape="circle"
                    className="slowfit-social-icon"
                    href="https://www.tiktok.com/@slowfitcr"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="TikTok"
                  />
                </Tooltip>
              </Space>
            </Space>
          </Col>
        </Row>
      </section>
    </main>
  );
}