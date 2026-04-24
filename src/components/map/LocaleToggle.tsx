"use client";

import { useLocale, useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";

export default function LocaleToggle() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("home.language");
  const tFloat = useTranslations("home.floating");

  const nextLocale = locale === "ar" ? "en" : "ar";

  return (
    <button
      type="button"
      onClick={() => {
        router.replace(pathname, { locale: nextLocale });
      }}
      title={nextLocale === "en" ? t("toEnglishTitle") : t("toArabicTitle")}
      aria-label={t("switchAria")}
      className="mashwar-arabic inline-flex max-w-[9.5rem] items-center gap-2 rounded-xl border border-violet-400/55 bg-violet-500/[0.16] px-2 py-1.5 text-violet-100 shadow-[0_0_0_1px_rgba(167,139,250,0.35),0_8px_24px_rgba(0,0,0,0.35)] shadow-lg transition duration-200 ease-out hover:border-violet-300/80 hover:bg-violet-500/[0.22] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/75 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(12,12,12,0.9)] active:scale-[0.98] sm:max-w-[10.5rem]"
      style={{ backdropFilter: "blur(10px)" }}
      dir="ltr"
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-950/40 text-[10px] font-bold leading-none text-violet-200 ring-1 ring-violet-400/40"
        aria-hidden
      >
        A
      </span>
      <span className="min-w-0 flex-1 text-center text-[10px] font-semibold leading-snug sm:text-[11px]">
        {locale === "ar" ? t("switchToEn") : t("switchToAr")}
      </span>
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-950/40 text-[10px] font-bold leading-none text-violet-200 ring-1 ring-violet-400/40"
        aria-hidden
      >
        ع
      </span>
      <span className="sr-only">{tFloat("languageTitle")}</span>
    </button>
  );
}
