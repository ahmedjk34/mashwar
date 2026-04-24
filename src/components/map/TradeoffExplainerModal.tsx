"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { NormalizedRoutes, RoutingStatusBucket } from "@/lib/types/map";

type TradeoffExplainer = NonNullable<NormalizedRoutes["tradeoffExplainer"]>;
type TradeoffRoute = TradeoffExplainer["routes"][number];

interface TradeoffExplainerModalProps {
  explainer: TradeoffExplainer | null;
  selectedRouteId: string | null;
  onRouteSelect: (routeId: string) => void;
}

const RISK_VISUALS: Record<
  "low" | "medium" | "high" | "unknown",
  {
    label: string;
    text: string;
    bg: string;
    border: string;
    meter: string;
  }
> = {
  low: {
    label: "SAFE",
    text: "#86efac",
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.32)",
    meter: "#22c55e",
  },
  medium: {
    label: "CAUTION",
    text: "#fbbf24",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.32)",
    meter: "#f59e0b",
  },
  high: {
    label: "AVOID",
    text: "#fca5a5",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.32)",
    meter: "#ef4444",
  },
  unknown: {
    label: "UNKNOWN",
    text: "#cbd5e1",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.28)",
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
    label: "GREEN",
    text: "#86efac",
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.32)",
  },
  yellow: {
    label: "YELLOW",
    text: "#fbbf24",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.32)",
  },
  red: {
    label: "RED",
    text: "#fca5a5",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.32)",
  },
  unknown: {
    label: "UNKNOWN",
    text: "#cbd5e1",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.28)",
  },
};

function formatNumber(value: number | null, fractionDigits = 0): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(fractionDigits);
}

function formatSignedNumber(value: number | null, fractionDigits = 0): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  const rounded = value.toFixed(fractionDigits);
  return value > 0 ? `+${rounded}` : rounded;
}

