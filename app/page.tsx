import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPreferredLocale } from "./i18n";

export default async function Home() {
  const locale = getPreferredLocale((await headers()).get("accept-language"));
  redirect(`/${locale}`);
}
