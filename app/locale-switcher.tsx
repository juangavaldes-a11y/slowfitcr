"use client";

import { GlobalOutlined } from "@ant-design/icons";
import { Segmented } from "antd";
import { usePathname } from "next/navigation";
import { locales, type Locale } from "./i18n";

type LocaleSwitcherProps = {
  locale: Locale;
};

export default function LocaleSwitcher({ locale }: LocaleSwitcherProps) {
  const pathname = usePathname();
  const options = locales.map((targetLocale) => ({
    label: targetLocale.toUpperCase(),
    value: targetLocale,
  }));

  const changeLocale = (targetLocale: Locale) => {
    if (targetLocale === locale) {
      return;
    }

    window.location.assign(buildLocaleHref(pathname, targetLocale, window.location.search, window.location.hash));
  };

  return (
    <div className="slowfit-locale-switcher" aria-label="Language switcher">
      <GlobalOutlined />
      <Segmented value={locale} options={options} onChange={(value) => changeLocale(value as Locale)} />
    </div>
  );
}

function buildLocaleHref(pathname: string, targetLocale: Locale, search: string, hash: string) {
  const currentPath = pathname === "/" ? "" : pathname.replace(/^\/(en|es)/, "");
  const nextPath = currentPath ? `/${targetLocale}${currentPath}` : `/${targetLocale}`;
  return `${nextPath}${search}${hash}`;
}