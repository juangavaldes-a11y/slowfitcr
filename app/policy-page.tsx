"use client";

import { Typography } from "antd";

type PolicyPageProps = {
  title: string;
  intro: string;
  items: string[];
};

export default function PolicyPage({ title, intro, items }: PolicyPageProps) {
  return (
    <main className="slowfit-policy-page">
      <section className="slowfit-shell slowfit-policy-hero">
        <span className="slowfit-kicker">Slow Fit CR</span>
        <Typography.Title className="slowfit-display slowfit-section-title">{title}</Typography.Title>
        <Typography.Paragraph className="slowfit-policy-lead">{intro}</Typography.Paragraph>
      </section>
      <section className="slowfit-shell slowfit-policy-section">
        <article className="slowfit-policy-card">
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
