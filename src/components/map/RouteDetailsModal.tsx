"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import type {
  NormalizedRoutes,
  RoutePath,
  RoutingRiskLevel,
  RoutingStatusBucket,
} from "@/lib/types/map";
import { formatDateTimeInPalestine } from "@/lib/utils/palestine-time";

interface RouteDetailsModalProps {
  open: boolean;
  route: RoutePath | null;
  departAt: string | null;
  routeVersion?: string | null;
  checkpointMatching?: NormalizedRoutes["checkpointMatching"];
  onClose: () => void;
}

const RISK_STYLES: Record<
  RoutingRiskLevel,
  {
    text: string;
    bg: string;
    border: string;
    meter: string;
  }
> = {
  low: {
    text: "#86efac",
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.35)",
    meter: "#22c55e",
  },
  medium: {
    text: "#fbbf24",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.35)",
    meter: "#f59e0b",
  },
  high: {
    text: "#fca5a5",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.35)",
    meter: "#ef4444",
  },
  unknown: {
    text: "#cbd5e1",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.35)",
    meter: "#94a3b8",
  },
};

const BUCKET_STYLES: Record<
  RoutingStatusBucket,
  {
    text: string;
    bg: string;
    border: string;
  }
> = {
  green: {
    text: "#86efac",
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.35)",
  },
  yellow: {
    text: "#fbbf24",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.35)",
  },
  red: {
    text: "#fca5a5",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.35)",
  },
  unknown: {
    text: "#cbd5e1",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.35)",
  },
};

function normalizeRiskLevel(route: RoutePath): RoutingRiskLevel {
  if (route.riskLevel !== "unknown") {
    return route.riskLevel;
  }

  switch (route.routeViability) {
    case "good":
      return "low";
    case "avoid":
      return "high";
    default:
      return "medium";
  }
}

function getRiskSummary(route: RoutePath): string | null {
  if (route.riskComponents.length > 0) {
    return route.riskComponents.slice(0, 2).join(" · ");
  }

  return route.reasonSummary || null;
}

function resolveRouteArrivalDateTime(
  route: RoutePath,
  departAt: string | null,
): string | null {
  if (route.smartEtaDateTime) {
    return route.smartEtaDateTime;
  }

  if (!departAt) {
    return null;
  }

  const departDate = new Date(departAt);
  if (Number.isNaN(departDate.getTime())) {
    return null;
  }

  const smartEtaMs = route.smartEtaMs ?? route.durationMs;
  if (!Number.isFinite(smartEtaMs) || smartEtaMs <= 0) {
    return null;
  }

  return new Date(departDate.getTime() + smartEtaMs).toISOString();
}

function formatArrivalShortLabel(value: string | null): string {
  return formatDateTimeInPalestine(value);
}

function getRouteSmartEta(route: RoutePath, departAt: string | null): string {
  return formatArrivalShortLabel(resolveRouteArrivalDateTime(route, departAt));
}

function formatDateTimeLabel(value: string | null): string {
  return formatDateTimeInPalestine(value);
}

