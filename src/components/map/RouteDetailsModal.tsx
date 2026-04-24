"use client";

import { useEffect, type ReactNode } from "react";

import type { RoutePath, RoutingRiskLevel, RoutingStatusBucket } from "@/lib/types/map";

interface RouteDetailsModalProps {
  open: boolean;
  route: RoutePath | null;
  departAt: string | null;
  onClose: () => void;
}

const RISK_VISUALS: Record<
  RoutingRiskLevel,
  {
    label: string;
    text: string;
    bg: string;
    border: string;
    meter: string;
  }
> = {
  low: {
    label: "Low",
    text: "#86efac",
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.35)",
    meter: "#22c55e",
  },
  medium: {
    label: "Medium",
    text: "#fbbf24",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.35)",
    meter: "#f59e0b",
  },
  high: {
    label: "High",
    text: "#fca5a5",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.35)",
    meter: "#ef4444",
  },
  unknown: {
    label: "Unknown",
    text: "#cbd5e1",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.35)",
    meter: "#94a3b8",
  },
};

const STATUS_VISUALS: Record<
  RoutingStatusBucket,
  {
    label: string;
    text: string;
    bg: string;
    border: string;
  }
> = {
  green: {
    label: "Green",
    text: "#86efac",
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.35)",
  },
  yellow: {
    label: "Yellow",
    text: "#fbbf24",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.35)",
  },
  red: {
    label: "Red",
    text: "#fca5a5",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.35)",
  },
  unknown: {
    label: "Unknown",
    text: "#cbd5e1",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.35)",
  },
};

function formatRouteDistance(distanceM: number): string {
  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    return "0 km";
  }

  if (distanceM >= 1000) {
    return `${(distanceM / 1000).toFixed(distanceM >= 10000 ? 0 : 1)} km`;
  }

  return `${Math.round(distanceM)} m`;
}

