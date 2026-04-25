"use client";

import { useEffect, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";

import type {
  NormalizedRoutes,
  RoutePath,
  RoutingCheckpoint,
  RoutingRiskLevel,
  RoutingStatusBucket,
} from "@/lib/types/map";
import { formatDateTimeInPalestine } from "@/lib/utils/palestine-time";

/** Below Smart What If modal (`z-[3000]`); above tradeoff (`z-[1150]`) and map chrome. */
const ROUTE_DETAILS_Z_INDEX = 2800;

interface RouteDetailsModalProps {
  open: boolean;
  route: RoutePath | null;
  departAt: string | null;
  routeVersion?: string | null;
  checkpointMatching?: NormalizedRoutes["checkpointMatching"];
  onClose: () => void;
}

const BUCKET_STYLES: Record<
  RoutingStatusBucket,
  { text: string; bg: string; border: string }
> = {
  green: {
    text: "var(--risk-low)",
    bg: "var(--risk-low-bg)",
    border: "rgba(0, 166, 81, 0.35)",
  },
  yellow: {
    text: "var(--risk-med)",
    bg: "var(--risk-med-bg)",
    border: "rgba(245, 158, 11, 0.35)",
  },
  red: {
    text: "var(--risk-high)",
    bg: "var(--risk-high-bg)",
    border: "rgba(238, 42, 53, 0.35)",
  },
  unknown: {
    text: "var(--clr-slate)",
    bg: "rgba(139, 145, 150, 0.12)",
    border: "rgba(139, 145, 150, 0.28)",
  },
};

const RISK_STYLES: Record<
  RoutingRiskLevel,
  { text: string; bg: string; border: string }
> = {
  low: BUCKET_STYLES.green,
  medium: BUCKET_STYLES.yellow,
  high: BUCKET_STYLES.red,
  unknown: BUCKET_STYLES.unknown,
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
  return formatDateTimeInPalestine(resolveRouteArrivalDateTime(route, departAt));
}

function getProbabilityEntries(probabilities: Record<string, number>) {
  return Object.entries(probabilities)
    .map(([label, value]) => ({ label, value }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0)
    .sort((left, right) => right.value - left.value);
}

function formatProbabilityLabel(
  label: string,
  translateBucket: (bucket: "green" | "yellow" | "red" | "unknown") => string,
  unknownLabel: string,
): string {
  const n = label.trim().toLowerCase();
  if (n === "green" || n === "low") {
    return translateBucket("green");
  }
  if (n === "yellow" || n === "medium") {
    return translateBucket("yellow");
  }
  if (n === "red" || n === "high") {
    return translateBucket("red");
  }
  if (n === "unknown") {
    return translateBucket("unknown");
  }
  if (n.includes("green")) {
    return translateBucket("green");
  }
  if (n.includes("yellow")) {
    return translateBucket("yellow");
  }
  if (n.includes("red")) {
    return translateBucket("red");
  }
  return `${label} (${unknownLabel})`;
}

function probabilityBarColor(label: string): string {
  const n = label.trim().toLowerCase();
  if (n.includes("green") || n === "low") {
    return "var(--risk-low)";
  }
  if (n.includes("yellow") || n === "medium") {
    return "var(--risk-med)";
  }
  if (n.includes("red") || n === "high") {
    return "var(--risk-high)";
  }
  return "var(--clr-slate)";
}

function StatusPill({
  bucket,
  children,
}: {
  bucket: RoutingStatusBucket;
  children: ReactNode;
}) {
  const s = BUCKET_STYLES[bucket];
  return (
    <span
      className="inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight"
      style={{
        color: s.text,
        backgroundColor: s.bg,
        borderColor: s.border,
      }}
    >
      {children}
    </span>
  );
}

function MutedKicker({ children, dir }: { children: ReactNode; dir: "rtl" | "ltr" }) {
  return (
    <p
      className="mashwar-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--clr-slate)]"
      dir={dir}
    >
      {children}
    </p>
  );
}

function StatTile({
  kicker,
  value,
  hint,
  dir,
}: {
  kicker: string;
  value: string;
  hint?: string | null;
  dir: "rtl" | "ltr";
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] px-2.5 py-2 sm:px-3 sm:py-2.5">
      <MutedKicker dir={dir}>{kicker}</MutedKicker>
      <p className="mashwar-arabic mt-1.5 text-[14px] font-bold tabular-nums leading-tight text-[var(--clr-white)] sm:text-[15px]" dir={dir}>
        {value}
      </p>
      {hint ? (
        <p className="mashwar-arabic mt-1 text-[10px] leading-snug text-[var(--clr-slate)]" dir={dir}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function InfoRow({
  label,
  value,
  dir,
}: {
  label: string;
  value: string;
  dir: "rtl" | "ltr";
}) {
  return (
    <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <span className="mashwar-arabic max-w-[min(100%,20rem)] shrink-0 text-[11px] font-semibold leading-snug text-[var(--clr-sand)] sm:pt-0.5" dir={dir}>
        {label}
      </span>
      <span className="mashwar-arabic min-w-0 flex-1 text-[13px] font-medium leading-snug text-[var(--clr-white)]" dir="auto">
        {value}
      </span>
    </div>
  );
}

const ROUTE_RISK_FACTOR_KEYS = new Set([
  "volatility_ratio",
  "confidence_penalty",
  "severity_ratio",
  "checkpoint_burden",
  "average_forecast_confidence",
]);

function bucketRankForInference(bucket: RoutingStatusBucket): number {
  if (bucket === "red") {
    return 3;
  }
  if (bucket === "yellow") {
    return 2;
  }
  if (bucket === "green") {
    return 1;
  }
  return 0;
}

/** Map raw status text (AR/EN/buckets) to a traffic bucket for comparing entering vs leaving. */
function rawTrafficTextToBucket(text: string | null | undefined): RoutingStatusBucket {
  if (!text) {
    return "unknown";
  }
  const s = text.trim();
  const n = s.toLowerCase();

  if (n.includes("مغلق") || n.includes("closed") || n === "red" || n.includes("heavy delay")) {
    return "red";
  }
  if (
    n.includes("أزمة") ||
    n.includes("ازمة") ||
    n === "yellow" ||
    n.includes("congestion") ||
    n.includes("moderate delay")
  ) {
    return "yellow";
  }
  if (n.includes("سالك") || n.includes("clear") || n === "green" || n === "open" || n.includes("سليم")) {
    return "green";
  }
  if (n === "low") {
    return "green";
  }
  if (n === "medium") {
    return "yellow";
  }
  if (n === "high") {
    return "red";
  }
  return "unknown";
}

function coerceFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, "").trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function CheckpointMatchGeometry({
  checkpoint,
  na,
  t,
  formatDistanceLabel,
  formatNumberLabel,
  formatCoordinatePair,
  formatMatchConfidence,
}: {
  checkpoint: RoutingCheckpoint;
  na: string;
  t: (key: string, values?: Record<string, string>) => string;
  formatDistanceLabel: (value: number | null) => string;
  formatNumberLabel: (value: number | null, mode?: "decimal2" | "int") => string;
  formatCoordinatePair: (lat: number, lng: number) => string;
  formatMatchConfidence: (value: string | null) => string;
}) {
  return (
    <details className="mt-2 rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2">
      <summary className="mashwar-arabic cursor-pointer list-none text-[11px] font-semibold text-[var(--clr-green-soft)] marker:content-none [&::-webkit-details-marker]:hidden">
        {t("openMatchGeometry")}
      </summary>
      <div className="mt-2 grid gap-1.5 text-[11px] text-[var(--clr-slate)] sm:grid-cols-2">
        <p className="mashwar-arabic">
          {t("distanceFromRoute", { value: formatDistanceLabel(checkpoint.distanceFromRouteM) })}
        </p>
        <p className="mashwar-arabic">
          {t("matchConfidence", { value: formatMatchConfidence(checkpoint.matchConfidence) })}
        </p>
        <p className="mashwar-arabic">{t("projectionT", { value: formatNumberLabel(checkpoint.projectionT) })}</p>
        <p className="mashwar-arabic">{t("nearestSegment", { value: formatNumberLabel(checkpoint.nearestSegmentIndex, "int") })}</p>
        <p className="mashwar-arabic">{t("chainage", { value: formatNumberLabel(checkpoint.chainageM) })}</p>
        <p className="mashwar-arabic">
          {t("projectedPoint", {
            value: checkpoint.projectedPointOnRoute
              ? formatCoordinatePair(checkpoint.projectedPointOnRoute[1], checkpoint.projectedPointOnRoute[0])
              : na,
          })}
        </p>
      </div>
    </details>
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
  const locale = useLocale();
  const t = useTranslations("routeDetails");
  const tCommon = useTranslations("common");
  const tMap = useTranslations("map");
  const tRisk = useTranslations("routing.risk");
  const tBucket = useTranslations("routing.bucket");
  const tDirection = useTranslations("routing.direction");
  const tSelectedStatus = useTranslations("routing.selectedStatus");
  const tMatchConfidence = useTranslations("routing.matchConfidence");
  const tTradeoff = useTranslations("tradeoff");

  const primaryDir: "rtl" | "ltr" = locale === "ar" ? "rtl" : "ltr";

  function formatViabilityLabel(v: RoutePath["routeViability"]): string {
    if (v === "good" || v === "risky" || v === "avoid") {
      return tTradeoff(`viability.${v}`);
    }
    return tTradeoff("viability.unknown");
  }

  function formatRouteDirection(value: string | null): string {
    if (!value) {
      return tDirection("unknown");
    }
    const norm = value.trim().toLowerCase();
    if (norm === "unknown") {
      return tDirection("unknown");
    }
    switch (norm) {
      case "entering":
      case "leaving":
      case "transit":
        return tDirection(norm);
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

  if (!route) {
    return null;
  }

  const isVisible = open && route;
  const na = tCommon("notAvailable");
  const numberLocale = locale === "ar" ? "ar-PS" : "en-US";

  function formatMax2(n: number): string {
    return new Intl.NumberFormat(numberLocale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  }

  function formatRiskFactorLine(component: string): string {
    const trimmed = component.trim();
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      return trimmed;
    }
    const rawKey = trimmed.slice(0, colonIdx).trim();
    const rawVal = trimmed.slice(colonIdx + 1).trim();
    const num = Number.parseFloat(rawVal.replace(/,/g, ""));
    const valueStr = Number.isFinite(num) ? formatMax2(num) : rawVal;
    const normKey = rawKey.toLowerCase().replace(/\s+/g, "_");
    if (!ROUTE_RISK_FACTOR_KEYS.has(normKey)) {
      return t("riskFactor.fallback", { key: rawKey, value: valueStr });
    }
    let label: string;
    switch (normKey) {
      case "volatility_ratio":
        label = t("riskFactor.volatility_ratio");
        break;
      case "confidence_penalty":
        label = t("riskFactor.confidence_penalty");
        break;
      case "severity_ratio":
        label = t("riskFactor.severity_ratio");
        break;
      case "checkpoint_burden":
        label = t("riskFactor.checkpoint_burden");
        break;
      case "average_forecast_confidence":
        label = t("riskFactor.average_forecast_confidence");
        break;
      default:
        label = rawKey;
    }
    return `${label} — ${valueStr}`;
  }

  function unifiedCheckpointSideLabel(checkpoint: RoutingCheckpoint): string {
    const rd = checkpoint.routeDirection;
    const stRaw = checkpoint.selectedStatusType;
    const st = typeof stRaw === "string" ? stRaw.trim().toLowerCase() : null;

    // This row asks "داخل ولا طالع" — never مارّ (transit); ambiguous API "transit" is resolved below.
    if (rd === "entering" || rd === "leaving") {
      return formatRouteDirection(rd);
    }

    if (st === "entering" || st === "leaving") {
      return formatRouteDirection(st);
    }

    const enterB = rawTrafficTextToBucket(checkpoint.currentStatusRaw?.entering_status);
    const leaveB = rawTrafficTextToBucket(checkpoint.currentStatusRaw?.leaving_status);
    const rankEnter = bucketRankForInference(enterB);
    const rankLeave = bucketRankForInference(leaveB);

    if (rankEnter > rankLeave) {
      return formatRouteDirection("entering");
    }
    if (rankLeave > rankEnter) {
      return formatRouteDirection("leaving");
    }

    // Same bucket both sides (e.g. both سالك): still pick داخل or طالع — default approach side.
    if (enterB !== "unknown" && enterB === leaveB) {
      return formatRouteDirection("entering");
    }

    if (rd === "transit") {
      return formatRouteDirection("entering");
    }

    return formatRouteDirection("unknown");
  }

  function formatForecastSourceDisplay(raw: string | null): string {
    if (!raw?.trim()) {
      return na;
    }
    const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
    switch (key) {
      case "model":
        return t("forecastSourceValue.model");
      case "live":
        return t("forecastSourceValue.live");
      default:
        return t("forecastSourceValue.fallback", { value: raw.trim() });
    }
  }

  function formatRatioZeroOne(n: number): string {
    return new Intl.NumberFormat(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Math.min(1, Math.max(0, n)),
    );
  }

  function formatRouteDistance(distanceM: number): string {
    if (!Number.isFinite(distanceM) || distanceM <= 0) {
      return tMap("distanceZero");
    }

    if (distanceM >= 1000) {
      const km = distanceM / 1000;
      return tCommon("unitKm", {
        value: formatMax2(km),
      });
    }

    return tCommon("unitM", { value: String(Math.round(distanceM)) });
  }

  function formatDurationLabel(durationMs: number | null): string {
    if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) {
      return tCommon("notAvailable");
    }

    const totalMinutes = Math.round(durationMs / 60000);
    if (totalMinutes >= 60) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return minutes > 0
        ? tCommon("durationHM", { hours: String(hours), minutes: String(minutes) })
        : tCommon("durationH", { hours: String(hours) });
    }

    return tCommon("durationMin", { minutes: String(Math.max(1, totalMinutes)) });
  }

  function formatCoordinatePair(lat: number, lng: number): string {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return tCommon("notAvailable");
    }

    return `${formatMax2(lat)} · ${formatMax2(lng)}`;
  }

  function formatConfidence(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return tCommon("notAvailable");
    }

    return tCommon("percent", { value: String(Math.round(value * 100)) });
  }

  function formatPercent(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return tCommon("notAvailable");
    }

    return tCommon("percent", { value: String(Math.round(value * 100)) });
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

  function formatNumberLabel(value: number | null, mode: "decimal2" | "int" = "decimal2"): string {
    if (value === null || !Number.isFinite(value)) {
      return tCommon("notAvailable");
    }

    if (mode === "int") {
      return String(Math.round(value));
    }

    return formatMax2(value);
  }

  function formatDistanceLabel(value: number | null): string {
    if (value === null || !Number.isFinite(value) || value < 0) {
      return tCommon("notAvailable");
    }

    if (value >= 1000) {
      return tCommon("unitKm", {
        value: formatMax2(value / 1000),
      });
    }

    return tCommon("unitM", { value: String(Math.round(value)) });
  }

  function formatDateTimeLabel(value: string | null): string {
    return formatDateTimeInPalestine(value);
  }

  function getRouteDelayLabel(r: RoutePath): string {
    const delayMinutes = r.expectedDelayMinutes ?? r.estimatedDelayMinutes;
    if (delayMinutes === null || !Number.isFinite(delayMinutes) || delayMinutes <= 0) {
      return t("delayNoPrediction");
    }

    return t("delayExpected", { minutes: String(Math.max(1, Math.round(delayMinutes))) });
  }

  function getRouteEtaBreakdownLabel(r: RoutePath): string {
    const delayMinutes = r.expectedDelayMinutes ?? r.estimatedDelayMinutes;

    if (delayMinutes !== null && Number.isFinite(delayMinutes) && delayMinutes > 0) {
      return t("etaBreakdownBaseDelay");
    }

    return r.smartEtaDateTime ? t("etaBreakdownSmart") : t("etaBreakdownLegacy");
  }

  function getRouteScoreLabel(r: RoutePath): string {
    if (r.riskScore !== null && Number.isFinite(r.riskScore)) {
      return t("riskScoreShort", { score: formatMax2(r.riskScore) });
    }

    if (Number.isFinite(r.routeScore)) {
      return t("routingScoreShort", { score: formatMax2(r.routeScore) });
    }

    return t("riskScoreNa");
  }

  const riskLevel = normalizeRiskLevel(route);
  const riskStyles = RISK_STYLES[riskLevel];
  const worstBucket = route.worstPredictedStatus;
  const routeSmartEta = getRouteSmartEta(route, departAt);
  const isV5Route = routeVersion === "v5";
  const orderedCheckpoints = [...route.checkpoints].sort((left, right) => {
    const leftEta = left.effectiveEtaMs ?? left.etaMs;
    const rightEta = right.effectiveEtaMs ?? right.etaMs;
    return leftEta - rightEta;
  });
  const routeConfidence =
    route.riskConfidence !== null && Number.isFinite(route.riskConfidence) ? route.riskConfidence : null;
  const routeConfidencePct = routeConfidence !== null ? routeConfidence * 100 : null;

  const plannedDepartLabel =
    departAt && !Number.isNaN(new Date(departAt).getTime())
      ? formatDateTimeInPalestine(departAt)
      : t("plannedDepartNa");

  return (
    <div className="fixed inset-0" style={{ zIndex: ROUTE_DETAILS_Z_INDEX }} aria-hidden={!isVisible}>
      <button
        type="button"
        aria-label={t("closeBackdropAria")}
        className={`absolute inset-0 bg-[var(--clr-black)]/70 backdrop-blur-[var(--glass-blur)] transition-opacity duration-300 ease-out ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-details-title"
        className={`relative z-10 mx-auto flex max-h-[min(92vh,880px)] w-[min(100vw-1.25rem,56rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border-mid)] bg-[var(--glass-bg-raised)] shadow-[var(--map-overlay-shadow)] transition-all duration-300 ease-out sm:mt-6 ${
          isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
        style={{ marginTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <header className="relative shrink-0 border-b border-[var(--glass-border)] px-4 pb-3 pt-3 sm:px-5 sm:pb-4 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <MutedKicker dir={primaryDir}>{t("scanKicker")}</MutedKicker>
              <h2
                id="route-details-title"
                className="mashwar-display mt-2 text-[clamp(1.4rem,3.2vw,1.85rem)] font-bold leading-tight text-[var(--clr-white)]"
                dir={primaryDir}
              >
                {t("heading", { rank: String(route.rank) })}
              </h2>
              <p className="mashwar-mono mt-1.5 break-all text-[10px] leading-snug text-[var(--clr-slate)]" dir="ltr">
                {t("routeId")}: {route.routeId}
              </p>
              {isV5Route ? (
                <p
                  className="mashwar-arabic mt-2 inline-flex rounded-full border border-[var(--clr-green)]/35 bg-[var(--clr-green-dim)] px-2.5 py-1 text-[10px] font-semibold text-[var(--clr-green-soft)]"
                  dir={primaryDir}
                >
                  {t("badgeV5")}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] text-[var(--clr-sand)] transition hover:border-[var(--clr-border-bright)] hover:text-[var(--clr-white)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--clr-green)]/40"
              aria-label={t("closeAria")}
            >
              <span className="text-xl leading-none" aria-hidden>
                ×
              </span>
            </button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-2 sm:px-5 sm:pb-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-5">
            <div className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[linear-gradient(145deg,rgba(0,98,51,0.12),transparent_42%),linear-gradient(210deg,rgba(196,31,41,0.08),transparent_38%)] px-4 py-4 sm:px-5 sm:py-5">
              <MutedKicker dir={primaryDir}>{t("arrivalLabel")}</MutedKicker>
              <p
                className="mashwar-display mt-2 text-[clamp(1.85rem,4.5vw,2.35rem)] font-bold tabular-nums tracking-tight text-[var(--clr-white)]"
                dir="ltr"
              >
                {routeSmartEta}
              </p>
              <div className="mt-4 border-t border-[var(--glass-border)] pt-4">
                <MutedKicker dir={primaryDir}>{t("delayLabel")}</MutedKicker>
                <p className="mashwar-arabic mt-1 text-[15px] font-semibold text-[var(--clr-sand)]" dir={primaryDir}>
                  {getRouteDelayLabel(route)}
                </p>
                <MutedKicker dir={primaryDir}>{t("etaHint")}</MutedKicker>
                <p className="mashwar-arabic mt-1 text-[12px] leading-relaxed text-[var(--clr-slate)]" dir={primaryDir}>
                  {getRouteEtaBreakdownLabel(route)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <StatTile
                kicker={t("statAdjustedDuration")}
                value={formatDurationLabel(route.smartEtaMs ?? route.durationMs)}
                hint={t("effectiveEtaHelp")}
                dir={primaryDir}
              />
              <StatTile
                kicker={t("statBaseDuration")}
                value={formatDurationLabel(route.durationMs)}
                hint={t("baseEtaHelp")}
                dir={primaryDir}
              />
              <StatTile kicker={t("statDistance")} value={formatRouteDistance(route.distanceM)} dir={primaryDir} />
              <StatTile kicker={t("statCheckpoints")} value={String(route.checkpointCount)} dir={primaryDir} />
              <StatTile kicker={t("statViability")} value={formatViabilityLabel(route.routeViability)} dir={primaryDir} />
              <StatTile
                kicker={t("statRouteScore")}
                value={formatMax2(route.routeScore)}
                hint={getRouteScoreLabel(route)}
                dir={primaryDir}
              />
              {route.historicalVolatility !== null ? (
                <StatTile kicker={t("statVolatility")} value={formatMax2(route.historicalVolatility)} dir={primaryDir} />
              ) : (
                <StatTile kicker={t("statVolatility")} value={na} dir={primaryDir} />
              )}
              <StatTile
                kicker={t("statDelayMs")}
                value={
                  route.expectedDelayMs !== null &&
                  Number.isFinite(route.expectedDelayMs) &&
                  route.expectedDelayMs > 0
                    ? formatDurationLabel(route.expectedDelayMs)
                    : na
                }
                dir={primaryDir}
              />
              <StatTile kicker={t("plannedDepart")} value={plannedDepartLabel} dir={primaryDir} />
              <StatTile kicker={t("originalOrderLabel")} value={String(route.originalIndex + 1)} dir={primaryDir} />
              <StatTile kicker={t("statDurationMinutes")} value={String(route.durationMinutes)} dir={primaryDir} />
              {(() => {
                const smartMin = coerceFiniteNumber(route.smartEtaMinutes);
                return smartMin !== null ? (
                  <StatTile kicker={t("statSmartEtaMinutes")} value={formatMax2(smartMin)} dir={primaryDir} />
                ) : null;
              })()}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <div
              className="inline-flex min-w-0 max-w-full flex-col gap-1 rounded-[var(--radius-md)] border px-3 py-2"
              style={{
                borderColor: BUCKET_STYLES[worstBucket].border,
                backgroundColor: BUCKET_STYLES[worstBucket].bg,
              }}
            >
              <MutedKicker dir={primaryDir}>{t("chipWorst")}</MutedKicker>
              <span className="mashwar-arabic text-[14px] font-bold" style={{ color: BUCKET_STYLES[worstBucket].text }}>
                {tBucket(worstBucket)}
              </span>
            </div>
            <div
              className="inline-flex min-w-0 max-w-full flex-col gap-1 rounded-[var(--radius-md)] border px-3 py-2"
              style={{
                borderColor: riskStyles.border,
                backgroundColor: riskStyles.bg,
              }}
            >
              <MutedKicker dir={primaryDir}>{t("chipRisk")}</MutedKicker>
              <span className="mashwar-arabic text-[14px] font-bold" style={{ color: riskStyles.text }}>
                {tRisk(riskLevel)}
              </span>
            </div>
          </div>

          {routeConfidencePct !== null ? (
            <div className="mt-3">
              <MutedKicker dir={primaryDir}>
                {t("confidenceShort", { value: formatConfidence(routeConfidence) })}
              </MutedKicker>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--clr-night)]">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(6, routeConfidencePct))}%`,
                    backgroundColor: riskStyles.text,
                  }}
                />
              </div>
            </div>
          ) : null}

          {route.riskComponents.length > 0 ? (
            <div className="mt-3">
              <MutedKicker dir={primaryDir}>{t("riskDrivers")}</MutedKicker>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {route.riskComponents.map((component) => (
                  <span
                    key={component}
                    className="mashwar-arabic max-w-full rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] px-2.5 py-1 text-[11px] leading-snug text-[var(--clr-sand)]"
                    dir="auto"
                  >
                    {formatRiskFactorLine(component)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {route.reasonSummary ? (
            <p className="mashwar-arabic mt-4 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--clr-sand)]">
              {route.reasonSummary}
            </p>
          ) : (
            <p className="mashwar-arabic mt-4 text-[12px] text-[var(--clr-slate)]" dir={primaryDir}>
              {t("noSummary")}
            </p>
          )}

          <div className="mt-6">
            <MutedKicker dir={primaryDir}>{t("checkpointsHeading")}</MutedKicker>
            {orderedCheckpoints.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {orderedCheckpoints.map((checkpoint, index) => {
                  const baseEtaMs = checkpoint.baseEtaMs ?? checkpoint.etaMs;
                  const effectiveEtaMs = checkpoint.effectiveEtaMs ?? checkpoint.etaMs;
                  const checkpointDelayMs =
                    checkpoint.expectedDelayMs ?? Math.max(0, effectiveEtaMs - baseEtaMs);
                  const hasDelay = checkpointDelayMs > 0;
                  const carriedMs = checkpoint.cumulativeDelayMsBeforeCheckpoint;
                  const probabilityEntries = getProbabilityEntries(checkpoint.forecastProbabilities);
                  const totalProbability = probabilityEntries.reduce((sum, entry) => sum + entry.value, 0);

                  return (
                    <li
                      key={checkpoint.checkpointId}
                      className={`rounded-[var(--radius-md)] border px-3 py-3 sm:px-4 sm:py-3.5 ${
                        hasDelay ? "border-[var(--risk-med)]/40 bg-[var(--risk-med-bg)]" : "border-[var(--glass-border)] bg-[var(--glass-bg-mid)]"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="mashwar-arabic text-[10px] font-semibold text-[var(--clr-slate)]" dir={primaryDir}>
                            {t("cpIndex", { index: String(index + 1) })}
                          </p>
                          <p className="mashwar-arabic text-[16px] font-bold leading-snug text-[var(--clr-white)]" dir={primaryDir}>
                            {checkpoint.name}
                          </p>
                          <p className="mashwar-arabic text-[11px] text-[var(--clr-slate)]" dir={primaryDir}>
                            {checkpoint.city ?? na}
                            {checkpoint.checkpointCityGroup ? t("rawGroup", { group: checkpoint.checkpointCityGroup }) : ""}
                          </p>
                          <p className="mashwar-mono mt-1 break-all text-[9px] text-[var(--clr-slate)]" dir="ltr">
                            {checkpoint.checkpointId}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5 text-end">
                          <MutedKicker dir={primaryDir}>{t("cpCrossingApprox")}</MutedKicker>
                          <p className="mashwar-arabic text-[15px] font-semibold tabular-nums text-[var(--clr-white)]" dir="ltr">
                            {formatDateTimeLabel(checkpoint.crossingDateTime)}
                          </p>
                          <p className="mashwar-arabic text-[11px] text-[var(--clr-slate)]" dir={primaryDir}>
                            {t("cpEtaDeparture")}: {formatDurationLabel(checkpoint.etaMs)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <div className="flex flex-col gap-1">
                          <MutedKicker dir={primaryDir}>{t("cpNow")}</MutedKicker>
                          <StatusPill bucket={checkpoint.currentStatus}>{tBucket(checkpoint.currentStatus)}</StatusPill>
                        </div>
                        <span className="text-[var(--clr-slate)]" aria-hidden>
                          →
                        </span>
                        <div className="flex flex-col gap-1">
                          <MutedKicker dir={primaryDir}>{t("cpAtArrival")}</MutedKicker>
                          <StatusPill bucket={checkpoint.predictedStatusAtEta}>
                            {tBucket(checkpoint.predictedStatusAtEta)}
                          </StatusPill>
                        </div>
                      </div>

                      <p className="mashwar-arabic mt-2 text-[12px] text-[var(--clr-sand)]" dir={primaryDir}>
                        {hasDelay
                          ? t("cpDelay", { duration: formatDurationLabel(checkpointDelayMs) })
                          : t("cpNoDelay")}
                      </p>

                      <div className="mt-3">
                        <MutedKicker dir={primaryDir}>{t("cpSectionTiming")}</MutedKicker>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          <StatTile kicker={t("baseEta")} value={formatDurationLabel(baseEtaMs)} hint={t("baseEtaHelp")} dir={primaryDir} />
                          <StatTile
                            kicker={t("effectiveEta")}
                            value={formatDurationLabel(effectiveEtaMs)}
                            hint={t("effectiveEtaHelp")}
                            dir={primaryDir}
                          />
                          <StatTile kicker={t("expectedDelay")} value={formatDurationLabel(checkpointDelayMs)} dir={primaryDir} />
                        </div>
                      </div>

                      <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-1 sm:px-4">
                        <MutedKicker dir={primaryDir}>{t("cpSectionDetails")}</MutedKicker>
                        <div className="divide-y divide-[var(--glass-border)]/70">
                          <InfoRow label={t("cpUnifiedSideLabel")} value={unifiedCheckpointSideLabel(checkpoint)} dir={primaryDir} />
                          <InfoRow
                            label={t("cpMatchQualityLabel")}
                            value={formatMatchConfidence(checkpoint.matchConfidence)}
                            dir={primaryDir}
                          />
                          <InfoRow
                            label={t("cpCarriedDelay")}
                            value={
                              carriedMs !== null && Number.isFinite(carriedMs) && carriedMs > 0
                                ? formatDurationLabel(carriedMs)
                                : t("noPropagatedDelay")
                            }
                            dir={primaryDir}
                          />
                          <InfoRow
                            label={t("cpForecastSourceLabel")}
                            value={formatForecastSourceDisplay(checkpoint.forecastSource)}
                            dir={primaryDir}
                          />
                          <InfoRow
                            label={t("cpForecastConfidenceLabel")}
                            value={formatConfidence(checkpoint.forecastConfidence)}
                            dir={primaryDir}
                          />
                          <InfoRow
                            label={t("cpForecastModel")}
                            value={
                              checkpoint.forecastModelVersion !== null &&
                              Number.isFinite(checkpoint.forecastModelVersion)
                                ? String(Math.round(checkpoint.forecastModelVersion))
                                : na
                            }
                            dir={primaryDir}
                          />
                          <InfoRow label={t("cpCoords")} value={formatCoordinatePair(checkpoint.lat, checkpoint.lng)} dir={primaryDir} />
                          {checkpoint.severityRatio !== null && Number.isFinite(checkpoint.severityRatio) ? (
                            <InfoRow label={t("severityRatioLabel")} value={formatRatioZeroOne(checkpoint.severityRatio)} dir={primaryDir} />
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-1 sm:px-4">
                        <MutedKicker dir={primaryDir}>{t("cpSectionRawStatus")}</MutedKicker>
                        <div className="divide-y divide-[var(--glass-border)]/70">
                          <InfoRow
                            label={t("cpRawEnteringLabel")}
                            value={checkpoint.currentStatusRaw?.entering_status ?? na}
                            dir={primaryDir}
                          />
                          <InfoRow
                            label={t("cpRawLeavingLabel")}
                            value={checkpoint.currentStatusRaw?.leaving_status ?? na}
                            dir={primaryDir}
                          />
                        </div>
                      </div>

                      {checkpoint.forecastReason ? (
                        <p className="mashwar-arabic mt-2 rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-2 text-[12px] leading-relaxed text-[var(--clr-sand)]">
                          <span className="font-semibold text-[var(--clr-white)]">{t("forecastReasonLabel")}: </span>
                          {checkpoint.forecastReason}
                        </p>
                      ) : null}

                      {probabilityEntries.length > 0 ? (
                        <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-2">
                          <MutedKicker dir={primaryDir}>{t("probabilityBreakdown")}</MutedKicker>
                          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[var(--clr-night)]">
                            {probabilityEntries.map((entry) => (
                              <div
                                key={entry.label}
                                className="h-full"
                                style={{
                                  width: `${totalProbability > 0 ? Math.max(5, (entry.value / totalProbability) * 100) : 0}%`,
                                  backgroundColor: probabilityBarColor(entry.label),
                                }}
                              />
                            ))}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {probabilityEntries.map((entry) => (
                              <span
                                key={entry.label}
                                className="mashwar-arabic rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] px-2 py-0.5 text-[10px] text-[var(--clr-sand)]"
                              >
                                {formatProbabilityLabel(entry.label, tBucket, t("probabilityLabelUnknown"))}{" "}
                                {formatPercent(entry.value)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <CheckpointMatchGeometry
                        checkpoint={checkpoint}
                        na={na}
                        t={t}
                        formatDistanceLabel={formatDistanceLabel}
                        formatNumberLabel={formatNumberLabel}
                        formatCoordinatePair={formatCoordinatePair}
                        formatMatchConfidence={formatMatchConfidence}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mashwar-arabic mt-2 text-[12px] text-[var(--clr-slate)]">{t("noForecastDetails")}</p>
            )}
          </div>

          <details className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2">
            <summary className="mashwar-arabic cursor-pointer list-none font-semibold text-[var(--clr-sand)] [&::-webkit-details-marker]:hidden">
              {t("technicalSection")}
              <span className="mt-0.5 block text-[10px] font-normal text-[var(--clr-slate)]" dir={primaryDir}>
                {t("technicalSectionSub")}
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              {checkpointMatching ? (
                <div className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] px-3 py-2">
                  <p className="mashwar-mono text-[9px] uppercase tracking-[0.16em] text-[var(--clr-slate)]">{t("matchingMeta")}</p>
                  <div className="mt-2 grid gap-1.5 text-[11px] text-[var(--clr-slate)]">
                    <p className="mashwar-arabic">{t("matchingField.mode", { value: checkpointMatching.mode ?? na })}</p>
                    <p className="mashwar-arabic">
                      {t("matchingField.directionMode", { value: checkpointMatching.directionMode ?? na })}
                    </p>
                    <p className="mashwar-arabic">{t("matchingField.citySource", { value: checkpointMatching.citySource ?? na })}</p>
                    <p className="mashwar-arabic">
                      {t("matchingField.cityInference", { value: checkpointMatching.cityInference ?? na })}
                    </p>
                    <p className="mashwar-arabic">
                      {t("matchingField.outerThreshold", { value: formatNumberLabel(checkpointMatching.outerThresholdM) })}
                    </p>
                    <p className="mashwar-arabic">
                      {t("matchingField.strongMatch", { value: formatNumberLabel(checkpointMatching.strongMatchDistanceM) })}
                    </p>
                    <p className="mashwar-arabic">
                      {t("matchingField.mediumMatch", { value: formatNumberLabel(checkpointMatching.mediumMatchDistanceM) })}
                    </p>
                    <p className="mashwar-arabic">
                      {t("matchingField.weakMatch", { value: formatNumberLabel(checkpointMatching.weakMatchDistanceM) })}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mashwar-arabic text-[11px] text-[var(--clr-slate)]">{tCommon("notAvailable")}</p>
              )}
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
