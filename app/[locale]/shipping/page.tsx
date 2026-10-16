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
    title: `Slow Fit CR | ${copy.policies.shipping.title}`,
    description: copy.policies.shipping.intro,
    alternates: {
      canonical: `/${locale}/shipping`,
      languages: Object.fromEntries(locales.map((value) => [value, `/${value}/shipping`])),
    },
  };
}

export default async function ShippingPage({ params }: PolicyPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const copy = getCopy(locale);

  return <PolicyPage title={copy.policies.shipping.title} intro={copy.policies.shipping.intro} items={copy.policies.shipping.items} />;
}