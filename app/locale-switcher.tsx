"use client";

import { GlobalOutlined } from "@ant-design/icons";
import { Segmented } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { locales, type Locale } from "./i18n";

type LocaleSwitcherProps = {
  locale: Locale;
};

export default function LocaleSwitcher({ locale }: LocaleSwitcherProps) {
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);

    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  const options = useMemo(
    () =>
      locales.map((targetLocale) => ({
        label: (
          <Link href={buildLocaleHref(pathname, targetLocale, hash)} scroll={false}>
            {targetLocale.toUpperCase()}
          </Link>
        ),
        value: targetLocale,
      })),
    [hash, pathname],
  );

  return (
    <div className="slowfit-locale-switcher" aria-label="Language switcher">
      <GlobalOutlined />
      <Segmented value={locale} options={options} />
    </div>
  );
}

function buildLocaleHref(pathname: string, targetLocale: Locale, hash: string) {
  const currentPath = pathname === "/" ? "" : pathname.replace(/^\/(en|es)/, "");
  const nextPath = currentPath ? `/${targetLocale}${currentPath}` : `/${targetLocale}`;
  return `${nextPath}${hash}`;
}