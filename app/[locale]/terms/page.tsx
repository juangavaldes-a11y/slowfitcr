import type { Metadata } from "next";
import { Typography } from "antd";
import { notFound } from "next/navigation";
import { getCopy, isLocale, locales } from "../../i18n";

type PolicyPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PolicyPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const copy = getCopy(locale);

  return {
    title: `Slow Fit CR | ${copy.policies.terms.title}`,
    description: copy.policies.terms.intro,
    alternates: {
      canonical: `/${locale}/terms`,
      languages: Object.fromEntries(locales.map((value) => [value, `/${value}/terms`])),
    },
  };
}

export default async function TermsPage({ params }: PolicyPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const copy = getCopy(locale);

  return (
    <main className="slowfit-policy-page">
      <section className="slowfit-shell slowfit-policy-hero">
        <span className="slowfit-kicker">Slow Fit CR</span>
        <Typography.Title className="slowfit-display slowfit-section-title">
          {copy.policies.terms.title}
        </Typography.Title>
        <Typography.Paragraph className="slowfit-policy-lead">{copy.policies.terms.intro}</Typography.Paragraph>
      </section>
      <section className="slowfit-shell slowfit-policy-section">
        <article className="slowfit-policy-card">
          <ul>
            {copy.policies.terms.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}