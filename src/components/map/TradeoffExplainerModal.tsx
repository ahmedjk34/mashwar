"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { RouteLoadingFlagStripe } from "@/components/map/RouteLoadingCard";
import type {
  NormalizedRoutes,
  RoutingRiskLevel,
  RoutingRouteViability,
  RoutingStatusBucket,
} from "@/lib/types/map";

type TradeoffExplainer = NonNullable<NormalizedRoutes["tradeoffExplainer"]>;
type TradeoffRoute = TradeoffExplainer["routes"][number];

interface TradeoffExplainerModalProps {
  explainer: TradeoffExplainer | null;
  selectedRouteId: string | null;
  onRouteSelect: (routeId: string) => void;
  /** Fired when the full explainer dialog is open vs collapsed/hidden (for coordinating top chrome). */
  onExplainerOpenChange?: (isDialogOpen: boolean) => void;
}

const RISK_VISUALS: Record<
  "low" | "medium" | "high" | "unknown",
  { text: string; bg: string; border: string; meter: string }
> = {
  low: {
    text: "#b8d4a8",
    bg: "rgba(90, 124, 72, 0.18)",
    border: "rgba(120, 148, 96, 0.42)",
    meter: "#6b8f56",
  },
  medium: {
    text: "#e8c98a",
    bg: "rgba(168, 124, 48, 0.16)",
    border: "rgba(200, 155, 72, 0.38)",
    meter: "#c49a3c",
  },
  high: {
    text: "#f0b4a8",
    bg: "rgba(160, 64, 52, 0.2)",
    border: "rgba(200, 90, 72, 0.42)",
    meter: "#c45c48",
  },
  unknown: {
    text: "#c8cdd4",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.28)",
    meter: "#94a3b8",
  },
};

const STATUS_VISUALS: Record<
  RoutingStatusBucket,
  { text: string; bg: string; border: string }
> = {
  green: {
    text: "#b8d4a8",
    bg: "rgba(90, 124, 72, 0.18)",
    border: "rgba(120, 148, 96, 0.42)",
  },
  yellow: {
    text: "#e8c98a",
    bg: "rgba(168, 124, 48, 0.16)",
    border: "rgba(200, 155, 72, 0.38)",
  },
  red: {
    text: "#f0b4a8",
    bg: "rgba(160, 64, 52, 0.2)",
    border: "rgba(200, 90, 72, 0.42)",
  },
  unknown: {
    text: "#c8cdd4",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.28)",
  },
};

function formatNumber(value: number | null, fractionDigits = 0, na: string): string {
  if (value === null || !Number.isFinite(value)) {
    return na;
  }

  return value.toFixed(fractionDigits);
}

function formatSignedNumber(value: number | null, fractionDigits: number, na: string): string {
  if (value === null || !Number.isFinite(value)) {
    return na;
  }

  const rounded = value.toFixed(fractionDigits);
  return value > 0 ? `+${rounded}` : rounded;
}

function formatMinutesI18n(
  value: number | null,
  na: string,
  locale: string,
  t: (key: "minutesWithUnit", values: { n: string }) => string,
): string {
  if (value === null || !Number.isFinite(value)) {
    return na;
  }

  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Math.round(value),
  );
  return t("minutesWithUnit", { n });
}

function formatDistance(value: number | null, locale: string, na: string): string {
  if (value === null || !Number.isFinite(value)) {
    return na;
  }

  if (value >= 1000) {
    const km = value / 1000;
    const digits = value >= 10000 ? 0 : 1;
    const n = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits ? 1 : 0,
      maximumFractionDigits: digits,
    }).format(km);
    return locale === "ar" ? `${n} كم` : `${n} km`;
  }

  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
  return locale === "ar" ? `${n} م` : `${n} m`;
}

function formatPercent(value: number | null, locale: string, na: string): string {
  if (value === null || !Number.isFinite(value)) {
    return na;
  }

  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Math.round(value * 100),
  );
  return locale === "ar" ? `${n}٪` : `${n}%`;
}

function joinList(values: string[], na: string): string {
  return values.length > 0 ? values.join(" · ") : na;
}

