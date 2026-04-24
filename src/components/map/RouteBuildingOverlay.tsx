"use client";

import { useLocale, useTranslations } from "next-intl";

interface RouteBuildingOverlayProps {
  open: boolean;
}

export default function RouteBuildingOverlay({ open }: RouteBuildingOverlayProps) {
  const locale = useLocale();
  const t = useTranslations("home.route.loadingModal");
  const dir: "rtl" | "ltr" = locale === "ar" ? "rtl" : "ltr";

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-[var(--clr-black)]/55 p-4 backdrop-blur-[6px]"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
      aria-describedby="route-building-overlay-desc"
      aria-labelledby="route-building-overlay-title"
    >
      <div
        className="relative w-full max-w-[min(100%,380px)] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-raised)]/92 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-[var(--glass-blur)]"
        dir={dir}
      >
        <div className="flex h-2 w-full" aria-hidden>
          <span className="h-full flex-[2] bg-[var(--clr-black)]" />
          <span className="h-full flex-[2] bg-[var(--clr-white)]" />
          <span className="h-full flex-[2] bg-[var(--clr-green)]" />
          <span className="h-full flex-[1.4] bg-[var(--clr-red)]" />
        </div>

        <div className="relative px-6 pb-7 pt-6">
          <div
            className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 opacity-[0.14]"
            aria-hidden
          >
            <svg viewBox="0 0 100 100" className="h-full w-full text-[var(--clr-red)]">
              <polygon points="0,0 100,50 0,100" fill="currentColor" />
            </svg>
          </div>

          <p className="mashwar-mono text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--clr-slate)]">
            {t("kicker")}
          </p>

          <h2
            id="route-building-overlay-title"
            className="mashwar-arabic mt-3 text-center text-[var(--text-lg)] font-bold leading-snug text-[var(--clr-white)]"
          >
            {t("title")}
          </h2>

          <p
            id="route-building-overlay-desc"
            className="mashwar-arabic mt-3 text-center text-[var(--text-sm)] leading-relaxed text-[var(--clr-sand)]"
          >
            {t("body")}
          </p>

          <div className="mt-7 flex justify-center gap-2.5" aria-hidden>
            {(
              [
                ["var(--clr-black)", "0ms"],
                ["var(--clr-white)", "120ms"],
                ["var(--clr-green)", "240ms"],
                ["var(--clr-red)", "360ms"],
              ] as const
            ).map(([color, delay], i) => (
              <span
                key={i}
                className="mashwar-route-loading-dot inline-block h-3 w-3 rounded-full"
                style={{
                  backgroundColor: color,
                  animationDelay: delay,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
