import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReviewModerationPanel from "../../../review-moderation-panel";
import { isLocale, locales, type Locale } from "../../../i18n";

type AdminReviewsPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: AdminReviewsPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  return {
    title: "Slow Fit CR | Review Moderation",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function AdminReviewsPage({ params }: AdminReviewsPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return <ReviewModerationPanel locale={locale as Locale} />;
}
