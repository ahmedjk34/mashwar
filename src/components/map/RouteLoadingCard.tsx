"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";

/** Palestinan palette order for loading dots (shared with overlays and top-bar micro loaders). */
export const ROUTE_LOADING_DOT_SPECS = [
  ["var(--clr-black)", "0ms"],
  ["var(--clr-white)", "120ms"],
  ["var(--clr-green)", "240ms"],
  ["var(--clr-red)", "360ms"],
] as const;

export function RouteLoadingFlagStripe({
  className = "",
  dense = false,
}: {
  className?: string;
  /** Thinner stripe for inline / top-bar use. */
  dense?: boolean;
}) {
  const h = dense ? "h-[3px]" : "h-2";
  const redFlex = dense ? "flex-[1.25]" : "flex-[1.4]";
  return (
    <div
      className={`flex ${h} w-full shrink-0 overflow-hidden rounded-sm opacity-95 ${className}`}
      aria-hidden
    >
      <span className="h-full flex-[2] bg-[var(--clr-black)]" />
      <span className="h-full flex-[2] bg-[var(--clr-white)]" />
      <span className="h-full flex-[2] bg-[var(--clr-green)]" />
      <span className={`h-full ${redFlex} bg-[var(--clr-red)]`} />
    </div>
  );
}

export function RouteLoadingMicroDots({
  className = "",
  dotClassName = "h-2 w-2 rounded-full",
  gapClass = "gap-1",
  justify = "center" as "center" | "start" | "end",
  count = 4 as 2 | 4,
}: {
  className?: string;
  dotClassName?: string;
  gapClass?: string;
  justify?: "center" | "start" | "end";
  count?: 2 | 4;
}) {
  const justifyClass =
    justify === "start" ? "justify-start" : justify === "end" ? "justify-end" : "justify-center";
  const specs = ROUTE_LOADING_DOT_SPECS.slice(0, count);
  return (
    <div className={`flex items-center ${gapClass} ${justifyClass} ${className}`} aria-hidden>
      {specs.map(([color, delay], i) => (
        <span
          key={i}
          className={`mashwar-route-loading-dot inline-block ${dotClassName}`}
          style={{
            backgroundColor: color,
            animationDelay: delay,
          }}
        />
      ))}
    </div>
  );
}

export type RouteLoadingMessageNamespace =
  | "home.route.loadingModal"
  | "nlRoute.loadingModal";

export type RouteLoadingLayout = "card" | "panel";

interface RouteLoadingCardProps {
  messageNamespace: RouteLoadingMessageNamespace;
  className?: string;
  layout?: RouteLoadingLayout;
  /** When true, wraps the card in a `role="status"` region for screen readers. */
  withStatusRole?: boolean;
  /** Optional stable ids (e.g. parent dialog `aria-labelledby`). */
  titleId?: string;
  descId?: string;
}

