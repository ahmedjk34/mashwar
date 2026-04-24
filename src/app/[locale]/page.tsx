import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import MashwarHome from "@/components/map/MashwarHome";
import { routing } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "metadata" });

  return {
    title: t("pageTitle"),
    description: t("pageDescription"),
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MashwarHome />;
}