function formatDurationLabel(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) {
    return "n/a";
  }

  const totalMinutes = Math.round(durationMs / 60000);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${totalMinutes}m`;
}

function formatDateTimeLabel(value: string | null): string {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(parsed);
}

function formatArrivalShortLabel(value: string | null): string {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(parsed);
}

function formatCoordinatePair(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "n/a";
  }

  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function formatConfidence(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${Math.round(value * 100)}%`;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${Math.round(value * 100)}%`;
}

function normalizeRiskLevel(
  route: RoutePath,
): RoutingRiskLevel {
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

function getRouteSmartEta(route: RoutePath, departAt: string | null): string {
  return formatArrivalShortLabel(resolveRouteArrivalDateTime(route, departAt));
}

function getRouteDelayLabel(route: RoutePath): string {
  const delayMinutes = route.expectedDelayMinutes ?? route.estimatedDelayMinutes;
  if (delayMinutes === null || !Number.isFinite(delayMinutes) || delayMinutes <= 0) {
    return "No predicted delay";
  }

  return `+${Math.max(1, Math.round(delayMinutes))} min expected delay`;
}

function getRouteScoreLabel(route: RoutePath): string {
  if (route.riskScore !== null && Number.isFinite(route.riskScore)) {
    return `Risk score ${route.riskScore.toFixed(1)}`;
  }

  if (Number.isFinite(route.routeScore)) {
    return `Routing score ${route.routeScore.toFixed(1)}`;
  }

  return "Risk score n/a";
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

function getProbabilitySummary(probabilities: Record<string, number>): string {
  const entries = getProbabilityEntries(probabilities);
  if (entries.length === 0) {
    return "No probability breakdown available.";
  }

  return entries
    .slice(0, 3)
    .map((entry) => `${entry.label} ${formatPercent(entry.value)}`)
    .join(" · ");
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
  onClose,
}: RouteDetailsModalProps) {
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

  const riskLevel = normalizeRiskLevel(route);
  const risk = RISK_VISUALS[riskLevel];
  const worstStatus = STATUS_VISUALS[route.worstPredictedStatus];
  const routeSummary = getRiskSummary(route);
  const routeDelayLabel = getRouteDelayLabel(route);
  const routeScoreLabel = getRouteScoreLabel(route);
  const routeSmartEta = getRouteSmartEta(route, departAt);
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

  return (
    <div className="fixed inset-0 z-50" aria-hidden={!isVisible}>
      <button
        type="button"
        aria-label="Close route details modal"
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
                ROUTE DETAILS
              </p>
              <h2 id="route-details-title" className="mt-1 text-[24px] font-bold text-[#f9fafb]">
                Route #{route.rank}
              </h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#94a3b8]">
                Full route info with journey risk, ETA, and checkpoint conditions now
                versus when you are expected to reach them.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-transparent text-[#cbd5e1] transition hover:bg-white/5 hover:text-[#f9fafb]"
              aria-label="Close modal"
            >
              <span className="text-xl leading-none">×</span>
            </button>
          </div>
        </header>

        <div className="relative flex-1 overflow-y-auto p-4">
          <section className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mashwar-mono text-[10px] uppercase tracking-[0.24em] text-[#6b7280]">
                Route legend
              </span>
              <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[11px] text-sky-100">
                Smart ETA = predicted arrival
              </span>
              <Pill
                color={RISK_VISUALS.low.text}
                backgroundColor={RISK_VISUALS.low.bg}
                borderColor={RISK_VISUALS.low.border}
              >
                Low risk
              </Pill>
              <Pill
                color={RISK_VISUALS.medium.text}
                backgroundColor={RISK_VISUALS.medium.bg}
                borderColor={RISK_VISUALS.medium.border}
              >
                Medium risk
              </Pill>
              <Pill
                color={RISK_VISUALS.high.text}
                backgroundColor={RISK_VISUALS.high.bg}
                borderColor={RISK_VISUALS.high.border}
              >
                High risk
              </Pill>
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-4">
            <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-4">
              <p className="mashwar-mono text-[10px] uppercase tracking-[0.24em] text-[#6b7280]">
                Smart ETA
              </p>
              <p className="mt-2 text-[24px] font-semibold text-[#f9fafb]">
                {routeSmartEta}
              </p>
              <p className="mt-2 text-[12px] text-[#94a3b8]">{routeDelayLabel}</p>
              <p className="mt-1 text-[12px] text-[#94a3b8]">
                {route.expectedDelayMinutes !== null && route.expectedDelayMinutes > 0
                  ? "includes predicted checkpoint delay"
                  : "Falls back to the legacy travel-time estimate when Smart ETA is missing."}
              </p>
            </div>

            <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-4">
              <p className="mashwar-mono text-[10px] uppercase tracking-[0.24em] text-[#6b7280]">
                Journey Risk
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Pill color={risk.text} backgroundColor={risk.bg} borderColor={risk.border}>
                  {risk.label}
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
                    backgroundColor: risk.meter,
                  }}
                />
              </div>
              <p className="mt-2 text-[12px] text-[#94a3b8]">
                Confidence {formatConfidence(route.riskConfidence)}
              </p>
              {routeSummary ? (
                <p className="mt-1 text-[12px] leading-5 text-[#dbe4f0]">{routeSummary}</p>
              ) : null}
            </div>

            <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-4">
              <p className="mashwar-mono text-[10px] uppercase tracking-[0.24em] text-[#6b7280]">
                Distance
              </p>
              <p className="mt-2 text-[24px] font-semibold text-[#f9fafb]">
                {formatRouteDistance(route.distanceM)}
              </p>
              <p className="mt-2 text-[12px] text-[#94a3b8]">
                {Number.isFinite(route.routeScore) ? `Route score ${route.routeScore.toFixed(1)}` : "Route score n/a"}
              </p>
              {route.historicalVolatility !== null ? (
                <p className="mt-1 text-[12px] text-[#94a3b8]">
                  Historical volatility {route.historicalVolatility.toFixed(1)}
                </p>
              ) : null}
            </div>

            <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-4">
              <p className="mashwar-mono text-[10px] uppercase tracking-[0.24em] text-[#6b7280]">
                Checkpoints
              </p>
              <p className="mt-2 text-[24px] font-semibold text-[#f9fafb]">
                {route.checkpointCount}
              </p>
              <p className="mt-2 text-[12px] text-[#94a3b8]">
                {route.checkpoints.length} ordered timeline stops with propagation
              </p>
            </div>
          </div>

          <section className="mt-4 rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill color={risk.text} backgroundColor={risk.bg} borderColor={risk.border}>
                {risk.label} risk
              </Pill>
              <Pill
                color={worstStatus.text}
                backgroundColor={worstStatus.bg}
                borderColor={worstStatus.border}
              >
                Worst {worstStatus.label}
              </Pill>
              <Pill color="#cbd5e1" backgroundColor="rgba(148, 163, 184, 0.12)" borderColor="rgba(148, 163, 184, 0.24)">
                Rank #{route.rank}
              </Pill>
            </div>

            <p className="mt-3 text-[13px] leading-6 text-[#dbe4f0]">
              {route.reasonSummary || "No backend reasoning summary was provided for this route."}
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
                  Checkpoint Timeline
                </p>
                <p className="mt-1 text-[13px] text-[#94a3b8]">
                  Base ETA rolls into effective ETA so you can see how delay carries forward.
                </p>
              </div>
            </div>

            {orderedCheckpoints.length > 0 ? (
              <div className="mt-4 space-y-3">
                {(() => {
                  let carriedDelayMs = 0;

                  return orderedCheckpoints.map((checkpoint, index) => {
                    const currentStatus = STATUS_VISUALS[checkpoint.currentStatus];
                    const etaStatus = STATUS_VISUALS[checkpoint.predictedStatusAtEta];
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
                              {formatCoordinatePair(checkpoint.lat, checkpoint.lng)}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full border border-[#2d3139] px-2.5 py-1 text-[11px] text-[#cbd5e1]">
                              Reach {formatDateTimeLabel(checkpoint.crossingDateTime)}
                            </span>
                            <span className="rounded-full border border-[#2d3139] px-2.5 py-1 text-[11px] text-[#cbd5e1]">
                              {formatDurationLabel(checkpoint.etaMs)} from departure
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-[10px] border border-[#2d3139] bg-white/[0.03] p-3">
                            <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                              Base ETA
                            </p>
                            <p className="mt-2 text-[18px] font-semibold text-[#f9fafb]">
                              {formatDurationLabel(baseEtaMs)}
                            </p>
                            <p className="mt-2 text-[12px] text-[#94a3b8]">
                              The checkpoint ETA before predicted delay is applied.
                            </p>
                          </div>

                          <div className="rounded-[10px] border border-[#2d3139] bg-white/[0.03] p-3">
                            <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                              Effective ETA
                            </p>
                            <p className="mt-2 text-[18px] font-semibold text-[#f9fafb]">
                              {formatDurationLabel(effectiveEtaMs)}
                            </p>
                            <p className="mt-2 text-[12px] text-[#94a3b8]">
                              Predicted arrival after checkpoint delay propagation.
                            </p>
                          </div>

                          <div className="rounded-[10px] border border-[#2d3139] bg-white/[0.03] p-3">
                            <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                              Expected Delay
                            </p>
                            <p className="mt-2 text-[18px] font-semibold text-[#f9fafb]">
                              {formatDurationLabel(checkpointDelayMs)}
                            </p>
                            <p className="mt-2 text-[12px] text-[#94a3b8]">
                              {hasDelay
                                ? `Carried forward: ${formatDurationLabel(carriedForwardMs)}`
                                : "No propagated delay before this checkpoint."}
                            </p>
                          </div>

                          <div className="rounded-[10px] border border-[#2d3139] bg-white/[0.03] p-3">
                            <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                              Prediction
                            </p>
                            <div className="mt-2">
                              <Pill
                                color={etaStatus.text}
                                backgroundColor={etaStatus.bg}
                                borderColor={etaStatus.border}
                              >
                                {etaStatus.label}
                              </Pill>
                            </div>
                            <p className="mt-2 text-[12px] text-[#94a3b8]">
                              Selected status: {checkpoint.selectedStatusType ?? "n/a"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-[10px] border border-[#2d3139] bg-white/[0.03] p-3">
                            <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                              Status Now
                            </p>
                            <div className="mt-2">
                              <Pill
                                color={currentStatus.text}
                                backgroundColor={currentStatus.bg}
                                borderColor={currentStatus.border}
                              >
                                {currentStatus.label}
                              </Pill>
                            </div>
                            <p className="mt-3 text-[12px] text-[#94a3b8]">
                              Entering: {checkpoint.currentStatusRaw?.entering_status ?? "n/a"}
                            </p>
                            <p className="mt-1 text-[12px] text-[#94a3b8]">
                              Leaving: {checkpoint.currentStatusRaw?.leaving_status ?? "n/a"}
                            </p>
                          </div>

                          <div className="rounded-[10px] border border-[#2d3139] bg-white/[0.03] p-3">
                            <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                              Status At Arrival
                            </p>
                            <div className="mt-2">
                              <Pill
                                color={etaStatus.text}
                                backgroundColor={etaStatus.bg}
                                borderColor={etaStatus.border}
                              >
                                {etaStatus.label}
                              </Pill>
                            </div>
                            <p className="mt-3 text-[12px] text-[#94a3b8]">
                              Forecast source: {checkpoint.forecastSource ?? "n/a"}
                            </p>
                            <p className="mt-1 text-[12px] text-[#94a3b8]">
                              Confidence: {formatConfidence(checkpoint.forecastConfidence)}
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
                              Probability breakdown
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
                      </article>
                    );
                  });
                })()}
              </div>
            ) : (
              <p className="mt-4 rounded-[10px] border border-dashed border-white/8 px-3 py-4 text-[12px] text-[#94a3b8]">
                No checkpoint forecast details were attached to this route.
              </p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
