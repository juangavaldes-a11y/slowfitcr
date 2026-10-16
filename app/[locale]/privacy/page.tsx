import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PolicyPage from "../../policy-page";
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
    title: `Slow Fit CR | ${copy.policies.privacy.title}`,
    description: copy.policies.privacy.intro,
    alternates: {
      canonical: `/${locale}/privacy`,
      languages: Object.fromEntries(locales.map((value) => [value, `/${value}/privacy`])),
    },
  };
}

export default async function PrivacyPage({ params }: PolicyPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const copy = getCopy(locale);

  return <PolicyPage title={copy.policies.privacy.title} intro={copy.policies.privacy.intro} items={copy.policies.privacy.items} />;
}