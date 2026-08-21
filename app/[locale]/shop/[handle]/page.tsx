import { redirect } from "next/navigation";

type CollectionPageProps = {
  params: Promise<{
    locale: string;
    handle: string;
  }>;
};

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { locale, handle } = await params;
  redirect(`/${locale}/shop?tag=${encodeURIComponent(handle)}`);
}