function getProbabilityEntries(probabilities: Record<string, number>) {
  return Object.entries(probabilities)
    .map(([label, value]) => ({
      label,
      value,
    }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0)
    .sort((left, right) => right.value - left.value);
}

function getProbabilityColor(label: string): string {
  const normalized = label.trim().toLowerCase();

  if (normalized.includes("green") || normalized.includes("low")) {
    return "#22c55e";
  }

  if (normalized.includes("yellow") || normalized.includes("medium")) {
    return "#f59e0b";
  }

  if (normalized.includes("red") || normalized.includes("high")) {
    return "#ef4444";
  }

  return "#94a3b8";
}

function Pill({
  children,
  color,
  backgroundColor,
  borderColor,
}: {
  children: ReactNode;
  color: string;
  backgroundColor: string;
  borderColor: string;
}) {
  return (
    <span
      className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold"
      style={{ color, backgroundColor, borderColor }}
    >
      {children}
    </span>
  );
}

export default function RouteDetailsModal({
  open,
  route,
  departAt,
  routeVersion,
  checkpointMatching,
  onClose,
}: RouteDetailsModalProps) {
  const t = useTranslations("routeDetails");
  const tCommon = useTranslations("common");
  const tMap = useTranslations("map");
  const tRisk = useTranslations("routing.risk");
  const tBucket = useTranslations("routing.bucket");
  const tDirection = useTranslations("routing.direction");
  const tSelectedStatus = useTranslations("routing.selectedStatus");
  const tMatchConfidence = useTranslations("routing.matchConfidence");

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, open]);

  const isVisible = open && route;

  if (!route) {
    return null;
  }

  function formatRouteDistance(distanceM: number): string {
    if (!Number.isFinite(distanceM) || distanceM <= 0) {
      return tMap("distanceZero");
    }

    if (distanceM >= 1000) {
      return `${(distanceM / 1000).toFixed(distanceM >= 10000 ? 0 : 1)} km`;
    }

    return `${Math.round(distanceM)} m`;
  }

  function formatDurationLabel(durationMs: number | null): string {
    if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) {
      return tCommon("notAvailable");
    }

    const totalMinutes = Math.round(durationMs / 60000);
    if (totalMinutes >= 60) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }

    return `${totalMinutes}m`;
  }

  function formatCoordinatePair(lat: number, lng: number): string {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return tCommon("notAvailable");
    }

    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  function formatConfidence(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return tCommon("notAvailable");
    }

    return tCommon("percent", { value: Math.round(value * 100) });
  }

  function formatPercent(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return tCommon("notAvailable");
    }

    return tCommon("percent", { value: Math.round(value * 100) });
  }

  function formatRouteDirection(value: string | null): string {
    if (!value) {
      return tDirection("unknown");
    }

    switch (value) {
      case "entering":
      case "leaving":
      case "transit":
        return tDirection(value);
      default:
        return value;
    }
  }

  function formatSelectedStatusType(value: string | null): string {
    if (!value) {
      return tCommon("notAvailable");
    }

    switch (value) {
      case "entering":
      case "leaving":
      case "worst":
        return tSelectedStatus(value);
      default:
        return value;
    }
  }

  function formatMatchConfidence(value: string | null): string {
    if (!value) {
      return tCommon("notAvailable");
    }

    switch (value) {
      case "strong":
      case "medium":
      case "weak":
        return tMatchConfidence(value);
      default:
        return value;
    }
  }

  function formatNumberLabel(value: number | null, fractionDigits = 0): string {
    if (value === null || !Number.isFinite(value)) {
      return tCommon("notAvailable");
    }

    return value.toFixed(fractionDigits);
  }

  function formatDistanceLabel(value: number | null): string {
    if (value === null || !Number.isFinite(value) || value < 0) {
      return tCommon("notAvailable");
    }

    if (value >= 1000) {
      return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} km`;
    }

    return `${Math.round(value)} m`;
  }

  function getRouteEtaBreakdownLabel(r: RoutePath): string {
    const delayMinutes = r.expectedDelayMinutes ?? r.estimatedDelayMinutes;

    if (delayMinutes !== null && Number.isFinite(delayMinutes) && delayMinutes > 0) {
      return t("etaBreakdownBaseDelay");
    }

    return r.smartEtaDateTime ? t("etaBreakdownSmart") : t("etaBreakdownLegacy");
  }

  function getRouteDelayLabel(r: RoutePath): string {
    const delayMinutes = r.expectedDelayMinutes ?? r.estimatedDelayMinutes;
    if (delayMinutes === null || !Number.isFinite(delayMinutes) || delayMinutes <= 0) {
      return t("delayNoPrediction");
    }

    return t("delayExpected", { minutes: Math.max(1, Math.round(delayMinutes)) });
  }

  function getRouteScoreLabel(r: RoutePath): string {
    if (r.riskScore !== null && Number.isFinite(r.riskScore)) {
      return t("riskScoreLabel", { score: r.riskScore.toFixed(1) });
    }

    if (Number.isFinite(r.routeScore)) {
      return t("routingScoreLabel", { score: r.routeScore.toFixed(1) });
    }

    return t("riskScoreNa");
  }

  function getProbabilitySummary(probabilities: Record<string, number>): string {
    const entries = getProbabilityEntries(probabilities);
    if (entries.length === 0) {
      return t("noProbability");
    }

    return entries
      .slice(0, 3)
      .map((entry) => `${entry.label} ${formatPercent(entry.value)}`)
      .join(" · ");
  }

  const riskLevel = normalizeRiskLevel(route);
  const riskStyles = RISK_STYLES[riskLevel];
  const worstBucket = route.worstPredictedStatus;
  const worstStyles = BUCKET_STYLES[worstBucket];
  const routeSummary = getRiskSummary(route);
  const routeDelayLabel = getRouteDelayLabel(route);
  const routeScoreLabel = getRouteScoreLabel(route);
  const routeSmartEta = getRouteSmartEta(route, departAt);
  const isV5Route = routeVersion === "v5";
  const orderedCheckpoints = [...route.checkpoints].sort((left, right) => {
    const leftEta = left.effectiveEtaMs ?? left.etaMs;
    const rightEta = right.effectiveEtaMs ?? right.etaMs;
    return leftEta - rightEta;
  });
  const routeConfidence =
    route.riskConfidence !== null && Number.isFinite(route.riskConfidence)
      ? route.riskConfidence
      : null;
  const routeConfidencePct = routeConfidence !== null ? routeConfidence * 100 : null;
  const na = tCommon("notAvailable");

  return (
    <div className="fixed inset-0 z-50" aria-hidden={!isVisible}>
      <button
        type="button"
        aria-label={t("closeBackdropAria")}
        className={`absolute inset-0 bg-black/65 backdrop-blur-[20px] transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-details-title"
        className={`relative z-10 mx-auto mt-3 flex h-[min(92vh,56rem)] w-[min(100vw-1.5rem,980px)] flex-col overflow-hidden rounded-[16px] border border-white/8 bg-[#0b0f14] shadow-[0_30px_100px_rgba(0,0,0,0.7)] transition-all duration-300 ease-out sm:mt-6 ${
          isVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.985] opacity-0"
        }`}
        style={{ animation: "mashwar-modal-in 220ms ease-out" }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(239,68,68,0.08),transparent_24%)]" />

        <header className="relative border-b border-white/8 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="mashwar-mono text-[10px] uppercase tracking-[0.34em] text-[#6b7280]">
                {t("title")}
              </p>
              <h2 id="route-details-title" className="mt-1 text-[24px] font-bold text-[#f9fafb]">
                {t("heading", { rank: route.rank })}
              </h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#94a3b8]">{t("intro")}</p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-transparent text-[#cbd5e1] transition hover:bg-white/5 hover:text-[#f9fafb]"
              aria-label={t("closeAria")}
            >
              <span className="text-xl leading-none">×</span>
            </button>
          </div>
        </header>

        <div className="relative flex-1 overflow-y-auto p-4">
          <section className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mashwar-mono text-[10px] uppercase tracking-[0.24em] text-[#6b7280]">
                {t("legend")}
              </span>
              <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[11px] text-sky-100">
                {t("legendSmartEta")}
              </span>
              {isV5Route ? (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-100">
                  {t("badgeV5")}
                </span>
              ) : null}
              <Pill
                color={RISK_STYLES.low.text}
                backgroundColor={RISK_STYLES.low.bg}
                borderColor={RISK_STYLES.low.border}
              >
                {t("pillLowRisk")}
              </Pill>
              <Pill
                color={RISK_STYLES.medium.text}
                backgroundColor={RISK_STYLES.medium.bg}
                borderColor={RISK_STYLES.medium.border}
              >
                {t("pillMediumRisk")}
              </Pill>
              <Pill
                color={RISK_STYLES.high.text}
                backgroundColor={RISK_STYLES.high.bg}
                borderColor={RISK_STYLES.high.border}
              >
                {t("pillHighRisk")}
              </Pill>
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-4">
            <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-4">
              <p className="mashwar-mono text-[10px] uppercase tracking-[0.24em] text-[#6b7280]">
                {t("smartEta")}
              </p>
              <p className="mt-2 text-[24px] font-semibold text-[#f9fafb]">
                {routeSmartEta}
              </p>
              <p className="mt-2 text-[12px] text-[#94a3b8]">{routeDelayLabel}</p>
              <p className="mt-1 text-[12px] text-[#94a3b8]">{getRouteEtaBreakdownLabel(route)}</p>
            </div>

            <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-4">
              <p className="mashwar-mono text-[10px] uppercase tracking-[0.24em] text-[#6b7280]">
                {t("journeyRisk")}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Pill
                  color={riskStyles.text}
                  backgroundColor={riskStyles.bg}
                  borderColor={riskStyles.border}
                >
                  {tRisk(riskLevel)}
                </Pill>
                <span className="text-[12px] text-[#cbd5e1]">{routeScoreLabel}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#1f2937]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width:
                      routeConfidencePct !== null
                        ? `${Math.min(100, Math.max(8, routeConfidencePct))}%`
                        : "18%",
                    backgroundColor: riskStyles.meter,
                  }}
                />
              </div>
              <p className="mt-2 text-[12px] text-[#94a3b8]">
                {t("confidence", { value: formatConfidence(route.riskConfidence) })}
              </p>
              {routeSummary ? (
                <p className="mt-1 text-[12px] leading-5 text-[#dbe4f0]">{routeSummary}</p>
              ) : null}
            </div>

            <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-4">
              <p className="mashwar-mono text-[10px] uppercase tracking-[0.24em] text-[#6b7280]">
                {t("distance")}
              </p>
              <p className="mt-2 text-[24px] font-semibold text-[#f9fafb]">
                {formatRouteDistance(route.distanceM)}
              </p>
              <p className="mt-2 text-[12px] text-[#94a3b8]">
                {Number.isFinite(route.routeScore)
                  ? t("routeScore", { score: route.routeScore.toFixed(1) })
                  : t("routeScoreNa")}
              </p>
              {route.historicalVolatility !== null ? (
                <p className="mt-1 text-[12px] text-[#94a3b8]">
                  {t("volatility", { value: route.historicalVolatility.toFixed(1) })}
                </p>
              ) : null}
            </div>

            <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-4">
              <p className="mashwar-mono text-[10px] uppercase tracking-[0.24em] text-[#6b7280]">
                {t("checkpoints")}
              </p>
              <p className="mt-2 text-[24px] font-semibold text-[#f9fafb]">
                {route.checkpointCount}
              </p>
              <p className="mt-2 text-[12px] text-[#94a3b8]">
                {t("checkpointsSub", { count: route.checkpoints.length })}
              </p>
            </div>
          </div>

          {checkpointMatching ? (
            <details className="mt-4 rounded-[12px] border border-[#2d3139] bg-white/[0.03] px-4 py-3">
              <summary className="cursor-pointer list-none text-[12px] font-medium text-[#dbe4f0]">
                {t("matchingMeta")}
              </summary>
              <div className="mt-3 grid gap-2 text-[12px] text-[#94a3b8] sm:grid-cols-2 lg:grid-cols-4">
                <p>{t("matchingField.mode", { value: checkpointMatching.mode ?? na })}</p>
                <p>
                  {t("matchingField.directionMode", {
                    value: checkpointMatching.directionMode ?? na,
                  })}
                </p>
                <p>{t("matchingField.citySource", { value: checkpointMatching.citySource ?? na })}</p>
                <p>
                  {t("matchingField.cityInference", {
                    value: checkpointMatching.cityInference ?? na,
                  })}
                </p>
                <p>
                  {t("matchingField.outerThreshold", {
                    value: formatNumberLabel(checkpointMatching.outerThresholdM),
                  })}
                </p>
                <p>
                  {t("matchingField.strongMatch", {
                    value: formatNumberLabel(checkpointMatching.strongMatchDistanceM),
                  })}
                </p>
                <p>
                  {t("matchingField.mediumMatch", {
                    value: formatNumberLabel(checkpointMatching.mediumMatchDistanceM),
                  })}
                </p>
                <p>
                  {t("matchingField.weakMatch", {
                    value: formatNumberLabel(checkpointMatching.weakMatchDistanceM),
                  })}
                </p>
              </div>
            </details>
          ) : null}

          <section className="mt-4 rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill color={riskStyles.text} backgroundColor={riskStyles.bg} borderColor={riskStyles.border}>
                {t("riskWithLevel", { label: tRisk(riskLevel) })}
              </Pill>
              <Pill
                color={worstStyles.text}
                backgroundColor={worstStyles.bg}
                borderColor={worstStyles.border}
              >
                {t("worstPill", { label: tBucket(worstBucket) })}
              </Pill>
              <Pill color="#cbd5e1" backgroundColor="rgba(148, 163, 184, 0.12)" borderColor="rgba(148, 163, 184, 0.24)">
                {t("rankPill", { rank: route.rank })}
              </Pill>
            </div>

            <p className="mt-3 text-[13px] leading-6 text-[#dbe4f0]">
              {route.reasonSummary || t("noSummary")}
            </p>

            {route.riskComponents.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {route.riskComponents.slice(0, 3).map((component) => (
                  <span
                    key={component}
                    className="rounded-full border border-white/8 bg-white/[0.05] px-2.5 py-1 text-[11px] text-[#cbd5e1]"
                  >
                    {component}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="mt-4 rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="mashwar-mono text-[10px] uppercase tracking-[0.24em] text-[#6b7280]">
                  {t("timelineTitle")}
                </p>
                <p className="mt-1 text-[13px] text-[#94a3b8]">{t("timelineSub")}</p>
              </div>
            </div>

            {orderedCheckpoints.length > 0 ? (
              <div className="mt-4 space-y-3">
                {(() => {
                  let carriedDelayMs = 0;

                  return orderedCheckpoints.map((checkpoint, index) => {
                    const currentStyles = BUCKET_STYLES[checkpoint.currentStatus];
                    const etaStyles = BUCKET_STYLES[checkpoint.predictedStatusAtEta];
                    const baseEtaMs = checkpoint.baseEtaMs ?? checkpoint.etaMs;
                    const effectiveEtaMs = checkpoint.effectiveEtaMs ?? checkpoint.etaMs;
                    const checkpointDelayMs =
                      checkpoint.expectedDelayMs ??
                      Math.max(0, effectiveEtaMs - baseEtaMs);
                    const carriedForwardMs =
                      checkpoint.cumulativeDelayMsBeforeCheckpoint ?? carriedDelayMs;
                    const hasDelay = checkpointDelayMs > 0 || carriedForwardMs > 0;

                    carriedDelayMs = Math.max(
                      carriedForwardMs,
                      carriedForwardMs + Math.max(0, checkpointDelayMs),
                    );

                    return (
                      <article
                        key={checkpoint.checkpointId}
                        className={`rounded-[12px] border p-4 ${
                          hasDelay
                            ? "border-amber-500/30 bg-amber-500/5"
                            : "border-[#2d3139] bg-black/20"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[15px] font-semibold text-[#f9fafb]">
                              {index + 1}. {checkpoint.name}
                            </p>
                            <p className="mt-1 text-[12px] text-[#94a3b8]">
                              {checkpoint.city ?? na}
                              {checkpoint.checkpointCityGroup
                                ? t("rawGroup", { group: checkpoint.checkpointCityGroup })
                                : ""}
                            </p>
                            <p className="mt-1 text-[12px] text-[#94a3b8]">
                              {formatCoordinatePair(checkpoint.lat, checkpoint.lng)}
                            </p>
                          </div>

                          <div className="flex flex-wrap justify-end gap-2">
                            <Pill
                              color="#cbd5e1"
                              backgroundColor="rgba(148, 163, 184, 0.12)"
                              borderColor="rgba(148, 163, 184, 0.24)"
                            >
                              {formatRouteDirection(checkpoint.routeDirection)}
                            </Pill>
                            <Pill
                              color="#cbd5e1"
                              backgroundColor="rgba(148, 163, 184, 0.12)"
                              borderColor="rgba(148, 163, 184, 0.24)"
                            >
                              {formatSelectedStatusType(checkpoint.selectedStatusType)}
                            </Pill>
                            <Pill
                              color="#cbd5e1"
                              backgroundColor="rgba(148, 163, 184, 0.12)"
                              borderColor="rgba(148, 163, 184, 0.24)"
                            >
                              {t("matchChip", { value: formatMatchConfidence(checkpoint.matchConfidence) })}
                            </Pill>
                            <span className="rounded-full border border-[#2d3139] px-2.5 py-1 text-[11px] text-[#cbd5e1]">
                              {t("reach", { time: formatDateTimeLabel(checkpoint.crossingDateTime) })}
                            </span>
                            <span className="rounded-full border border-[#2d3139] px-2.5 py-1 text-[11px] text-[#cbd5e1]">
                              {t("fromDeparture", { duration: formatDurationLabel(checkpoint.etaMs) })}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-[10px] border border-[#2d3139] bg-white/[0.03] p-3">
                            <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                              {t("baseEta")}
                            </p>
                            <p className="mt-2 text-[18px] font-semibold text-[#f9fafb]">
                              {formatDurationLabel(baseEtaMs)}
                            </p>
                            <p className="mt-2 text-[12px] text-[#94a3b8]">{t("baseEtaHelp")}</p>
                          </div>

                          <div className="rounded-[10px] border border-[#2d3139] bg-white/[0.03] p-3">
                            <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                              {t("effectiveEta")}
                            </p>
                            <p className="mt-2 text-[18px] font-semibold text-[#f9fafb]">
                              {formatDurationLabel(effectiveEtaMs)}
                            </p>
                            <p className="mt-2 text-[12px] text-[#94a3b8]">{t("effectiveEtaHelp")}</p>
                          </div>

                          <div className="rounded-[10px] border border-[#2d3139] bg-white/[0.03] p-3">
                            <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                              {t("expectedDelay")}
                            </p>
                            <p className="mt-2 text-[18px] font-semibold text-[#f9fafb]">
                              {formatDurationLabel(checkpointDelayMs)}
                            </p>
                            <p className="mt-2 text-[12px] text-[#94a3b8]">
                              {hasDelay
                                ? t("carriedForward", { value: formatDurationLabel(carriedForwardMs) })
                                : t("noPropagatedDelay")}
                            </p>
                          </div>

                          <div className="rounded-[10px] border border-[#2d3139] bg-white/[0.03] p-3">
                            <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                              {t("prediction")}
                            </p>
                            <div className="mt-2">
                              <Pill
                                color={etaStyles.text}
                                backgroundColor={etaStyles.bg}
                                borderColor={etaStyles.border}
                              >
                                {tBucket(checkpoint.predictedStatusAtEta)}
                              </Pill>
                            </div>
                            <p className="mt-2 text-[12px] text-[#94a3b8]">
                              {t("directionAware", {
                                value: formatRouteDirection(checkpoint.routeDirection),
                              })}
                            </p>
                            <p className="mt-1 text-[12px] text-[#94a3b8]">
                              {t("selectedStatusLine", {
                                value: formatSelectedStatusType(checkpoint.selectedStatusType),
                              })}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-[10px] border border-[#2d3139] bg-white/[0.03] p-3">
                            <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                              {t("statusNow")}
                            </p>
                            <div className="mt-2">
                              <Pill
                                color={currentStyles.text}
                                backgroundColor={currentStyles.bg}
                                borderColor={currentStyles.border}
                              >
                                {tBucket(checkpoint.currentStatus)}
                              </Pill>
                            </div>
                            <p className="mt-3 text-[12px] text-[#94a3b8]">
                              {t("directionLine", {
                                value: formatRouteDirection(checkpoint.routeDirection),
                              })}
                            </p>
                            <p className="mt-1 text-[12px] text-[#94a3b8]">
                              {t("selectedSideLine", {
                                value: formatSelectedStatusType(checkpoint.selectedStatusType),
                              })}
                            </p>
                            <p className="mt-1 text-[12px] text-[#94a3b8]">
                              {t("enteringRaw", {
                                value: checkpoint.currentStatusRaw?.entering_status ?? na,
                              })}
                            </p>
                            <p className="mt-1 text-[12px] text-[#94a3b8]">
                              {t("leavingRaw", {
                                value: checkpoint.currentStatusRaw?.leaving_status ?? na,
                              })}
                            </p>
                          </div>

                          <div className="rounded-[10px] border border-[#2d3139] bg-white/[0.03] p-3">
                            <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                              {t("predictedAtEta")}
                            </p>
                            <div className="mt-2">
                              <Pill
                                color={etaStyles.text}
                                backgroundColor={etaStyles.bg}
                                borderColor={etaStyles.border}
                              >
                                {tBucket(checkpoint.predictedStatusAtEta)}
                              </Pill>
                            </div>
                            <p className="mt-3 text-[12px] text-[#94a3b8]">
                              {t("directionLine", {
                                value: formatRouteDirection(checkpoint.routeDirection),
                              })}
                            </p>
                            <p className="mt-1 text-[12px] text-[#94a3b8]">
                              {t("selectedSideLine", {
                                value: formatSelectedStatusType(checkpoint.selectedStatusType),
                              })}
                            </p>
                            <p className="mt-1 text-[12px] text-[#94a3b8]">
                              {t("forecastSource", { value: checkpoint.forecastSource ?? na })}
                            </p>
                            <p className="mt-1 text-[12px] text-[#94a3b8]">
                              {t("confidenceLine", {
                                value: formatConfidence(checkpoint.forecastConfidence),
                              })}
                            </p>
                          </div>
                        </div>

                        {checkpoint.forecastReason ? (
                          <p className="mt-3 rounded-[10px] border border-[#2d3139] bg-white/[0.03] px-3 py-2 text-[12px] leading-6 text-[#dbe4f0]">
                            {checkpoint.forecastReason}
                          </p>
                        ) : null}

                        {Object.keys(checkpoint.forecastProbabilities).length > 0 ? (
                          <details className="mt-3 rounded-[10px] border border-[#2d3139] bg-white/[0.03] px-3 py-2">
                            <summary className="cursor-pointer list-none text-[12px] font-medium text-[#dbe4f0]">
                              {t("probabilityBreakdown")}
                            </summary>
                            {(() => {
                              const probabilityEntries = getProbabilityEntries(
                                checkpoint.forecastProbabilities,
                              );
                              const totalProbability = probabilityEntries.reduce(
                                (sum, entry) => sum + entry.value,
                                0,
                              );

                              return (
                                <>
                                  <p className="mt-2 text-[12px] text-[#94a3b8]">
                                    {getProbabilitySummary(checkpoint.forecastProbabilities)}
                                  </p>
                                  <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[#111827]">
                                    {probabilityEntries.map((entry) => (
                                      <div
                                        key={entry.label}
                                        className="h-full"
                                        style={{
                                          width: `${
                                            totalProbability > 0
                                              ? Math.max(
                                                  6,
                                                  (entry.value / totalProbability) * 100,
                                                )
                                              : 0
                                          }%`,
                                          backgroundColor: getProbabilityColor(entry.label),
                                        }}
                                      />
                                    ))}
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {probabilityEntries.map((entry) => (
                                      <span
                                        key={entry.label}
                                        className="rounded-full border border-white/8 bg-white/[0.05] px-2.5 py-1 text-[11px] text-[#cbd5e1]"
                                      >
                                        {entry.label} {formatPercent(entry.value)}
                                      </span>
                                    ))}
                                  </div>
                                </>
                              );
                            })()}
                          </details>
                        ) : null}

                        <details className="mt-3 rounded-[10px] border border-[#2d3139] bg-white/[0.03] px-3 py-2">
                          <summary className="cursor-pointer list-none text-[12px] font-medium text-[#dbe4f0]">
                            {t("matchDetails")}
                          </summary>
                          <div className="mt-3 grid gap-2 text-[12px] text-[#94a3b8] sm:grid-cols-2">
                            <p>
                              {t("distanceFromRoute", {
                                value: formatDistanceLabel(checkpoint.distanceFromRouteM),
                              })}
                            </p>
                            <p>
                              {t("matchConfidence", {
                                value: formatMatchConfidence(checkpoint.matchConfidence),
                              })}
                            </p>
                            <p>
                              {t("projectionT", { value: formatNumberLabel(checkpoint.projectionT, 3) })}
                            </p>
                            <p>
                              {t("nearestSegment", {
                                value: formatNumberLabel(checkpoint.nearestSegmentIndex),
                              })}
                            </p>
                            <p>
                              {t("chainage", { value: formatNumberLabel(checkpoint.chainageM) })}
                            </p>
                            <p>
                              {t("projectedPoint", {
                                value: checkpoint.projectedPointOnRoute
                                  ? formatCoordinatePair(
                                      checkpoint.projectedPointOnRoute[1],
                                      checkpoint.projectedPointOnRoute[0],
                                    )
                                  : na,
                              })}
                            </p>
                          </div>
                        </details>
                      </article>
                    );
                  });
                })()}
              </div>
            ) : (
              <p className="mt-4 rounded-[10px] border border-dashed border-white/8 px-3 py-4 text-[12px] text-[#94a3b8]">
                {t("noForecastDetails")}
              </p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
