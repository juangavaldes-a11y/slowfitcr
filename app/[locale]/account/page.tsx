import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AccountPanel from "../../account-panel";
import { isLocale, locales, type Locale } from "../../i18n";
import { isModuleEnabled } from "../../../packages/core/config";

type AccountPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ resetToken?: string; payment?: string; reference?: string }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: AccountPageProps): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "es" ? "Cuenta | Slow Fit CR" : "Account | Slow Fit CR",
    robots: { index: false, follow: false },
  };
}

export default async function AccountPage({ params, searchParams }: AccountPageProps) {
  const { locale } = await params;
  const { resetToken, payment, reference } = await searchParams;
  if (!isLocale(locale)) notFound();
  if (!isModuleEnabled("customerAccount")) notFound();
  return <AccountPanel
    locale={locale as Locale}
    resetToken={resetToken}
    paymentStatus={payment === "success" ? "success" : payment === "cancelled" ? "cancelled" : undefined}
    reference={reference}
  />;
}