function normalizeStatus(value: RoutingStatusBucket | string | null | undefined): RoutingStatusBucket {
  if (
    value === "green" ||
    value === "yellow" ||
    value === "red" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}

function getStatusStyle(status: RoutingStatusBucket | string | null | undefined) {
  const normalized = normalizeStatus(status);
  const visual = STATUS_VISUALS[normalized];

  return {
    text: visual.text,
    bg: visual.bg,
    border: visual.border,
  };
}

function getRiskVisual(level: TradeoffRoute["riskLevel"]) {
  return RISK_VISUALS[level ?? "unknown"] ?? RISK_VISUALS.unknown;
}

function normalizeRiskLevel(level: TradeoffRoute["riskLevel"]): RoutingRiskLevel {
  if (level === "low" || level === "medium" || level === "high" || level === "unknown") {
    return level;
  }

  return "unknown";
}

type ViabilityKey = "good" | "risky" | "avoid" | "unknown";

function viabilityKey(value: string | null | undefined): ViabilityKey {
  if (value === "good" || value === "risky" || value === "avoid") {
    return value;
  }

  return "unknown";
}

function MetricChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: {
    text: string;
    bg: string;
    border: string;
  };
}) {
  return (
    <div
      className="rounded-[14px] border px-3 py-2"
      style={{
        color: tone?.text ?? "var(--tradeoff-fg-muted, #dbe4f0)",
        backgroundColor: tone?.bg ?? "rgba(255,255,255,0.03)",
        borderColor: tone?.border ?? "rgba(255,255,255,0.08)",
      }}
    >
      <p
        className="mashwar-mono text-[9px] uppercase tracking-[0.2em]"
        style={{ color: tone?.text ? `${tone.text}cc` : "#94a3b8" }}
      >
        {label}
      </p>
      <p className="mt-1 text-[13px] font-semibold text-inherit">{value}</p>
    </div>
  );
}