function formatMinutes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${Math.round(value)} min`;
}

function formatDistance(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} km`;
  }

  return `${Math.round(value)} m`;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${Math.round(value * 100)}%`;
}

function joinList(values: string[]): string {
  return values.length > 0 ? values.join(" · ") : "n/a";
}

function normalizeStatus(value: RoutingStatusBucket | string | null | undefined) {
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

function getStatusBadge(status: RoutingStatusBucket | string | null | undefined) {
  const normalized = normalizeStatus(status);
  const visual = STATUS_VISUALS[normalized];

  return {
    label: visual.label,
    text: visual.text,
    bg: visual.bg,
    border: visual.border,
  };
}

function getRiskVisual(level: TradeoffRoute["riskLevel"]) {
  return RISK_VISUALS[level ?? "unknown"] ?? RISK_VISUALS.unknown;
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
        color: tone?.text ?? "#dbe4f0",
        backgroundColor: tone?.bg ?? "rgba(255,255,255,0.03)",
        borderColor: tone?.border ?? "rgba(255,255,255,0.08)",
      }}
    >
      <p
        className="mashwar-mono text-[9px] uppercase tracking-[0.24em]"
        style={{ color: tone?.text ? `${tone.text}cc` : "#94a3b8" }}
      >
        {label}
      </p>
      <p className="mt-1 text-[13px] font-semibold text-inherit">{value}</p>
    </div>
  );
}

function FlagChip({
  children,
  tone,
}: {
  children: string;
  tone: {
    text: string;
    bg: string;
    border: string;
  };
}) {
  return (
    <span
      className="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
      style={{
        color: tone.text,
        backgroundColor: tone.bg,
        borderColor: tone.border,
      }}
    >
      {children}
    </span>
  );
}

export default function TradeoffExplainerModal({
  explainer,
  selectedRouteId,
  onRouteSelect,
}: TradeoffExplainerModalProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const routeRefs = useRef(new Map<string, HTMLButtonElement | null>());

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
    ? routes.find((route) => route.routeId === explainer.winnerRouteId) ??
      routes[0] ??
      null
    : null;
  const selectedOrWinnerRouteId = selectedRouteId ?? winnerRoute?.routeId ?? null;
  const maxDuration = Math.max(
    0,
    ...routes.map((route) => route.durationMinutes ?? 0),
  );
  const maxRisk = Math.max(
    0,
    ...routes.map((route) => route.riskScore ?? 0),
  );
  const maxDelay = Math.max(
    0,
    ...routes.map((route) => route.expectedDelayMinutes ?? 0),
  );

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

  if (!isOpen) {
    return (
      <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2" style={{ zIndex: 60 }}>
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setIsCollapsed(false);
          }}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(11,15,20,0.82)] px-4 py-2 text-[11px] font-semibold text-[#f9fafb] shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl transition hover:border-white/20 hover:bg-[rgba(11,15,20,0.94)]"
        >
          <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
          Show route tradeoff explainer
        </button>
      </div>
    );
  }

  const hasTextSections =
    Boolean(explainer.englishText) ||
    Boolean(explainer.arabicText);

  return (
    <div
      className="fixed inset-x-0 top-4 z-50 flex justify-center px-3"
      style={{ zIndex: 60 }}
      aria-live="polite"
    >
      <section
        role="dialog"
        aria-modal="false"
        aria-label="Route tradeoff explainer"
        className="pointer-events-auto w-[min(100vw-1rem,1180px)] overflow-hidden rounded-[28px] border border-white/10 bg-[rgba(10,12,16,0.78)] shadow-[0_30px_100px_rgba(0,0,0,0.72)] backdrop-blur-2xl"
        style={{ animation: "mashwar-modal-in 220ms ease-out" }}
      >
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_24%),radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_28%)]">
          <header className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mashwar-mono text-[10px] uppercase tracking-[0.34em] text-[#6b7280]">
                  Tradeoff explainer
                </span>
                <button
                  type="button"
                  onClick={scrollToWinner}
                  className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-400/15"
                >
                  Winner #{explainer.winnerRank ?? "n/a"}
                </button>
                {explainer.comparedRouteCount !== null ? (
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-[#dbe4f0]">
                    {explainer.comparedRouteCount} routes compared
                  </span>
                ) : null}
              </div>

              <h2 className="mt-3 text-[20px] font-semibold text-[#f9fafb] sm:text-[24px]">
                Best route today
              </h2>

              <div className="mt-2 grid gap-2 text-[13px] leading-6 text-[#dbe4f0]">
                <p>
                  Recommended route:{" "}
                  <span className="font-semibold text-[#f9fafb]">
                    {winnerRoute?.labelEn ?? explainer.winnerRouteId ?? "n/a"}
                  </span>
                </p>
                <p className="text-[#cbd5e1]">
                  {explainer.setSummary.decisionDriverEn ?? "No English summary returned."}
                </p>
                <p dir="rtl" className="mashwar-rtl text-[#cbd5e1]">
                  {explainer.setSummary.decisionDriverAr ?? "لا يوجد ملخص عربي."}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => setIsCollapsed((current) => !current)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-[#dbe4f0] transition hover:bg-white/[0.06]"
              >
                {isCollapsed ? "Expand" : "Collapse"}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[#dbe4f0] transition hover:bg-white/[0.06] hover:text-[#f9fafb]"
                aria-label="Close route tradeoff explainer"
              >
                ×
              </button>
            </div>
          </header>

          {!isCollapsed ? (
            <div className="max-h-[calc(100dvh-7.5rem)] overflow-y-auto mashwar-scroll px-4 py-4 sm:px-5">
              <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <article className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                      Summary
                    </span>
                    {explainer.setSummary.corridorNote ? (
                      <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[11px] text-sky-100">
                        {explainer.setSummary.corridorNote}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    <MetricChip
                      label="Time spread"
                      value={formatMinutes(explainer.setSummary.timeSpreadMinutes)}
                    />
                    <MetricChip
                      label="Risk spread"
                      value={formatNumber(explainer.setSummary.riskSpread, 2)}
                    />
                    <MetricChip
                      label="Delay spread"
                      value={formatMinutes(explainer.setSummary.delaySpreadMinutes)}
                    />
                    <MetricChip
                      label="Checkpoint spread"
                      value={formatNumber(explainer.setSummary.checkpointSpread, 0)}
                    />
                    <MetricChip
                      label="Confidence spread"
                      value={formatPercent(explainer.setSummary.confidenceSpread)}
                    />
                    <MetricChip
                      label="Volatility spread"
                      value={formatNumber(explainer.setSummary.volatilitySpread, 2)}
                    />
                  </div>

                  <div className="mt-4 grid gap-3 rounded-[18px] border border-white/8 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                        Decision driver
                      </p>
                      <span className="text-[11px] text-[#94a3b8]">
                        Winner: {explainer.winnerRouteId ?? "n/a"}
                      </span>
                    </div>
                    <p className="text-[13px] leading-6 text-[#e5e7eb]">
                      {explainer.setSummary.decisionDriverEn ?? "No English decision driver returned."}
                    </p>
                    <p dir="rtl" className="mashwar-rtl text-[13px] leading-6 text-[#dbe4f0]">
                      {explainer.setSummary.decisionDriverAr ?? "لا يوجد سبب قرار باللغة العربية."}
                    </p>
                  </div>
                </article>

                <article className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                      Full explanation
                    </p>
                    <span className="text-[11px] text-[#94a3b8]">Source of truth</span>
                  </div>

                  {explainer.fullText ? (
                    <p className="mt-3 whitespace-pre-line text-[13px] leading-7 text-[#dbe4f0]">
                      {explainer.fullText}
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <p className="rounded-[16px] border border-white/8 bg-black/20 p-3 text-[13px] leading-7 text-[#dbe4f0]">
                        <span className="mashwar-mono block text-[10px] uppercase tracking-[0.22em] text-[#6b7280]">
                          English
                        </span>
                        <span className="mt-2 block whitespace-pre-line">
                          {explainer.englishText ?? "No English explanation returned."}
                        </span>
                      </p>
                      <p dir="rtl" className="rounded-[16px] border border-white/8 bg-black/20 p-3 text-[13px] leading-7 text-[#dbe4f0]">
                        <span className="mashwar-mono block text-[10px] uppercase tracking-[0.22em] text-[#6b7280]">
                          العربية
                        </span>
                        <span className="mt-2 block whitespace-pre-line mashwar-rtl">
                          {explainer.arabicText ?? "لا يوجد شرح عربي."}
                        </span>
                      </p>
                    </div>
                  )}
                </article>
              </section>

              <section className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                      Route comparison
                    </p>
                    <p className="mt-1 text-[13px] text-[#94a3b8]">
                      Every returned route is shown, sorted by rank.
                    </p>
                  </div>
                  {winnerRoute ? (
                    <button
                      type="button"
                      onClick={scrollToWinner}
                      className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-400/15"
                    >
                      Jump to winner
                    </button>
                  ) : null}
                </div>

                {routes.length > 0 ? (
                  <div className="mt-4 grid gap-3">
                    {routes.map((route) => {
                      const isWinner = route.routeId === explainer.winnerRouteId;
                      const isSelected = route.routeId === selectedOrWinnerRouteId;
                      const riskVisual = getRiskVisual(route.riskLevel);
                      const statusBadge = getStatusBadge(route.worstPredictedStatus);
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
                      const facts = route.comparisonFacts.english.length
                        ? route.comparisonFacts.english
                        : route.comparisonFacts.arabic;
                      const whyLine = facts[0] ?? "No comparison facts returned.";

                      return (
                        <button
                          key={route.uiKey}
                          type="button"
                          ref={(node) => {
                            routeRefs.current.set(route.uiKey, node);
                          }}
                          onClick={() => focusRoute(route)}
                          className={`w-full rounded-[22px] border p-4 text-left transition ${
                            isSelected
                              ? "border-sky-400/35 bg-sky-400/[0.08] shadow-[0_12px_28px_rgba(59,130,246,0.14)]"
                              : "border-white/8 bg-white/[0.03] hover:border-white/16 hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-[#f9fafb]">
                                  #{route.rank}
                                </span>
                                {isWinner ? (
                                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                                    Winner
                                  </span>
                                ) : null}
                                {route.isRecommended ? (
                                  <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold text-sky-100">
                                    Recommended
                                  </span>
                                ) : null}
                                {route.isFastest ? (
                                  <FlagChip
                                    tone={{
                                      text: "#bfdbfe",
                                      bg: "rgba(59, 130, 246, 0.12)",
                                      border: "rgba(59, 130, 246, 0.28)",
                                    }}
                                  >
                                    Fastest
                                  </FlagChip>
                                ) : null}
                                {route.isSafest ? (
                                  <FlagChip tone={RISK_VISUALS.low}>Safest</FlagChip>
                                ) : null}
                                {route.isLowestDelay ? (
                                  <FlagChip tone={RISK_VISUALS.medium}>Lowest delay</FlagChip>
                                ) : null}
                                {route.isHighestRisk ? (
                                  <FlagChip tone={RISK_VISUALS.high}>Highest risk</FlagChip>
                                ) : null}
                              </div>

                              <h3 className="mt-3 text-[18px] font-semibold text-[#f9fafb]">
                                {route.labelEn ?? "Unnamed route"}
                              </h3>
                              <p dir="rtl" className="mt-1 mashwar-rtl text-[13px] leading-6 text-[#cbd5e1]">
                                {route.labelAr ?? "لا يوجد اسم عربي"}
                              </p>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <span
                                className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                                style={{
                                  color: riskVisual.text,
                                  backgroundColor: riskVisual.bg,
                                  borderColor: riskVisual.border,
                                }}
                              >
                                {riskVisual.label}
                              </span>
                              <span
                                className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                                style={{
                                  color: statusBadge.text,
                                  backgroundColor: statusBadge.bg,
                                  borderColor: statusBadge.border,
                                }}
                              >
                                {statusBadge.label}
                              </span>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            <MetricChip
                              label="Duration"
                              value={formatMinutes(route.durationMinutes)}
                            />
                            <MetricChip
                              label="Smart ETA"
                              value={formatMinutes(route.smartEtaMinutes)}
                            />
                            <MetricChip
                              label="Expected delay"
                              value={formatMinutes(route.expectedDelayMinutes)}
                            />
                            <MetricChip
                              label="Risk score"
                              value={formatNumber(route.riskScore, 2)}
                              tone={{
                                text: riskVisual.text,
                                bg: riskVisual.bg,
                                border: riskVisual.border,
                              }}
                            />
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                            <div className="rounded-[18px] border border-white/8 bg-black/20 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="mashwar-mono text-[9px] uppercase tracking-[0.24em] text-[#6b7280]">
                                  Time vs risk
                                </p>
                                <span className="text-[11px] text-[#94a3b8]">
                                  {formatSignedNumber(route.durationDeltaVsRecommendedMinutes, 0)} min vs recommended
                                </span>
                              </div>
                              <div className="mt-3 space-y-2">
                                <div>
                                  <div className="flex items-center justify-between text-[11px] text-[#94a3b8]">
                                    <span>Time</span>
                                    <span>{formatMinutes(route.durationMinutes)}</span>
                                  </div>
                                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/8">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${Math.min(100, durationPct * 100)}%`,
                                        background:
                                          "linear-gradient(90deg, rgba(59,130,246,0.95), rgba(59,130,246,0.55))",
                                      }}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <div className="flex items-center justify-between text-[11px] text-[#94a3b8]">
                                    <span>Risk</span>
                                    <span>{formatNumber(route.riskScore, 2)}</span>
                                  </div>
                                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/8">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${Math.min(100, riskPct * 100)}%`,
                                        background:
                                          "linear-gradient(90deg, rgba(239,68,68,0.95), rgba(245,158,11,0.72))",
                                      }}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <div className="flex items-center justify-between text-[11px] text-[#94a3b8]">
                                    <span>Delay</span>
                                    <span>{formatMinutes(route.expectedDelayMinutes)}</span>
                                  </div>
                                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/8">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${Math.min(100, delayPct * 100)}%`,
                                        background:
                                          "linear-gradient(90deg, rgba(245,158,11,0.95), rgba(34,197,94,0.55))",
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                              <MetricChip
                                label="Checkpoint count"
                                value={formatNumber(route.checkpointCount, 0)}
                              />
                              <MetricChip
                                label="Route viability"
                                value={route.routeViability}
                              />
                              <MetricChip
                                label="Risk level"
                                value={route.riskLevel}
                              />
                              <MetricChip
                                label="Risk confidence"
                                value={formatPercent(route.riskConfidence)}
                              />
                              <MetricChip
                                label="Volatility"
                                value={formatNumber(route.historicalVolatility, 2)}
                              />
                              <MetricChip
                                label="Distance"
                                value={formatDistance(route.distanceM)}
                              />
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-3">
                            <div className="rounded-[18px] border border-white/8 bg-black/20 p-3">
                              <p className="mashwar-mono text-[9px] uppercase tracking-[0.24em] text-[#6b7280]">
                                Status counts
                              </p>
                              <p className="mt-2 text-[13px] text-[#dbe4f0]">
                                Green {route.statusCounts.green} · Yellow {route.statusCounts.yellow} · Red {route.statusCounts.red} · Unknown {route.statusCounts.unknown}
                              </p>
                            </div>
                            <div className="rounded-[18px] border border-white/8 bg-black/20 p-3">
                              <p className="mashwar-mono text-[9px] uppercase tracking-[0.24em] text-[#6b7280]">
                                Direction counts
                              </p>
                              <p className="mt-2 text-[13px] text-[#dbe4f0]">
                                Entering {route.routeDirectionCounts.entering} · Leaving {route.routeDirectionCounts.leaving} · Transit {route.routeDirectionCounts.transit} · Unknown {route.routeDirectionCounts.unknown}
                              </p>
                            </div>
                            <div className="rounded-[18px] border border-white/8 bg-black/20 p-3">
                              <p className="mashwar-mono text-[9px] uppercase tracking-[0.24em] text-[#6b7280]">
                                Corridor cities
                              </p>
                              <p className="mt-2 text-[13px] text-[#dbe4f0]">
                                {joinList(route.routeCorridorCities)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 rounded-[18px] border border-white/8 bg-black/20 p-3">
                            <p className="mashwar-mono text-[9px] uppercase tracking-[0.24em] text-[#6b7280]">
                              Why this route matters
                            </p>
                            <p className="mt-2 text-[13px] leading-6 text-[#e5e7eb]">
                              {whyLine}
                            </p>
                            {route.comparisonFacts.english.length > 1 || route.comparisonFacts.arabic.length > 1 ? (
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                {route.comparisonFacts.english.length > 0 ? (
                                  <ul className="space-y-2 text-[12px] leading-6 text-[#cbd5e1]">
                                    {route.comparisonFacts.english.map((fact) => (
                                      <li key={fact} className="rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2">
                                        {fact}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                                {route.comparisonFacts.arabic.length > 0 ? (
                                  <ul dir="rtl" className="space-y-2 text-[12px] leading-6 text-[#cbd5e1]">
                                    {route.comparisonFacts.arabic.map((fact) => (
                                      <li key={fact} className="rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2 mashwar-rtl">
                                        {fact}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            ) : null}
                          </div>

                          <details className="mt-4 rounded-[18px] border border-white/8 bg-black/20 p-3">
                            <summary className="cursor-pointer list-none text-[13px] font-semibold text-[#f9fafb]">
                              Risky checkpoints
                              {route.riskyCheckpointCount > 0 ? ` (${route.riskyCheckpointCount})` : " (none)"}
                            </summary>

                            {route.riskyCheckpointCount > 0 ? (
                              <div className="mt-3 grid gap-2">
                                {route.riskyCheckpoints.map((checkpoint) => {
                                  const currentStatus = getStatusBadge(checkpoint.currentStatus);
                                  const etaStatus = getStatusBadge(checkpoint.predictedStatusAtEta);

                                  return (
                                    <div
                                      key={`${checkpoint.checkpointId ?? checkpoint.name}-${checkpoint.name}`}
                                      className="rounded-[16px] border border-white/8 bg-white/[0.03] p-3"
                                    >
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <p className="text-[13px] font-semibold text-[#f9fafb]">
                                            {checkpoint.name}
                                          </p>
                                          <p className="mt-1 text-[12px] text-[#94a3b8]">
                                            {checkpoint.city ?? "Unknown city"} · {checkpoint.routeDirection ?? "Unknown direction"}
                                          </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          <span
                                            className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                                            style={{
                                              color: etaStatus.text,
                                              backgroundColor: etaStatus.bg,
                                              borderColor: etaStatus.border,
                                            }}
                                          >
                                            ETA {etaStatus.label}
                                          </span>
                                          <span
                                            className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                                            style={{
                                              color: currentStatus.text,
                                              backgroundColor: currentStatus.bg,
                                              borderColor: currentStatus.border,
                                            }}
                                          >
                                            Current {currentStatus.label}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                        <MetricChip
                                          label="ETA"
                                          value={formatMinutes(checkpoint.etaMinutes)}
                                        />
                                        <MetricChip
                                          label="Forecast confidence"
                                          value={formatPercent(checkpoint.forecastConfidence)}
                                        />
                                        <MetricChip
                                          label="Expected delay"
                                          value={formatMinutes(checkpoint.expectedDelayMinutes)}
                                        />
                                        <MetricChip
                                          label="Distance from route"
                                          value={formatDistance(checkpoint.distanceFromRouteM)}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </details>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-[22px] border border-dashed border-white/12 bg-white/[0.03] p-6 text-[13px] leading-7 text-[#94a3b8]">
                    No tradeoff routes were returned. The explanation text is still available, but there are no route cards to compare.
                  </div>
                )}
              </section>

              {!explainer.fullText && hasTextSections ? (
                <section className="mt-4 rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                    Bilingual text
                  </p>
                  {explainer.englishText ? (
                    <p className="mt-3 whitespace-pre-line text-[13px] leading-7 text-[#dbe4f0]">
                      {explainer.englishText}
                    </p>
                  ) : null}
                  {explainer.arabicText ? (
                    <p dir="rtl" className="mt-3 whitespace-pre-line text-[13px] leading-7 text-[#dbe4f0] mashwar-rtl">
                      {explainer.arabicText}
                    </p>
                  ) : null}
                </section>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] text-[#cbd5e1] sm:px-5">
              <p>
                {winnerRoute?.labelEn ?? "Winner route"} is summarized here. Expand to inspect all returned routes.
              </p>
              {winnerRoute ? (
                <button
                  type="button"
                  onClick={scrollToWinner}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-[#f9fafb] transition hover:bg-white/[0.06]"
                >
                  Focus winner
                </button>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