export default function RouteLoadingCard({
  messageNamespace,
  className = "",
  layout = "card",
  withStatusRole = false,
  titleId: titleIdProp,
  descId: descIdProp,
}: RouteLoadingCardProps) {
  const locale = useLocale();
  const t = useTranslations(messageNamespace);
  const dir: "rtl" | "ltr" = locale === "ar" ? "rtl" : "ltr";
  const reactId = useId();
  const safeId = reactId.replace(/:/g, "");
  const titleId = titleIdProp ?? `route-loading-title-${safeId}`;
  const descId = descIdProp ?? `route-loading-desc-${safeId}`;
  const textAlign = dir === "rtl" ? "text-end" : "text-start";
  const descMargin = dir === "rtl" ? "ms-auto" : "me-auto";

  const dotRow = (
    <div
      className={`mt-8 flex w-full gap-3 sm:mt-10 ${dir === "rtl" ? "justify-end" : "justify-start"}`}
      aria-hidden
    >
      {ROUTE_LOADING_DOT_SPECS.map(([color, delay], i) => (
        <span
          key={i}
          className="mashwar-route-loading-dot inline-block h-3.5 w-3.5 rounded-full sm:h-4 sm:w-4"
          style={{
            backgroundColor: color,
            animationDelay: delay,
          }}
        />
      ))}
    </div>
  );

  if (layout === "panel") {
    const panel = (
      <div
        className={`relative flex min-h-[min(56vh,26rem)] w-full flex-1 flex-col overflow-hidden sm:min-h-[min(58vh,28rem)] ${className}`}
        dir={dir}
      >
        <div
          className="pointer-events-none absolute inset-y-0 start-0 w-1 bg-gradient-to-b from-[#0d0d0d] via-[#f5f5f0] to-[#006233] sm:w-1.5"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_95%_55%_at_100%_-10%,rgba(238,42,53,0.16),transparent_52%),radial-gradient(ellipse_75%_45%_at_0%_105%,rgba(0,98,51,0.14),transparent_50%),radial-gradient(ellipse_60%_40%_at_50%_45%,rgba(245,245,240,0.045),transparent_62%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -end-8 top-1/2 h-[min(70%,22rem)] w-[min(42%,14rem)] -translate-y-1/2 opacity-[0.07]"
          aria-hidden
        >
          <svg viewBox="0 0 100 100" className="h-full w-full text-[var(--clr-red)]" preserveAspectRatio="none">
            <polygon points="0,0 100,50 0,100" fill="currentColor" />
          </svg>
        </div>

        <div className="relative flex flex-1 flex-col px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8 md:px-10">
          <div className="mb-5 sm:mb-6">
            <RouteLoadingFlagStripe className="opacity-[0.92]" />
          </div>

          <div className="flex min-h-[12rem] flex-1 flex-col sm:min-h-[14rem]">
            <p
              className={`mashwar-mono w-full max-w-2xl ${textAlign} text-[10px] font-semibold uppercase tracking-[0.32em] text-[#6b7280] sm:text-[11px]`}
            >
              {t("kicker")}
            </p>
            <h2
              id={titleId}
              className={`mashwar-arabic mt-3 w-full max-w-2xl ${textAlign} text-[22px] font-bold leading-snug text-[#f9fafb] sm:mt-3.5 sm:text-[26px]`}
            >
              {t("title")}
            </h2>
            <p
              id={descId}
              className={`mashwar-arabic mt-4 w-full max-w-[52ch] ${textAlign} text-[14px] leading-[1.75] text-[#94a3b8] sm:text-[15px] ${descMargin}`}
            >
              {t("body")}
            </p>
            {dotRow}
          </div>

          <div className="mt-auto border-t border-white/[0.07] pt-6 sm:pt-8" aria-hidden>
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-4"
                  style={{ animationDelay: `${i * 140}ms` }}
                >
                  <div
                    className={`h-2.5 w-28 rounded bg-white/[0.1] ${dir === "rtl" ? "ms-auto" : ""}`}
                  />
                  <div
                    className={`mt-3 h-3 w-[88%] max-w-xl rounded bg-white/[0.06] ${dir === "rtl" ? "ms-auto" : ""}`}
                  />
                  <div
                    className={`mt-2 h-3 w-[62%] max-w-md rounded bg-white/[0.05] ${dir === "rtl" ? "ms-auto" : ""}`}
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-lg">
                    <div className="h-12 rounded-[10px] bg-white/[0.04]" />
                    <div className="h-12 rounded-[10px] bg-white/[0.04]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );

    if (withStatusRole) {
      return (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          className="flex min-h-0 w-full min-w-0 flex-1 flex-col"
        >
          {panel}
        </div>
      );
    }

    return panel;
  }

  const card = (
    <div
      className={`relative w-full max-w-md overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-raised)]/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[var(--glass-blur)] ${className}`}
      dir={dir}
    >
      <RouteLoadingFlagStripe />

      <div className="relative px-5 pb-6 pt-5 sm:px-6 sm:pb-7 sm:pt-6">
        <div
          className="pointer-events-none absolute -right-5 -top-5 h-20 w-20 opacity-[0.12] sm:-right-6 sm:-top-6 sm:h-24 sm:w-24 sm:opacity-[0.14]"
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
          id={titleId}
          className="mashwar-arabic mt-2.5 text-center text-[clamp(1rem,2.8vw,1.35rem)] font-bold leading-snug text-[var(--clr-white)] sm:mt-3 sm:text-[var(--text-lg)]"
        >
          {t("title")}
        </h2>

        <p
          id={descId}
          className="mashwar-arabic mt-2.5 text-center text-[13px] leading-relaxed text-[var(--clr-sand)] sm:mt-3 sm:text-[var(--text-sm)]"
        >
          {t("body")}
        </p>

        <div className="mt-6 flex justify-center gap-2.5 sm:mt-7" aria-hidden>
          {ROUTE_LOADING_DOT_SPECS.map(([color, delay], i) => (
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
  );

  if (withStatusRole) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full"
      >
        {card}
      </div>
    );
  }

  return card;
}
