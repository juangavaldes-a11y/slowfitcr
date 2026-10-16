import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getCopy, isLocale } from "../i18n";
import SiteNavigation from "../site-navigation";
import { isModuleEnabled } from "../../packages/core/config";

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <>
      <SiteNavigation copy={getCopy(locale)} locale={locale}
        modules={{
          catalog: isModuleEnabled("catalog"),
          customerAccount: isModuleEnabled("customerAccount"),
          reviews: isModuleEnabled("reviews"),
          admin: isModuleEnabled("admin"),
        }}
      />
      {children}
    </>
  );
}