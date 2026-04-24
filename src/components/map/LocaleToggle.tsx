"use client";

import { useLocale, useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";

export default function LocaleToggle() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("home.language");

  const isAr = locale === "ar";

  return (
    <div
      role="group"
      aria-label={t("switchAria")}
      className="inline-flex h-11 w-full items-stretch gap-0.5 rounded-full border border-black/14 bg-[var(--clr-white)] p-0.5 shadow-[0_8px_20px_rgba(0,0,0,0.16)]"
      dir="ltr"
    >
      <button
        type="button"
        aria-pressed={!isAr}
        title={t("toEnglishTitle")}
        onClick={() => {
          if (locale !== "en") {
            router.replace(pathname, { locale: "en" });
          }
        }}
        className={`mashwar-mono flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-full px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--clr-green-bright)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--clr-white)] ${
          !isAr
            ? "bg-[#0a7a48] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
            : "bg-transparent text-[#3a3a36] hover:bg-[#e6e6e0] hover:text-[#121211]"
        }`}
      >
        EN
      </button>

      <button
        type="button"
        aria-pressed={isAr}
        title={t("toArabicTitle")}
        onClick={() => {
          if (locale !== "ar") {
            router.replace(pathname, { locale: "ar" });
          }
        }}
        className={`mashwar-arabic flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-full px-2 py-1.5 text-[11px] font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--clr-white)] ${
          isAr
            ? "bg-[#121211] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
            : "bg-transparent text-[#3a3a36] hover:bg-[#e6e6e0] hover:text-[#121211]"
        }`}
      >
        عربي
      </button>
    </div>
  );
}
