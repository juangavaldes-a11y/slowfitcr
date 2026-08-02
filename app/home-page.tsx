"use client";

import {
  ArrowRightOutlined,
  CheckCircleFilled,
  GlobalOutlined,
  InstagramOutlined,
  PhoneOutlined,
} from "@ant-design/icons";
import { Button, Card, Col, Divider, Flex, Row, Space, Tag, Typography } from "antd";
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
            <Button type="text" href={collectionsHref}>
              {copy.nav.collections}
            </Button>
            <Button type="text" href={whySlowHref}>
              {copy.nav.whySlow}
            </Button>
            <Button type="primary" href={contactHref}>
              {copy.nav.contact}
            </Button>
          </Space>
          <LocaleSwitcher locale={locale} />
        </div>
      </section>

      <section className="slowfit-shell slowfit-hero">
        <Row gutter={[32, 32]} align="middle">
          <Col xs={24} lg={11}>
            <Space direction="vertical" size={20} className="w-full">
              <Tag bordered={false} className="slowfit-pill">
                {copy.hero.eyebrow}
              </Tag>
              <Typography.Title className="slowfit-display slowfit-hero-title">
                {copy.hero.titleLineOne}
                <br />
                {copy.hero.titleLineTwo}
              </Typography.Title>
              <Typography.Paragraph className="slowfit-lead">{copy.hero.description}</Typography.Paragraph>
              <Flex gap={12} wrap>
                <Button type="primary" size="large" href={collectionsHref} icon={<ArrowRightOutlined />}>
                  {copy.hero.primaryCta}
                </Button>
                <Button size="large" href={contactHref}>
                  {copy.hero.secondaryCta}
                </Button>
              </Flex>
            </Space>
          </Col>
          <Col xs={24} lg={13}>
            <div className="slowfit-hero-media">
              <div className="slowfit-hero-image-wrap">
                <Image
                  src="/slowfit/hero.jpg"
                  alt={copy.hero.imageAlt}
                  fill
                  priority
                  sizes="(max-width: 991px) 100vw, 46vw"
                  className="slowfit-cover"
                />
              </div>
              <div className="slowfit-mark-card">
                <Image src="/slowfit/hero-mark.png" alt={copy.hero.markAlt} width={144} height={144} />
              </div>
            </div>
          </Col>
        </Row>
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
        <div className="slowfit-section-heading">
          <Typography.Text className="slowfit-kicker">{copy.collections.kicker}</Typography.Text>
          <Typography.Title className="slowfit-display slowfit-section-title">
            {copy.collections.title}
          </Typography.Title>
        </div>
        <Row gutter={[24, 24]}>
          {copy.collections.items.map((collection) => (
            <Col xs={24} md={12} xl={8} key={collection.title}>
              <Card className="slowfit-card" bordered={false} bodyStyle={{ padding: 24 }}>
                <div className="slowfit-card-media">
                  <Image
                    src={collection.image}
                    alt={collection.imageAlt}
                    fill
                    sizes="(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw"
                    className="slowfit-cover"
                  />
                </div>
                <Space direction="vertical" size={12} className="w-full">
                  <Typography.Title level={3} className="slowfit-card-title">
                    {collection.title}
                  </Typography.Title>
                  <Typography.Paragraph className="slowfit-card-copy">
                    {collection.description}
                  </Typography.Paragraph>
                  <Button type="link" href="https://slowfitcr.com/" target="_blank" icon={<ArrowRightOutlined />}>
                    {copy.collections.cta}
                  </Button>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </section>

      <section id="why-slow" className="slowfit-values">
        <div className="slowfit-shell">
          <div className="slowfit-section-heading centered">
            <Typography.Text className="slowfit-kicker light">{copy.values.kicker}</Typography.Text>
            <Typography.Title className="slowfit-display slowfit-section-title light">
              {copy.values.title}
            </Typography.Title>
          </div>
          <Row gutter={[20, 20]}>
            {copy.values.items.map((value) => (
              <Col xs={24} md={8} key={value.title}>
                <Card className="slowfit-value-card" bordered={false} bodyStyle={{ padding: 20 }}>
                  <div className="slowfit-value-media">
                    <Image
                      src={value.image}
                      alt={value.imageAlt}
                      fill
                      sizes="(max-width: 767px) 100vw, 33vw"
                      className="slowfit-cover"
                    />
                  </div>
                  <Typography.Paragraph className="slowfit-value-copy">
                    <CheckCircleFilled />
                    <span>{value.title}</span>
                  </Typography.Paragraph>
                </Card>
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
            <Space direction="vertical" size={12} className="w-full">
              <Button icon={<PhoneOutlined />} size="large" href="tel:+50686437162">
                8643-7162
              </Button>
              <Button icon={<InstagramOutlined />} size="large" href="https://instagram.com/slowfitcr" target="_blank">
                @slowfitcr
              </Button>
              <Button icon={<GlobalOutlined />} size="large" href="https://www.tiktok.com/@slowfitcr" target="_blank">
                TikTok @slowfitcr
              </Button>
            </Space>
          </Col>
        </Row>
      </section>
    </main>
  );
}