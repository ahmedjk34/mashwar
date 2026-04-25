"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MdUnfoldLess, MdUnfoldMore } from "react-icons/md";

import { RouteLoadingFlagStripe } from "@/components/map/RouteLoadingCard";
import type {
  NormalizedRoutes,
  RoutingRiskLevel,
  RoutingStatusBucket,
} from "@/lib/types/map";

type TradeoffExplainer = NonNullable<NormalizedRoutes["tradeoffExplainer"]>;
type TradeoffRoute = TradeoffExplainer["routes"][number];

/** Mirror `MashwarHome` top-right controls: `fixed right-4 top-5 sm:right-5 z-[1100]`. */
const MAP_CORNER_OVERLAY_CLASS = "fixed left-4 top-5 z-[1100] sm:left-5";

interface TradeoffExplainerModalProps {
  explainer: TradeoffExplainer | null;
  selectedRouteId: string | null;
  onRouteSelect: (routeId: string) => void;
  /** Fired when the full explainer panel is open (not minimized to the corner icon). */
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

function formatRiskScorePercent(value: number | null, locale: string, na: string): string {
  if (value === null || !Number.isFinite(value)) {
    return na;
  }

  const n = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
  return locale === "ar" ? `${n}٪` : `${n}%`;
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

type ParsedNarrativeSection = {
  title: string | null;
  items: string[];
};

type QuickFact = {
  label: string | null;
  value: string;
  hint: string | null;
};

function normalizeNarrativeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function containsArabicScript(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

function containsLatinScript(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function keepLineForLocale(value: string, isArabic: boolean): boolean {
  const hasArabic = containsArabicScript(value);
  const hasLatin = containsLatinScript(value);
  if (isArabic) {
    return hasArabic || !hasLatin;
  }

  return hasLatin || !hasArabic;
}

function tokenizeNarrativeLines(value: string, isArabic: boolean): string[] {
  const compact = value
    .replace(/\r/g, "")
    .replace(/\s+\|\s+/g, "\n")
    .replace(/\s+•\s+/g, "\n")
    .replace(/\s+-\s+(?=\(|\[|Route\s*\d+|المسار\s*\d+)/gi, "\n")
    .trim();
  if (!compact) {
    return [];
  }

  return compact
    .split(/\n+/g)
    .map((line) => normalizeNarrativeLine(line.replace(/^[-*•]\s*/, "")))
    .filter((line) => line.length > 0)
    .filter((line) => keepLineForLocale(line, isArabic));
}

function extractLocalizedStrings(value: unknown, isArabic: boolean): string[] {
  if (typeof value === "string") {
    const lines = tokenizeNarrativeLines(value, isArabic);
    return lines.length > 0 ? lines : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractLocalizedStrings(item, isArabic));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const localeKeys = isArabic
    ? ["arabic", "ar", "text_ar", "summary_ar", "decision_ar"]
    : ["english", "en", "text_en", "summary_en", "decision_en"];

  for (const key of localeKeys) {
    if (key in record) {
      const localized = extractLocalizedStrings(record[key], isArabic);
      if (localized.length > 0) {
        return localized;
      }
    }
  }

  return Object.values(record).flatMap((entry) =>
    extractLocalizedStrings(entry, isArabic),
  );
}

function parseQuickFacts(value: string): QuickFact[] {
  const lines = value
    .split("\n")
    .map((line) => normalizeNarrativeLine(line))
    .filter((line) => line.length > 0);

  const facts: QuickFact[] = [];
  for (const line of lines) {
    const match = line.match(/^([^:]{2,80})\s*:\s*(.+)$/);
    if (match) {
      facts.push({
        label: normalizeNarrativeLine(match[1]),
        value: normalizeNarrativeLine(match[2]),
        hint: null,
      });
      continue;
    }

    if (line.length > 24) {
      facts.push({
        label: null,
        value: line,
        hint: null,
      });
    }
  }

  return facts.slice(0, 6);
}

function parseNarrativeSections(value: string): ParsedNarrativeSection[] {
  const lines = value
    .split("\n")
    .map((line) => normalizeNarrativeLine(line))
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }

  const sections: ParsedNarrativeSection[] = [];
  let current: ParsedNarrativeSection = { title: null, items: [] };

  const pushCurrent = () => {
    if (current.title || current.items.length > 0) {
      sections.push(current);
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const numberedHeadingMatch = line.match(/^\((\d+)\)\s*([^:-]+?)\s*[:\-]\s*(.+)$/);
    if (numberedHeadingMatch) {
      pushCurrent();
      current = {
        title: normalizeNarrativeLine(numberedHeadingMatch[2]),
        items: [normalizeNarrativeLine(numberedHeadingMatch[3])],
      };
      continue;
    }

    const headingLineMatch = line.match(/^\((\d+)\)\s*([^:-]+)$/);
    if (headingLineMatch) {
      pushCurrent();
      current = {
        title: normalizeNarrativeLine(headingLineMatch[2]),
        items: [],
      };
      continue;
    }

    const bracketHeadingMatch = line.match(/^\[([^\]]+)\]\s*[:\-]\s*(.+)$/);
    if (bracketHeadingMatch) {
      pushCurrent();
      current = {
        title: normalizeNarrativeLine(bracketHeadingMatch[1]),
        items: [normalizeNarrativeLine(bracketHeadingMatch[2])],
      };
      continue;
    }

    if (line.includes(":")) {
      current.items.push(normalizeNarrativeLine(line));
      continue;
    }

    if (line.length > 0) {
      current.items.push(line);
    }
  }

  pushCurrent();
  return sections;
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

  const [isOpen, setIsOpen] = useState(true);
  /** True: only the top-left FAB is shown; full panel is hidden with transition. */
  const [isMinimized, setIsMinimized] = useState(false);
  /** Collapses the main body of the open explainer (expand / collapse control). */
  const [isCollapsed, setIsCollapsed] = useState(false);
  /** One-shot entrance animation when a new explainer payload arrives. */
  const [playEntrance, setPlayEntrance] = useState(false);
  const [isNarrativeExpanded, setIsNarrativeExpanded] = useState(false);
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
      setPlayEntrance(false);
      return;
    }

    setIsOpen(true);
    setIsMinimized(false);
    setIsCollapsed(false);
    setIsNarrativeExpanded(false);
    setPlayEntrance(true);
    const id = window.setTimeout(() => setPlayEntrance(false), 260);
    return () => window.clearTimeout(id);
  }, [explainerKey, explainer]);

  useEffect(() => {
    if (!explainer) {
      onExplainerOpenChange?.(false);
      return;
    }
    onExplainerOpenChange?.(isOpen && !isMinimized);
  }, [explainer, isOpen, isMinimized, onExplainerOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (!isMinimized) {
        setIsMinimized(true);
      } else {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, isMinimized]);

  const routes = explainer
    ? [...explainer.routes].sort((left, right) => left.rank - right.rank)
    : [];
  const winnerRoute = explainer
    ? routes.find((route) => route.routeId === explainer.winnerRouteId) ?? routes[0] ?? null
    : null;
  const selectedOrWinnerRouteId = selectedRouteId ?? winnerRoute?.routeId ?? null;

  useEffect(() => {
    if (!isOpen || isMinimized || !winnerRoute?.uiKey) {
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
  }, [isOpen, isMinimized, winnerRoute?.uiKey]);

  const narrativeBody = explainer
    ? (() => {
        const structuredLines = explainer.structuredExplanation
          ? extractLocalizedStrings(explainer.structuredExplanation, isArabic)
          : [];
        const preferredText = isArabic ? explainer.arabicText : explainer.englishText;
        const preferredLines = preferredText
          ? tokenizeNarrativeLines(preferredText, isArabic)
          : [];
        const fullLines = explainer.fullText
          ? tokenizeNarrativeLines(explainer.fullText, isArabic)
          : [];

        const merged = [
          ...structuredLines,
          ...preferredLines,
          ...fullLines,
        ];
        const deduped = Array.from(new Set(merged));
        if (deduped.length > 0) {
          return deduped.join("\n");
        }

        return isArabic ? t("noArabicExplanation") : t("noEnglishExplanation");
      })()
    : "";
  const parsedNarrativeSections = useMemo(
    () => parseNarrativeSections(narrativeBody),
    [narrativeBody],
  );
  const quickFacts = useMemo(() => parseQuickFacts(narrativeBody), [narrativeBody]);
  const narrativeItemCount = useMemo(
    () =>
      parsedNarrativeSections.reduce(
        (count, section) => count + section.items.length,
        0,
      ),
    [parsedNarrativeSections],
  );
  if (!explainer) {
    return null;
  }

  const focusRoute = (route: TradeoffRoute) => {
    onRouteSelect(route.routeId);
    setIsOpen(true);
    setIsMinimized(false);

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
      ? (explainer.setSummary.decisionDriverAr ?? t("noDriverAr"))
      : (explainer.setSummary.decisionDriverEn ?? t("noDriverEn"));

  const comparedCount =
    explainer.comparedRouteCount !== null && explainer.comparedRouteCount !== undefined
      ? Math.round(explainer.comparedRouteCount)
      : routes.length;

  const riskLabel = (level: TradeoffRoute["riskLevel"]) =>
    tRisk(normalizeRiskLevel(level));

  const bucketLabel = (status: RoutingStatusBucket | string | null | undefined) =>
    tBucket(normalizeStatus(status));

  if (!isOpen) {
    return (
      <div className={`${MAP_CORNER_OVERLAY_CLASS} flex justify-start`}>
        <div className="mashwar-tradeoff-collapsed-enter mashwar-tradeoff-collapsed-wrap w-full max-w-[min(calc(100vw-1.5rem),22rem)] overflow-hidden rounded-full border-2 border-[rgba(107,143,86,0.65)] backdrop-blur-xl">
          <RouteLoadingFlagStripe dense className="opacity-100" />
          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              setIsMinimized(false);
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

  const shellMotionClass =
    playEntrance && !isMinimized
      ? "mashwar-tradeoff-shell-enter"
      : [
          "mashwar-tradeoff-shell-dock",
          isMinimized
            ? "mashwar-tradeoff-shell-dock--minimized"
            : "mashwar-tradeoff-shell-dock--expanded",
        ].join(" ");

  const shellClass = [
    "mashwar-tradeoff-shell w-[min(100vw-1.5rem,460px)] h-full flex flex-col overflow-hidden rounded-[26px] border shadow-[0_30px_100px_rgba(0,0,0,0.72)] backdrop-blur-2xl",
    isMinimized ? "pointer-events-none" : "pointer-events-auto",
    shellMotionClass,
  ].join(" ");

  return (
    <>
      <div
        className={`mashwar-tradeoff-dock-host pointer-events-none ${MAP_CORNER_OVERLAY_CLASS} flex max-w-[min(calc(100vw-1.5rem),17.5rem)] flex-col items-stretch gap-1 ${
          isMinimized ? "mashwar-tradeoff-dock-host--visible" : "mashwar-tradeoff-dock-host--hidden"
        }`}
        aria-hidden={!isMinimized}
      >
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          aria-label={`${t("dockTitle")}. ${t("dockHint")}`}
          title={t("dockHint")}
          dir={isArabic ? "rtl" : "ltr"}
          className={`mashwar-tradeoff-dock-card mashwar-arabic group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(228,49,43,0.45)] active:scale-[0.98] sm:gap-3.5 sm:px-3.5 sm:py-3 ${
            isMinimized ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <span className="mashwar-tradeoff-watermelon" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold leading-snug text-[#f8fafc] sm:text-[14px]">
              {t("dockTitle")}
            </span>
            <span className="mt-0.5 block text-[11px] font-medium leading-snug text-[#a8b5c4] sm:text-[12px]">
              {t("dockHint")}
            </span>
          </span>
          <MdUnfoldMore
            className={`h-6 w-6 shrink-0 text-[#c8e8d4] opacity-75 transition duration-200 group-hover:scale-105 group-hover:opacity-100 sm:h-7 sm:w-7 ${
              isArabic ? "scale-x-[-1]" : ""
            }`}
            aria-hidden
          />
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className={`mashwar-tradeoff-dock-dismiss mashwar-arabic self-center rounded-lg px-2 py-1 text-[11px] font-medium text-[#7d8694] transition hover:text-[#cbd5e1] ${
            isMinimized ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          {t("dockHide")}
        </button>
      </div>

      <div
        className={`mashwar-tradeoff-anchor fixed z-[1150] flex ${
          isArabic ? "left-3 sm:left-4" : "right-3 sm:right-4"
        } ${isMinimized ? "pointer-events-none" : ""}`}
        style={{ top: "1rem", bottom: "1rem" }}
        aria-live="polite"
        aria-hidden={isMinimized}
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

            <div className={`flex shrink-0 ${isArabic ? "items-start" : "items-end"}`}>
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                aria-label={t("collapseDockAria")}
                title={t("collapseDockTitle")}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.05] text-[#e8edf2] shadow-[0_4px_20px_rgba(0,0,0,0.35)] transition duration-200 ease-out hover:border-white/[0.22] hover:bg-white/[0.09] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(0,122,61,0.65)] active:scale-[0.94] sm:h-12 sm:w-12"
              >
                <MdUnfoldLess
                  className={`h-6 w-6 sm:h-7 sm:w-7 ${isArabic ? "scale-x-[-1]" : ""}`}
                  aria-hidden
                />
              </button>
            </div>
          </header>

          <div className="mashwar-tradeoff-body-stagger mashwar-tradeoff-scroll-region flex-1 overflow-y-auto mashwar-scroll px-4 py-4 sm:px-5">
              {narrativeBody ? (
                <div
                  className={`mb-5 rounded-2xl border border-white/[0.07] bg-black/15 px-4 py-3 mashwar-tradeoff-panel ${
                    isArabic ? "mashwar-arabic text-right" : ""
                  }`}
                  dir={isArabic ? "rtl" : "ltr"}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8ea2b5]">
                    {t("narrativeToggleShow")}
                  </p>

                  {quickFacts.length > 0 ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {quickFacts.map((fact, index) => (
                        <div
                          key={`${fact.value}-${index}`}
                          className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5"
                        >
                          {fact.label ? (
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8ea2b5]">
                              {fact.label}
                            </p>
                          ) : null}
                          <p
                            className={`mt-1 text-[15px] font-semibold leading-snug text-[#eef2f6] ${
                              isArabic ? "mashwar-arabic" : ""
                            }`}
                          >
                            {fact.value}
                          </p>
                          {fact.hint ? (
                            <p className="mt-1 text-[11px] leading-relaxed text-[#9eabb9]">{fact.hint}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-2 space-y-3 text-[12px] leading-relaxed text-[#c5cdd6]">
                    {parsedNarrativeSections.length > 0 ? (
                      parsedNarrativeSections.map((section, sectionIndex) => (
                        <div key={`${section.title ?? "section"}-${sectionIndex}`}>
                          {section.title ? (
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9eb3c6]">
                              {section.title}
                            </p>
                          ) : null}
                          <ul className={`mt-1 space-y-1 ${isArabic ? "text-right" : "text-left"}`}>
                            {(isNarrativeExpanded
                              ? section.items
                              : section.items.slice(0, sectionIndex === 0 ? 2 : 1)
                            ).map((item, itemIndex) => (
                              <li key={`${item}-${itemIndex}`} className="text-[12px] leading-relaxed">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    ) : (
                      <p className="text-[12px] leading-relaxed text-[#c5cdd6]">{narrativeBody}</p>
                    )}
                  </div>

                  {narrativeItemCount > 3 ? (
                    <div className={`mt-3 flex ${isArabic ? "justify-end" : "justify-start"}`}>
                      <button
                        type="button"
                        onClick={() => setIsNarrativeExpanded((value) => !value)}
                        className="rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-[#d8e4f1] transition hover:bg-white/[0.08]"
                      >
                        {isNarrativeExpanded ? t("narrativeToggleHide") : t("narrativeToggleShow")}
                      </button>
                    </div>
                  ) : null}
                </div>
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
                                  {formatRiskScorePercent(route.riskScore, locale, na)}
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

                          <div className="border-t border-white/[0.06] bg-black/10 px-4 py-3">
                            <div
                              className={`rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5 text-[12px] leading-relaxed text-[#c5cdd6] ${
                                isArabic ? "mashwar-arabic text-right" : ""
                              }`}
                            >
                              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6d7682]">
                                {t("whyMatters")}
                              </p>
                              <p className="mt-1.5 line-clamp-2">{whyLine}</p>
                            </div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <MetricChip
                                label={t("metric.duration")}
                                value={formatMinutesI18n(route.durationMinutes, na, locale, t)}
                              />
                              <MetricChip
                                label={t("metric.expectedDelay")}
                                value={formatMinutesI18n(route.expectedDelayMinutes, na, locale, t)}
                              />
                              <MetricChip
                                label={t("metric.riskScore")}
                                value={formatRiskScorePercent(route.riskScore, locale, na)}
                                tone={{
                                  text: riskVisual.text,
                                  bg: riskVisual.bg,
                                  border: riskVisual.border,
                                }}
                              />
                              <MetricChip
                                label={t("metric.checkpointCount")}
                                value={formatNumber(route.checkpointCount, 0, na)}
                              />
                            </div>
                          </div>
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
        </div>
      </section>
      </div>
    </>
  );
}