export default function TradeoffExplainerModal({
  explainer,
  selectedRouteId,
  onRouteSelect,
  onExplainerOpenChange,
}: TradeoffExplainerModalProps) {
  const locale = useLocale();
  const isArabic = locale === "ar";
  const t = useTranslations("tradeoff");
  const tRisk = useTranslations("routing.risk");
  const tBucket = useTranslations("routing.bucket");
  const tDir = useTranslations("routing.direction");

  const [isOpen, setIsOpen] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const routeRefs = useRef(new Map<string, HTMLDivElement | null>());

  const na = t("valueNa");

  const explainerKey = useMemo(
    () =>
      [
        explainer?.winnerRouteId ?? "",
        explainer?.winnerRank ?? "",
        explainer?.comparedRouteCount ?? "",
        explainer?.fullText ?? "",
      ].join("|"),
    [explainer],
  );

  useEffect(() => {
    if (!explainer) {
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    setIsCollapsed(false);
  }, [explainerKey, explainer]);

  useEffect(() => {
    if (!explainer) {
      onExplainerOpenChange?.(false);
      return;
    }
    onExplainerOpenChange?.(isOpen);
  }, [explainer, isOpen, onExplainerOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const routes = explainer
    ? [...explainer.routes].sort((left, right) => left.rank - right.rank)
    : [];
  const winnerRoute = explainer
    ? routes.find((route) => route.routeId === explainer.winnerRouteId) ?? routes[0] ?? null
    : null;
  const selectedOrWinnerRouteId = selectedRouteId ?? winnerRoute?.routeId ?? null;
  const maxDuration = Math.max(0, ...routes.map((route) => route.durationMinutes ?? 0));
  const maxRisk = Math.max(0, ...routes.map((route) => route.riskScore ?? 0));
  const maxDelay = Math.max(0, ...routes.map((route) => route.expectedDelayMinutes ?? 0));

  useEffect(() => {
    if (!isOpen || !winnerRoute?.uiKey) {
      return;
    }

    const winnerCard = routeRefs.current.get(winnerRoute.uiKey);
    if (!winnerCard) {
      return;
    }

    winnerCard.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [isOpen, winnerRoute?.uiKey]);

  if (!explainer) {
    return null;
  }

  const focusRoute = (route: TradeoffRoute) => {
    onRouteSelect(route.routeId);
    setIsOpen(true);
    setIsCollapsed(false);

    requestAnimationFrame(() => {
      routeRefs.current.get(route.uiKey)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    });
  };

  const scrollToWinner = () => {
    if (winnerRoute) {
      focusRoute(winnerRoute);
    }
  };

  const winnerDisplay =
    isArabic
      ? (winnerRoute?.labelAr ?? winnerRoute?.labelEn ?? explainer.winnerRouteId ?? na)
      : (winnerRoute?.labelEn ?? winnerRoute?.labelAr ?? explainer.winnerRouteId ?? na);

  const decisionDriver =
    isArabic
      ? (explainer.setSummary.decisionDriverAr ??
        explainer.setSummary.decisionDriverEn ??
        t("noDriverAr"))
      : (explainer.setSummary.decisionDriverEn ??
        explainer.setSummary.decisionDriverAr ??
        t("noDriverEn"));

  const narrativeBody = isArabic
    ? (explainer.arabicText?.trim() ||
        explainer.fullText?.trim() ||
        t("noArabicExplanation"))
    : (explainer.englishText?.trim() ||
        explainer.fullText?.trim() ||
        t("noEnglishExplanation"));

  const comparedCount =
    explainer.comparedRouteCount !== null && explainer.comparedRouteCount !== undefined
      ? Math.round(explainer.comparedRouteCount)
      : routes.length;

  const riskLabel = (level: TradeoffRoute["riskLevel"]) =>
    tRisk(normalizeRiskLevel(level));

  const bucketLabel = (status: RoutingStatusBucket | string | null | undefined) =>
    tBucket(normalizeStatus(status));

  const viabilityLabel = (value: string | null | undefined) => {
    switch (viabilityKey(value)) {
      case "good":
        return t("viability.good");
      case "risky":
        return t("viability.risky");
      case "avoid":
        return t("viability.avoid");
      default:
        return t("viability.unknown");
    }
  };

  const directionLabel = (key: "entering" | "leaving" | "transit" | "unknown") => tDir(key);

  if (!isOpen) {
    return (
      <div
        className={`mashwar-tradeoff-anchor fixed z-[1150] flex ${
          isArabic ? "left-3 sm:left-4" : "right-3 sm:right-4"
        }`}
        style={{ top: "1rem" }}
      >
        <div className="mashwar-tradeoff-collapsed-enter mashwar-tradeoff-collapsed-wrap w-full max-w-[min(calc(100vw-1.5rem),22rem)] overflow-hidden rounded-full border-2 border-[rgba(107,143,86,0.65)] backdrop-blur-xl">
          <RouteLoadingFlagStripe dense className="opacity-100" />
          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              setIsCollapsed(false);
            }}
            className="mashwar-tradeoff-collapsed-cta mashwar-arabic flex w-full items-center justify-center gap-2.5 border-0 border-t border-white/[0.12] px-4 py-2.5 text-center text-[13px] font-semibold leading-snug transition sm:px-5 sm:py-3 sm:text-[14px]"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#7cb86a] shadow-[0_0_12px_rgba(124,184,106,0.75)]" />
            {t("showExplainer")}
          </button>
        </div>
      </div>
    );
  }

  const shellClass =
    "mashwar-tradeoff-shell mashwar-tradeoff-shell-enter pointer-events-auto w-[min(100vw-1.5rem,460px)] h-full flex flex-col overflow-hidden rounded-[26px] border shadow-[0_30px_100px_rgba(0,0,0,0.72)] backdrop-blur-2xl";

  return (
    <div
      className={`mashwar-tradeoff-anchor fixed z-[1150] flex ${
        isArabic ? "left-3 sm:left-4" : "right-3 sm:right-4"
      }`}
      style={{ top: "1rem", bottom: "1rem" }}
      aria-live="polite"
    >
      <section
        role="dialog"
        aria-modal="false"
        aria-label={t("ariaLabel")}
        className={shellClass}
      >
        <div className="mashwar-tradeoff-sheen flex h-full flex-col">
          <header
            className={`flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-5 ${
              isArabic ? "text-right mashwar-rtl" : "text-left"
            }`}
            style={{ borderColor: "var(--tradeoff-border)" }}
            dir={isArabic ? "rtl" : "ltr"}
          >
            <div className="min-w-0 flex-1">
              <div className={`flex flex-wrap items-center gap-2 ${isArabic ? "justify-end" : ""}`}>
                <span className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#8a939e]">
                  {t("header")}
                </span>
                <button
                  type="button"
                  onClick={scrollToWinner}
                  className="rounded-full border px-3 py-1 text-[13px] font-semibold transition mashwar-tradeoff-winner-pill"
                >
                  {t("winner", {
                    rank:
                      explainer.winnerRank !== null && explainer.winnerRank !== undefined
                        ? String(Math.round(explainer.winnerRank))
                        : "—",
                  })}
                </button>
                <span className="rounded-full border px-3 py-1 text-[13px] text-[#dbe4f0] mashwar-tradeoff-chip">
                  {t("routesCompared", { count: comparedCount })}
                </span>
              </div>

              <h2
                className={`mt-3 text-[20px] font-semibold text-[#f4f6f8] sm:text-[23px] ${
                  isArabic ? "mashwar-arabic" : "mashwar-display"
                }`}
              >
                {t("title")}
              </h2>

              <p className="mt-1 text-[12px] text-[#a8b0ba]">
                <span className="font-medium text-[#dbe4f0]">{t("recommended")}</span>{" "}
                <span className="font-semibold text-[#f4f6f8]">{winnerDisplay}</span>
              </p>

              <p
                className={`mt-2 text-[14px] leading-relaxed text-[#dce2e8] ${
                  isArabic ? "mashwar-arabic" : ""
                }`}
              >
                {decisionDriver}
              </p>

              {explainer.setSummary.corridorNote ? (
                <p className="mt-3">
                  <span className="mashwar-tradeoff-corridor-pill inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] text-[#c8e6e4]">
                    <span className="mashwar-mono text-[9px] uppercase tracking-[0.2em] text-[#7a9e9a]">
                      {t("corridor")}
                    </span>
                    <span className={isArabic ? "mashwar-arabic" : ""}>
                      {explainer.setSummary.corridorNote}
                    </span>
                  </span>
                </p>
              ) : null}

              <div
                className={`mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-white/[0.06] pt-4 text-[13px] ${
                  isArabic ? "mashwar-rtl justify-end" : ""
                }`}
              >
                <span>
                  <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-[#7d8692]">
                    {t("metric.timeSpread")}
                  </span>
                  <span className="font-semibold text-[#eef2f6]">
                    {formatMinutesI18n(explainer.setSummary.timeSpreadMinutes, na, locale, t)}
                  </span>
                </span>
                <span>
                  <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-[#7d8692]">
                    {t("metric.delaySpread")}
                  </span>
                  <span className="font-semibold text-[#eef2f6]">
                    {formatMinutesI18n(explainer.setSummary.delaySpreadMinutes, na, locale, t)}
                  </span>
                </span>
                <span>
                  <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-[#7d8692]">
                    {t("metric.checkpointSpread")}
                  </span>
                  <span className="font-semibold text-[#eef2f6]">
                    {formatNumber(explainer.setSummary.checkpointSpread, 0, na)}
                  </span>
                </span>
              </div>

              <details className="mt-3 group border-t border-white/[0.06] pt-3">
                <summary className="cursor-pointer list-none text-[11px] text-[#8fb0ac] marker:content-none [&::-webkit-details-marker]:hidden hover:text-[#b5d4d0]">
                  <span className="underline-offset-2 group-open:no-underline hover:underline">
                    {t("moreSpreadMetrics")}
                  </span>
                </summary>
                <div
                  className={`mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[13px] ${
                    isArabic ? "mashwar-rtl justify-end" : ""
                  }`}
                >
                  <span>
                    <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-[#7d8692]">
                      {t("metric.riskSpread")}
                    </span>
                    <span className="font-semibold text-[#eef2f6]">
                      {formatNumber(explainer.setSummary.riskSpread, 2, na)}
                    </span>
                  </span>
                  <span>
                    <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-[#7d8692]">
                      {t("metric.confidenceSpread")}
                    </span>
                    <span className="font-semibold text-[#eef2f6]">
                      {formatPercent(explainer.setSummary.confidenceSpread, locale, na)}
                    </span>
                  </span>
                  <span>
                    <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-[#7d8692]">
                      {t("metric.volatilitySpread")}
                    </span>
                    <span className="font-semibold text-[#eef2f6]">
                      {formatNumber(explainer.setSummary.volatilitySpread, 2, na)}
                    </span>
                  </span>
                </div>
              </details>
            </div>

            <div className={`flex shrink-0 flex-col gap-2 ${isArabic ? "items-start" : "items-end"}`}>
              <button
                type="button"
                onClick={() => setIsCollapsed((current) => !current)}
                className="rounded-full border px-3 py-2 text-[13px] font-semibold text-[#dbe4f0] transition mashwar-tradeoff-chip hover:bg-white/[0.06]"
              >
                {isCollapsed ? t("expand") : t("collapse")}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border text-[#dbe4f0] transition mashwar-tradeoff-chip hover:bg-white/[0.06] hover:text-[#f9fafb]"
                aria-label={t("closeAria")}
              >
                ×
              </button>
            </div>
          </header>

          {!isCollapsed ? (
            <div className="mashwar-tradeoff-body-stagger mashwar-tradeoff-scroll-region flex-1 overflow-y-auto mashwar-scroll px-4 py-4 sm:px-5">
              {narrativeBody ? (
                <details className="mb-5 rounded-2xl border border-white/[0.07] bg-black/15 px-4 py-3 mashwar-tradeoff-panel">
                  <summary className="cursor-pointer list-none text-[13px] font-semibold text-[#e8ecef] marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="underline-offset-2 hover:underline">{t("narrativeToggleShow")}</span>
                  </summary>
                  <p
                    className={`mt-3 whitespace-pre-line text-[13px] leading-relaxed text-[#b4bcc6] ${
                      isArabic ? "mashwar-arabic mashwar-rtl text-right" : ""
                    }`}
                    dir={isArabic ? "rtl" : "ltr"}
                  >
                    {narrativeBody}
                  </p>
                </details>
              ) : null}

              <section>
                <div
                  className={`flex flex-wrap items-center justify-between gap-3 ${
                    isArabic ? "flex-row-reverse text-right" : ""
                  }`}
                >
                  <div className={isArabic ? "mashwar-rtl" : ""}>
                    <p className="mashwar-mono text-[10px] uppercase tracking-[0.24em] text-[#8a939e]">
                      {t("comparison")}
                    </p>
                    <p className="mt-1 text-[13px] text-[#94a3b8]">{t("comparisonSub")}</p>
                  </div>
                  {winnerRoute ? (
                    <button
                      type="button"
                      onClick={scrollToWinner}
                      className="rounded-full border px-3 py-2 text-[11px] font-semibold transition mashwar-tradeoff-winner-pill"
                    >
                      {t("jumpWinner")}
                    </button>
                  ) : null}
                </div>

                {routes.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {routes.map((route) => {
                      const isWinner = route.routeId === explainer.winnerRouteId;
                      const isSelected = route.routeId === selectedOrWinnerRouteId;
                      const riskVisual = getRiskVisual(route.riskLevel);
                      const statusStyle = getStatusStyle(route.worstPredictedStatus);
                      const durationPct =
                        maxDuration > 0 && route.durationMinutes !== null
                          ? Math.max(0.06, route.durationMinutes / maxDuration)
                          : 0.12;
                      const riskPct =
                        maxRisk > 0 && route.riskScore !== null
                          ? Math.max(0.06, route.riskScore / maxRisk)
                          : 0.12;
                      const delayPct =
                        maxDelay > 0 && route.expectedDelayMinutes !== null
                          ? Math.max(0.06, route.expectedDelayMinutes / maxDelay)
                          : 0.12;
                      const facts =
                        isArabic ? route.comparisonFacts.arabic : route.comparisonFacts.english;
                      const whyLine = facts[0] ?? t("noComparisonFacts");
                      const routeTitle =
                        isArabic
                          ? (route.labelAr ?? route.labelEn ?? t("unnamedRoute"))
                          : (route.labelEn ?? route.labelAr ?? t("unnamedRoute"));

                      return (
                        <div
                          key={route.uiKey}
                          ref={(node) => {
                            routeRefs.current.set(route.uiKey, node);
                          }}
                          className={`overflow-hidden rounded-2xl border transition-colors duration-100 ease-out mashwar-tradeoff-route-card ${
                            isSelected ? "mashwar-tradeoff-route-selected" : ""
                          }`}
                          dir={isArabic ? "rtl" : "ltr"}
                        >
                          <button
                            type="button"
                            onClick={() => focusRoute(route)}
                            className={`w-full px-4 py-3 text-left transition hover:bg-white/[0.04] ${
                              isArabic ? "text-right mashwar-rtl" : ""
                            }`}
                          >
                            <div
                              className={`flex flex-wrap items-center justify-between gap-2 ${
                                isArabic ? "flex-row-reverse" : ""
                              }`}
                            >
                              <div
                                className={`flex flex-wrap items-center gap-2 ${
                                  isArabic ? "justify-end" : ""
                                }`}
                              >
                                <span className="mashwar-mono text-[14px] font-semibold text-[#9aa5b2]">
                                  #{route.rank}
                                </span>
                                {isWinner ? (
                                  <span className="rounded-full border px-2.5 py-0.5 text-[12px] font-semibold mashwar-tradeoff-winner-pill">
                                    {t("winnerBadge")}
                                  </span>
                                ) : null}
                              </div>
                              <div className={`flex flex-wrap gap-1.5 ${isArabic ? "justify-end" : ""}`}>
                                <span
                                  className="rounded-full border px-2.5 py-0.5 text-[12px] font-medium"
                                  style={{
                                    color: riskVisual.text,
                                    backgroundColor: riskVisual.bg,
                                    borderColor: riskVisual.border,
                                  }}
                                >
                                  {riskLabel(route.riskLevel)}
                                </span>
                                <span
                                  className="rounded-full border px-2.5 py-0.5 text-[12px] font-medium"
                                  style={{
                                    color: statusStyle.text,
                                    backgroundColor: statusStyle.bg,
                                    borderColor: statusStyle.border,
                                  }}
                                >
                                  {bucketLabel(route.worstPredictedStatus)}
                                </span>
                              </div>
                            </div>

                            <h3
                              className={`mt-2 text-[18px] font-semibold leading-snug text-[#f4f6f8] ${
                                isArabic ? "mashwar-arabic" : "mashwar-display"
                              }`}
                            >
                              {routeTitle}
                            </h3>

                            <div
                              className={`mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] ${
                                isArabic ? "justify-end" : ""
                              }`}
                            >
                              <span className="text-[#8e97a3]">
                                <span className="text-[#5f6772]">{t("metric.smartEta")}</span>{" "}
                                <span className="font-medium text-[#dce2e8]">
                                  {formatMinutesI18n(route.smartEtaMinutes, na, locale, t)}
                                </span>
                              </span>
                              <span className="text-[#8e97a3]">
                                <span className="text-[#5f6772]">{t("metric.expectedDelay")}</span>{" "}
                                <span className="font-medium text-[#dce2e8]">
                                  {formatMinutesI18n(route.expectedDelayMinutes, na, locale, t)}
                                </span>
                              </span>
                              <span className="text-[#8e97a3]">
                                <span className="text-[#5f6772]">{t("metric.riskScore")}</span>{" "}
                                <span className="font-medium text-[#dce2e8]">
                                  {formatNumber(route.riskScore, 0, na)}
                                </span>
                              </span>
                              <span className="text-[#8e97a3]">
                                <span className="text-[#5f6772]">{t("metric.distance")}</span>{" "}
                                <span className="font-medium text-[#dce2e8]">
                                  {formatDistance(route.distanceM, locale, na)}
                                </span>
                              </span>
                            </div>
                          </button>

                          <details className="group border-t border-white/[0.06] bg-black/10">
                            <summary
                              className={`cursor-pointer list-none px-4 py-2.5 text-[12px] font-medium text-[#8fb0ac] marker:content-none [&::-webkit-details-marker]:hidden hover:bg-white/[0.03] hover:text-[#b8dad6] ${
                                isArabic ? "text-right mashwar-arabic" : "text-left"
                              }`}
                            >
                              {t("routeDeepDive")}
                            </summary>

                            <div className="space-y-4 px-4 pb-4 pt-1">
                              <div
                                className={`rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5 text-[12px] leading-relaxed text-[#c5cdd6] ${
                                  isArabic ? "mashwar-arabic text-right" : ""
                                }`}
                              >
                                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6d7682]">
                                  {t("whyMatters")}
                                </p>
                                <p className="mt-1.5">{whyLine}</p>
                                {facts.length > 1 ? (
                                  <ul className="mt-2 space-y-1.5">
                                    {facts.slice(1).map((fact) => (
                                      <li key={fact} className="border-t border-white/[0.05] pt-1.5 first:border-t-0 first:pt-0">
                                        {fact}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>

                              <div className="grid gap-2 sm:grid-cols-2">
                                <MetricChip
                                  label={t("metric.duration")}
                                  value={formatMinutesI18n(route.durationMinutes, na, locale, t)}
                                />
                                <MetricChip
                                  label={t("metric.smartEta")}
                                  value={formatMinutesI18n(route.smartEtaMinutes, na, locale, t)}
                                />
                                <MetricChip
                                  label={t("metric.expectedDelay")}
                                  value={formatMinutesI18n(route.expectedDelayMinutes, na, locale, t)}
                                />
                                <MetricChip
                                  label={t("metric.riskScore")}
                                  value={formatNumber(route.riskScore, 2, na)}
                                  tone={{
                                    text: riskVisual.text,
                                    bg: riskVisual.bg,
                                    border: riskVisual.border,
                                  }}
                                />
                              </div>

                              <div className="grid gap-3">
                                <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                                  <div
                                    className={`flex items-center justify-between gap-3 ${
                                      isArabic ? "flex-row-reverse" : ""
                                    }`}
                                  >
                                    <p className="mashwar-mono text-[9px] uppercase tracking-[0.2em] text-[#6b7280]">
                                      {t("timeVsRisk")}
                                    </p>
                                    <span className="text-[11px] text-[#94a3b8]">
                                      {t("vsRecommended", {
                                        signed: formatSignedNumber(
                                          route.durationDeltaVsRecommendedMinutes,
                                          0,
                                          na,
                                        ),
                                      })}
                                    </span>
                                  </div>
                                  <div className="mt-3 space-y-2">
                                    <div>
                                      <div
                                        className={`flex items-center justify-between text-[11px] text-[#94a3b8] ${
                                          isArabic ? "flex-row-reverse" : ""
                                        }`}
                                      >
                                        <span>{t("time")}</span>
                                        <span>
                                          {formatMinutesI18n(route.durationMinutes, na, locale, t)}
                                        </span>
                                      </div>
                                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/8">
                                        <div
                                          className="h-full rounded-full"
                                          style={{
                                            width: `${Math.min(100, durationPct * 100)}%`,
                                            background:
                                              "linear-gradient(90deg, rgba(72,130,138,0.95), rgba(45,90,95,0.55))",
                                          }}
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <div
                                        className={`flex items-center justify-between text-[11px] text-[#94a3b8] ${
                                          isArabic ? "flex-row-reverse" : ""
                                        }`}
                                      >
                                        <span>{t("risk")}</span>
                                        <span>{formatNumber(route.riskScore, 2, na)}</span>
                                      </div>
                                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/8">
                                        <div
                                          className="h-full rounded-full"
                                          style={{
                                            width: `${Math.min(100, riskPct * 100)}%`,
                                            background:
                                              "linear-gradient(90deg, rgba(196,92,72,0.9), rgba(196,154,60,0.75))",
                                          }}
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <div
                                        className={`flex items-center justify-between text-[11px] text-[#94a3b8] ${
                                          isArabic ? "flex-row-reverse" : ""
                                        }`}
                                      >
                                        <span>{t("delay")}</span>
                                        <span>
                                          {formatMinutesI18n(
                                            route.expectedDelayMinutes,
                                            na,
                                            locale,
                                            t,
                                          )}
                                        </span>
                                      </div>
                                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/8">
                                        <div
                                          className="h-full rounded-full"
                                          style={{
                                            width: `${Math.min(100, delayPct * 100)}%`,
                                            background:
                                              "linear-gradient(90deg, rgba(196,154,60,0.92), rgba(107,143,86,0.55))",
                                          }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2">
                                  <MetricChip
                                    label={t("metric.checkpointCount")}
                                    value={formatNumber(route.checkpointCount, 0, na)}
                                  />
                                  <MetricChip
                                    label={t("metric.routeViability")}
                                    value={viabilityLabel(route.routeViability)}
                                  />
                                  <MetricChip
                                    label={t("metric.riskLevel")}
                                    value={riskLabel(route.riskLevel)}
                                  />
                                  <MetricChip
                                    label={t("metric.riskConfidence")}
                                    value={formatPercent(route.riskConfidence, locale, na)}
                                  />
                                  <MetricChip
                                    label={t("metric.volatility")}
                                    value={formatNumber(route.historicalVolatility, 2, na)}
                                  />
                                  <MetricChip
                                    label={t("metric.distance")}
                                    value={formatDistance(route.distanceM, locale, na)}
                                  />
                                </div>
                              </div>

                              <div
                                className={`rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2.5 text-[12px] leading-relaxed text-[#b4bcc6] ${
                                  isArabic ? "mashwar-arabic text-right" : ""
                                }`}
                              >
                                <p>
                                  <span className="font-medium text-[#7d8692]">
                                    {t("statusCounts")}
                                  </span>{" "}
                                  {t("statusCountsLine", {
                                    green: route.statusCounts.green,
                                    yellow: route.statusCounts.yellow,
                                    red: route.statusCounts.red,
                                    unknown: route.statusCounts.unknown,
                                  })}
                                </p>
                                <p className="mt-1.5">
                                  <span className="font-medium text-[#7d8692]">
                                    {t("directionCounts")}
                                  </span>{" "}
                                  {t("directionCountsLine", {
                                    entering: route.routeDirectionCounts.entering,
                                    leaving: route.routeDirectionCounts.leaving,
                                    transit: route.routeDirectionCounts.transit,
                                    unknown: route.routeDirectionCounts.unknown,
                                  })}
                                </p>
                                <p className={`mt-1.5 ${isArabic ? "mashwar-arabic" : ""}`}>
                                  <span className="font-medium text-[#7d8692]">
                                    {t("corridorCities")}
                                  </span>{" "}
                                  {joinList(route.routeCorridorCities, na)}
                                </p>
                              </div>

                              <details className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                                <summary
                                  className={`cursor-pointer list-none text-[13px] font-semibold text-[#f4f6f8] marker:content-none [&::-webkit-details-marker]:hidden ${
                                    isArabic ? "mashwar-arabic" : ""
                                  }`}
                                >
                                  {t("riskyCheckpoints")}
                                  {route.riskyCheckpointCount > 0
                                    ? t("riskyCount", { count: route.riskyCheckpointCount })
                                    : t("riskyNone")}
                                </summary>

                                {route.riskyCheckpointCount > 0 ? (
                                  <div className="mt-3 grid gap-2">
                                    {route.riskyCheckpoints.map((checkpoint) => {
                                      const currentStyle = getStatusStyle(checkpoint.currentStatus);
                                      const etaStyle = getStatusStyle(checkpoint.predictedStatusAtEta);

                                      return (
                                        <div
                                          key={`${checkpoint.checkpointId ?? checkpoint.name}-${checkpoint.name}`}
                                          className="rounded-[14px] border border-white/8 bg-white/[0.03] p-3"
                                        >
                                          <div
                                            className={`flex flex-wrap items-start justify-between gap-3 ${
                                              isArabic ? "flex-row-reverse" : ""
                                            }`}
                                          >
                                            <div className={isArabic ? "text-right mashwar-arabic" : ""}>
                                              <p className="text-[13px] font-semibold text-[#f4f6f8]">
                                                {checkpoint.name}
                                              </p>
                                              <p className="mt-1 text-[12px] text-[#94a3b8]">
                                                {checkpoint.city ?? t("unknownCity")} ·{" "}
                                                {checkpoint.routeDirection === "entering" ||
                                                checkpoint.routeDirection === "leaving" ||
                                                checkpoint.routeDirection === "transit" ||
                                                checkpoint.routeDirection === "unknown"
                                                  ? directionLabel(checkpoint.routeDirection)
                                                  : (checkpoint.routeDirection ?? t("unknownDirection"))}
                                              </p>
                                            </div>
                                            <div
                                              className={`flex flex-wrap gap-2 ${
                                                isArabic ? "justify-start" : "justify-end"
                                              }`}
                                            >
                                              <span
                                                className="rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-tight"
                                                style={{
                                                  color: etaStyle.text,
                                                  backgroundColor: etaStyle.bg,
                                                  borderColor: etaStyle.border,
                                                }}
                                              >
                                                {t("etaBadge", {
                                                  status: bucketLabel(checkpoint.predictedStatusAtEta),
                                                })}
                                              </span>
                                              <span
                                                className="rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-tight"
                                                style={{
                                                  color: currentStyle.text,
                                                  backgroundColor: currentStyle.bg,
                                                  borderColor: currentStyle.border,
                                                }}
                                              >
                                                {t("currentBadge", {
                                                  status: bucketLabel(checkpoint.currentStatus),
                                                })}
                                              </span>
                                            </div>
                                          </div>

                                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                            <MetricChip
                                              label={t("metric.smartEta")}
                                              value={formatMinutesI18n(
                                                checkpoint.etaMinutes,
                                                na,
                                                locale,
                                                t,
                                              )}
                                            />
                                            <MetricChip
                                              label={t("forecastConfidence")}
                                              value={formatPercent(
                                                checkpoint.forecastConfidence,
                                                locale,
                                                na,
                                              )}
                                            />
                                            <MetricChip
                                              label={t("metric.expectedDelay")}
                                              value={formatMinutesI18n(
                                                checkpoint.expectedDelayMinutes,
                                                na,
                                                locale,
                                                t,
                                              )}
                                            />
                                            <MetricChip
                                              label={t("distanceFromRoute")}
                                              value={formatDistance(
                                                checkpoint.distanceFromRouteM,
                                                locale,
                                                na,
                                              )}
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </details>
                            </div>
                          </details>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-[20px] border border-dashed p-6 text-[13px] leading-7 text-[#94a3b8] mashwar-tradeoff-panel">
                    {t("emptyRoutes")}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div
              className={`flex items-center justify-between gap-3 px-4 py-3 text-[13px] text-[#cbd5e1] sm:px-5 ${
                isArabic ? "flex-row-reverse mashwar-rtl text-right" : ""
              }`}
            >
              <p>{t("collapsedHint", { name: winnerDisplay })}</p>
              {winnerRoute ? (
                <button
                  type="button"
                  onClick={scrollToWinner}
                  className="shrink-0 rounded-full border px-3 py-2 text-[11px] font-semibold text-[#f4f6f8] transition mashwar-tradeoff-chip hover:bg-white/[0.06]"
                >
                  {t("focusWinner")}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
