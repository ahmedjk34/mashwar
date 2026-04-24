"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import MapView from "@/components/map/MapView";
import LocationSyncIcon from "@/components/map/LocationSyncIcon";
import MashwarNaturalLanguageRouteModal from "@/components/map/MashwarNaturalLanguageRouteModal";
import RouteDetailsModal from "@/components/map/RouteDetailsModal";
import TradeoffExplainerModal from "@/components/map/TradeoffExplainerModal";
import { buildCorridorSegments } from "@/lib/heatmap/corridorSegments";
import { normalizeCheckpointId } from "@/lib/heatmap/normalizeCheckpoint";
import {
  DEMO_ROUTE_REQUEST,
  hasValidCoordinates,
  getRenderableRoutes,
  getWorstStatus,
} from "@/lib/config/map";
import { getCheckpoints } from "@/lib/services/checkpoints";
import { getCheckpointForecast } from "@/lib/services/forecast";
import {
  createEmptyHeatmapBuildProgress,
  fetchHeatmapCache,
  mergeHeatmapProgress,
  streamHeatmapNetwork,
} from "@/lib/services/heatmap";
import { getRoute } from "@/lib/services/routing";
import { formatDateTimeInPalestine } from "@/lib/utils/palestine-time";
import type {
  HeatmapBuildProgress,
  HeatmapCorridorFeature,
  HeatmapSegmentFeatureCollection,
} from "@/lib/types/heatmap";
import type {
  CheckpointForecastStatusType,
  MapCheckpoint,
  MapCheckpointStatus,
  NormalizedCheckpointForecast,
  NormalizedCheckpointTravelWindow,
  NormalizedCheckpointTravelWindowItem,
  NormalizedRoutes,
  RoutePoint,
  UserLocation,
} from "@/lib/types/map";

const EMPTY_ROUTES: NormalizedRoutes = {
  generatedAt: null,
  version: null,
  checkpointMatching: null,
  origin: null,
  destination: null,
  departAt: null,
  warnings: [],
  graphhopperInfo: null,
  routes: [],
  selectedRouteId: null,
  mainRoute: null,
  alternativeRoutes: [],
  tradeoffExplainer: null,
};

const FORECAST_HORIZON_ORDER = [
  "plus_30m",
  "plus_1h",
  "plus_2h",
  "next_day_8am",
] as const;

type ForecastDirection = "entering" | "leaving";

interface ForecastRow {
  horizon: string;
  targetDateTime: string | null;
  entering: NormalizedCheckpointForecast["predictions"]["entering"][number] | null;
  leaving: NormalizedCheckpointForecast["predictions"]["leaving"][number] | null;
}

const STATUS_VISUALS: Record<
  MapCheckpointStatus,
  {
    ar: string;
    en: string;
    dot: string;
    border: string;
    bg: string;
    text: string;
    softBg: string;
  }
> = {
  سالك: {
    ar: "سالك",
    en: "OPEN",
    dot: "var(--risk-low)",
    border: "var(--risk-low)",
    bg: "var(--risk-low-bg)",
    text: "var(--clr-green-soft)",
    softBg: "var(--risk-low-bg)",
  },
  "أزمة متوسطة": {
    ar: "أزمة متوسطة",
    en: "SLOW",
    dot: "var(--risk-med)",
    border: "var(--risk-med)",
    bg: "var(--risk-med-bg)",
    text: "var(--risk-med)",
    softBg: "var(--risk-med-bg)",
  },
  "أزمة خانقة": {
    ar: "أزمة خانقة",
    en: "HEAVY",
    dot: "var(--risk-high)",
    border: "var(--risk-high)",
    bg: "var(--risk-high-bg)",
    text: "var(--clr-white)",
    softBg: "var(--risk-high-bg)",
  },
  مغلق: {
    ar: "مغلق",
    en: "CLOSED",
    dot: "var(--risk-high)",
    border: "var(--risk-high)",
    bg: "var(--risk-high-bg)",
    text: "var(--clr-white)",
    softBg: "var(--risk-high-bg)",
  },
  "غير معروف": {
    ar: "غير معروف",
    en: "UNKNOWN",
    dot: "var(--clr-slate)",
    border: "var(--glass-border-mid)",
    bg: "var(--glass-bg-mid)",
    text: "var(--clr-sand)",
    softBg: "var(--glass-bg-mid)",
  },
};

function formatDateTimeLabel(value: string | null): string {
  return formatDateTimeInPalestine(value);
}

function formatCoordinatePair(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "n/a";
  }

  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function getConfidenceTone(confidence: number | null): {
  color: string;
  label: string;
} {
  if (confidence === null) {
    return { color: "var(--clr-slate)", label: "n/a" };
  }

  if (confidence > 90) {
    return { color: "var(--clr-green-soft)", label: `${Math.round(confidence * 100)}%` };
  }

  if (confidence >= 80) {
    return { color: "var(--risk-low)", label: `${Math.round(confidence * 100)}%` };
  }

  return { color: "var(--risk-med)", label: `${Math.round(confidence * 100)}%` };
}

function formatForecastConfidence(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return `${Math.round(value * 100)}%`;
}

function formatForecastDateTime(value: string | null): string {
  if (!value) {
    return "Pending";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Hebron",
  }).formatToParts(parsed);

  const month = parts.find((part) => part.type === "month")?.value?.toUpperCase();
  const day = parts.find((part) => part.type === "day")?.value;
  const year = parts.find((part) => part.type === "year")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value;

  if (!month || !day || !year || !hour || !minute || !dayPeriod) {
    return value;
  }

  return `${month} ${day}, ${year}, ${hour}:${minute} ${dayPeriod}`;
}

function getForecastHorizonLabel(horizon: string): string {
  switch (horizon) {
    case "plus_30m":
      return "+30M";
    case "plus_1h":
      return "+1H";
    case "plus_2h":
      return "+2H";
    case "next_day_8am":
      return "NEXT DAY 08:00";
    default:
      return horizon.toUpperCase();
  }
}

function getDirectionalStatusLabel(direction: ForecastDirection): string {
  return direction === "entering" ? "ENTERING" : "LEAVING";
}

function buildForecastRows(
  forecast: NormalizedCheckpointForecast | null,
): ForecastRow[] {
  if (!forecast) {
    return [];
  }

  const rows = new Map<string, ForecastRow>();

  const addItem = (
    direction: ForecastDirection,
    item: NormalizedCheckpointForecast["predictions"][ForecastDirection][number],
  ) => {
    const key = item.horizon;
    const existing = rows.get(key) ?? {
      horizon: key,
      targetDateTime: item.targetDateTime,
      entering: null,
      leaving: null,
    };

    existing[direction] = item;
    if (!existing.targetDateTime && item.targetDateTime) {
      existing.targetDateTime = item.targetDateTime;
    }

    rows.set(key, existing);
  };

  for (const item of forecast.predictions.entering) {
    addItem("entering", item);
  }

  for (const item of forecast.predictions.leaving) {
    addItem("leaving", item);
  }

  const orderedKeys = [
    ...FORECAST_HORIZON_ORDER.filter((key) => rows.has(key)),
    ...Array.from(rows.keys()).filter(
      (key) => !FORECAST_HORIZON_ORDER.includes(key as (typeof FORECAST_HORIZON_ORDER)[number]),
    ),
  ];

  return orderedKeys.map((key) => rows.get(key) as ForecastRow);
}

function formatTravelWindowHour(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${`${Math.trunc(value)}`.padStart(2, "0")}:00`;
}

function buildTravelWindowEntries(
  travelWindow: NormalizedCheckpointTravelWindow | null,
): Array<{
  kind: "best" | "worst";
  label: string;
  item: NormalizedCheckpointTravelWindowItem;
}> {
  if (!travelWindow) {
    return [];
  }

  const entries: Array<{
    kind: "best" | "worst";
    label: string;
    item: NormalizedCheckpointTravelWindowItem;
  }> = [];

  if (travelWindow.best) {
    entries.push({
      kind: "best",
      label: "Best time to cross",
      item: travelWindow.best,
    });
  }

  if (travelWindow.worst) {
    entries.push({
      kind: "worst",
      label: "Worst time to cross",
      item: travelWindow.worst,
    });
  }

  return entries;
}

function replaceCheckpointInCollection(
  checkpoints: MapCheckpoint[],
  nextCheckpoint: MapCheckpoint,
): MapCheckpoint[] {
  let replaced = false;
  const nextCheckpoints = checkpoints.map((checkpoint) => {
    if (checkpoint.id !== nextCheckpoint.id) {
      return checkpoint;
    }

    replaced = true;
    return nextCheckpoint;
  });

  return replaced ? nextCheckpoints : [...nextCheckpoints, nextCheckpoint];
}

function formatSelectionLabel(
  selection:
    | { kind: "current-location" }
    | { kind: "checkpoint"; checkpointId: string }
    | { kind: "map-point"; lat: number; lng: number }
    | null,
  checkpointsById: Map<string, MapCheckpoint>,
  userLocation: UserLocation | null,
): string {
  if (!selection) {
    return "غير محدد";
  }

  if (selection.kind === "current-location") {
    return userLocation ? "الحالي" : "غير محدد";
  }

  if (selection.kind === "map-point") {
    return "مثبت على الخريطة";
  }

  const checkpoint = checkpointsById.get(selection.checkpointId);
  if (!checkpoint) {
    return "غير محدد";
  }

  return checkpoint.city ? `${checkpoint.name} · ${checkpoint.city}` : checkpoint.name;
}

function StatusPill({
  status,
  compact = false,
}: {
  status: MapCheckpointStatus;
  compact?: boolean;
}) {
  const visual = STATUS_VISUALS[status] ?? STATUS_VISUALS["غير معروف"];

  return (
    <span
      className={`mashwar-pill inline-flex items-center gap-[var(--space-2)] border ${compact ? "px-[10px] py-[3px]" : "px-[12px] py-[6px]"}`}
      style={{
        backgroundColor: visual.bg,
        color: visual.text,
        borderColor: visual.border,
      }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: visual.dot }} />
      <span className="mashwar-mono text-[10px] uppercase tracking-[0.18em]">
        {visual.ar}
      </span>
      <span className="text-[11px] font-semibold">{visual.en}</span>
    </span>
  );
}

function ConfidenceBadge({
  confidence,
  className = "",
}: {
  confidence: number | null;
  className?: string;
}) {
  const tone = getConfidenceTone(confidence);

  return (
    <span
      className={`mashwar-pill inline-flex items-center rounded-full px-3 py-1 ${className}`}
      style={{ color: tone.color, borderColor: "var(--glass-border)" }}
    >
      <span className="mashwar-mono text-[12px] font-semibold tracking-[0.08em]">
        {tone.label}
      </span>
    </span>
  );
}

function EndpointChip({
  label,
  value,
  helper,
  isActive,
  onClear,
  onActivate,
}: {
  label: string;
  value: string;
  helper?: string;
  isActive?: boolean;
  onClear: () => void;
  onActivate: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      dir="rtl"
      className={`glass-card relative px-3 py-2.5 transition-all duration-[var(--duration-base)] ease-out ${isActive ? "mashwar-card-raised" : ""}`}
      style={{
        borderColor: isActive ? "var(--clr-green-bright)" : "var(--glass-border)",
      }}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClear();
        }}
        className="mashwar-icon-button absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center border border-transparent text-[var(--clr-slate)]"
        aria-label={`Clear ${label}`}
      >
        <span className="text-[15px] leading-none">×</span>
      </button>
      <p className="mashwar-mono text-[10px] uppercase tracking-[0.26em] text-[var(--clr-slate)]">
        {label}
      </p>
      <div className="mashwar-arabic mt-2 min-h-[26px] pl-6 text-[15px] font-medium text-[var(--clr-white)]">
        {value || "غير محدد"}
      </div>
      {helper ? (
        <p className="mashwar-arabic mt-1 text-[10px] text-[var(--clr-green-soft)]">{helper}</p>
      ) : null}
    </div>
  );
}

function MapStatChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "amber";
}) {
  const toneClass =
    tone === "green"
      ? "text-[var(--risk-low)]"
      : tone === "amber"
        ? "text-[var(--risk-med)]"
        : "text-[var(--clr-sand)]";

  const dotColor =
    tone === "green"
      ? "var(--risk-low)"
      : tone === "amber"
        ? "var(--risk-med)"
        : "var(--clr-slate)";

  return (
    <span className="mashwar-pill inline-flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--clr-sand)]">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
      <span className={`mashwar-mono ${toneClass}`}>{value}</span>
      <span className="text-[var(--clr-slate)]">{label}</span>
    </span>
  );
}

function ForecastEntry({
  row,
}: {
  row: ForecastRow;
}) {
  const enteringTone = row.entering
    ? getConfidenceTone(row.entering.prediction.confidence)
    : null;
  const leavingTone = row.leaving
    ? getConfidenceTone(row.leaving.prediction.confidence)
    : null;
  const topLabel = row.entering && row.leaving ? "Both" : row.entering ? "Entering" : "Leaving";

  return (
    <article className="glass-card p-3 transition-all duration-[var(--duration-base)] ease-out hover:bg-[var(--glass-bg-raised)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="mashwar-pill px-2.5 py-1 text-[11px]"
              style={{
                color: "var(--clr-green-soft)",
                borderColor: "var(--clr-green-bright)",
                backgroundColor: "var(--clr-green-dim)",
              }}
            >
              <span className="mashwar-mono">{getForecastHorizonLabel(row.horizon)}</span>
            </span>
            <span className="mashwar-mono text-[10px] uppercase tracking-[0.18em] text-[var(--clr-slate)]">
              {formatForecastDateTime(row.targetDateTime)}
            </span>
          </div>
        </div>
        <span className="mashwar-mono text-[10px] uppercase tracking-[0.18em] text-[var(--clr-slate)]">
          {topLabel}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(["entering", "leaving"] as const).map((direction) => {
          const item = row[direction];
          const tone = direction === "entering" ? enteringTone : leavingTone;
          const visual = item ? STATUS_VISUALS[item.prediction.predictedStatus] : STATUS_VISUALS["غير معروف"];

          return (
            <div
              key={direction}
              className={`glass-card p-2.5 ${item ? "" : "opacity-55"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="mashwar-mono text-[9px] uppercase tracking-[0.18em] text-[var(--clr-slate)]">
                  {getDirectionalStatusLabel(direction)}
                </span>
                <StatusPill status={item?.prediction.predictedStatus ?? "غير معروف"} compact />
              </div>

              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className="mashwar-arabic text-[18px] font-bold"
                  style={{ color: item ? visual.text : "var(--clr-slate)" }}
                  dir="rtl"
                >
                  {item ? visual.ar : "—"}
                </span>
                <span
                  className="mashwar-mono text-[11px]"
                  style={{ color: tone?.color ?? "var(--clr-slate)" }}
                >
                  {item ? formatForecastConfidence(item.prediction.confidence) : "n/a"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function formatHeatmapProgressLabel(progress: HeatmapBuildProgress): string {
  if (progress.total <= 0) {
    return "0%";
  }

  return `${progress.percentage}%`;
}

function HeatmapToggle({
  enabled,
  loading,
  onToggle,
}: {
  enabled: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="glass-card flex w-full items-center justify-between gap-3 px-3 py-3 text-right transition-all duration-[var(--duration-base)] ease-out hover:bg-[var(--glass-bg-raised)]"
      style={{
        borderColor: enabled ? "var(--clr-green-bright)" : "var(--glass-border)",
        backgroundColor: enabled ? "var(--clr-green-dim)" : undefined,
      }}
    >
      <div className="min-w-0">
        <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[var(--clr-slate)]">
          UNCERTAINTY
        </p>
        <p dir="rtl" className="mashwar-arabic mt-1 text-[14px] font-semibold text-[var(--clr-white)]">
          عدم اليقين
        </p>
        <p className="mt-1 text-[11px] text-[var(--clr-slate)]">
          Uncertainty Network
        </p>
      </div>

      <span
        className="mashwar-pill inline-flex items-center gap-2 px-3 py-1 text-[11px]"
        style={{
          borderColor: enabled ? "var(--clr-green-bright)" : "var(--glass-border)",
          color: enabled ? "var(--clr-green-soft)" : "var(--clr-sand)",
          backgroundColor: enabled ? "rgba(34, 197, 94, 0.12)" : "var(--glass-bg-mid)",
        }}
      >
        {loading ? <span className="mashwar-live-dot" /> : null}
        <span className="mashwar-mono">{enabled ? "ON" : "OFF"}</span>
      </span>
    </button>
  );
}

function HeatmapLegendPanel({
  progress,
  isBuilding,
  isLoading,
  error,
  corridorCount,
}: {
  progress: HeatmapBuildProgress;
  isBuilding: boolean;
  isLoading: boolean;
  error: string | null;
  corridorCount: number;
}) {
  const progressWidth =
    progress.total > 0 ? `${Math.min(100, Math.max(0, progress.percentage))}%` : "0%";
  const statusLabel = error
    ? "تعذر تحميل شبكة عدم اليقين"
    : isBuilding
      ? "جاري بناء الشبكة..."
      : isLoading
        ? "جارٍ تحميل الشبكة..."
        : corridorCount > 0
          ? "تم بناء الشبكة"
          : "بانتظار البيانات";

  return (
    <section
      className="mashwar-panel p-[var(--panel-padding)]"
      style={{ animation: "mashwar-panel-in-left 220ms ease-out" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[var(--clr-slate)]">
            UNCERTAINTY NETWORK
          </p>
          <h3 dir="rtl" className="mashwar-arabic mashwar-display mt-2 text-[var(--text-md)] text-[var(--clr-white)]">
            شبكة عدم اليقين
          </h3>
          <p className="mt-2 text-[12px] text-[var(--clr-slate)]">
            Shows movement reliability between checkpoints
          </p>
          <p dir="rtl" className="mashwar-arabic mt-1 text-[12px] text-[var(--clr-slate)]">
            توضح مدى استقرار الحركة بين الحواجز
          </p>
        </div>

        <span className="mashwar-pill px-3 py-1 text-[11px]">
          <span className="mashwar-mono">{corridorCount}</span>
          <span>corridors</span>
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {[
          { labelAr: "مستقر", labelEn: "Stable", color: "#22c55e" },
          { labelAr: "متوسط", labelEn: "Uncertain", color: "#facc15" },
          { labelAr: "متقلب", labelEn: "Volatile", color: "#ef4444" },
        ].map((item) => (
          <div key={item.labelEn} className="glass-card flex items-center justify-between gap-3 px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span dir="rtl" className="mashwar-arabic text-[13px] text-[var(--clr-white)]">
                {item.labelAr}
              </span>
            </div>
            <span className="mashwar-mono text-[10px] uppercase tracking-[0.18em] text-[var(--clr-slate)]">
              {item.labelEn}
            </span>
          </div>
        ))}
      </div>

      <div className="glass-card mt-4 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p dir="rtl" className="mashwar-arabic text-[13px] text-[var(--clr-white)]">
              {statusLabel}
            </p>
            <p className="mt-1 text-[11px] text-[var(--clr-slate)]">
              {progress.completed} / {progress.total || "?"} corridors
            </p>
          </div>
          <span className="mashwar-pill px-3 py-1 text-[11px]">
            <span className="mashwar-mono">{formatHeatmapProgressLabel(progress)}</span>
          </span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: progressWidth,
              background:
                "linear-gradient(90deg, #22c55e 0%, #facc15 50%, #ef4444 100%)",
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="mashwar-pill px-3 py-1">
            built <span className="mashwar-mono">{progress.built}</span>
          </span>
          <span className="mashwar-pill px-3 py-1">
            skipped <span className="mashwar-mono">{progress.skipped}</span>
          </span>
          <span className="mashwar-pill px-3 py-1">
            failed <span className="mashwar-mono">{progress.failed}</span>
          </span>
        </div>

        {error ? (
          <p
            className="mt-3 rounded-[var(--radius-md)] border px-3 py-2 text-[12px] text-[var(--clr-white)]"
            style={{
              borderColor: "var(--risk-high)",
              backgroundColor: "var(--risk-high-bg)",
            }}
          >
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default function MashwarHome() {
  const [checkpoints, setCheckpoints] = useState<MapCheckpoint[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] =
    useState<MapCheckpoint | null>(null);
  const [selectedCheckpointForecast, setSelectedCheckpointForecast] =
    useState<NormalizedCheckpointForecast | null>(null);
  const [isNaturalRouteModalOpen, setIsNaturalRouteModalOpen] = useState(false);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [isForecastLoading, setIsForecastLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isSyncingLocation, setIsSyncingLocation] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isLoadingCheckpoints, setIsLoadingCheckpoints] = useState(true);
  const [routes, setRoutes] = useState<NormalizedRoutes>(EMPTY_ROUTES);
  const [routeDetailsRouteId, setRouteDetailsRouteId] = useState<string | null>(null);
  const [isRoutePending, startRouteTransition] = useTransition();
  const [checkpointReloadNonce, setCheckpointReloadNonce] = useState(0);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [corridorsRaw, setCorridorsRaw] = useState<HeatmapCorridorFeature[]>([]);
  const [corridorSegments, setCorridorSegments] =
    useState<HeatmapSegmentFeatureCollection>({
      type: "FeatureCollection",
      features: [],
    });
  const [isHeatmapLoading, setIsHeatmapLoading] = useState(false);
  const [isHeatmapBuilding, setIsHeatmapBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState<HeatmapBuildProgress>(
    createEmptyHeatmapBuildProgress(),
  );
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [routeFrom, setRouteFrom] = useState<
    | { kind: "current-location" }
    | { kind: "checkpoint"; checkpointId: string }
    | { kind: "map-point"; lat: number; lng: number }
    | null
  >(null);
  const [routeTo, setRouteTo] = useState<
    | { kind: "checkpoint"; checkpointId: string }
    | { kind: "map-point"; lat: number; lng: number }
    | null
  >(null);
  const [endpointPlacementMode, setEndpointPlacementMode] = useState<
    "from" | "to" | null
  >(null);
  const checkpointForecastRequestNonce = useRef(0);
  const selectedCheckpointIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCheckpoints(): Promise<void> {
      setIsLoadingCheckpoints(true);
      setCheckpointError(null);

      try {
        const nextCheckpoints = await getCheckpoints();
        if (!cancelled) {
          setCheckpoints(nextCheckpoints);
        }
      } catch (error) {
        if (!cancelled) {
          setCheckpointError(
            error instanceof Error
              ? error.message
              : "Unable to load checkpoint data.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCheckpoints(false);
        }
      }
    }

    void loadCheckpoints();
    return () => {
      cancelled = true;
    };
  }, [checkpointReloadNonce]);

  const mappableCheckpointCount = useMemo(() => {
    return checkpoints.filter(
      (checkpoint) =>
        typeof checkpoint.latitude === "number" &&
        typeof checkpoint.longitude === "number",
    ).length;
  }, [checkpoints]);

  const checkpointsWithoutCoordinates = useMemo(() => {
    return checkpoints.filter(
      (checkpoint) =>
        typeof checkpoint.latitude !== "number" ||
        typeof checkpoint.longitude !== "number",
    );
  }, [checkpoints]);

  const checkpointsById = useMemo(() => {
    return new Map(
      checkpoints.map((checkpoint) => [
        normalizeCheckpointId(checkpoint.id) ?? checkpoint.id,
        checkpoint,
      ]),
    );
  }, [checkpoints]);

  useEffect(() => {
    setCorridorSegments(buildCorridorSegments(corridorsRaw, checkpointsById));
  }, [corridorsRaw, checkpointsById]);

  const routePaths = useMemo(() => getRenderableRoutes(routes), [routes]);
  const routeDetailsRoute = useMemo(() => {
    if (!routeDetailsRouteId) {
      return null;
    }

    return (
      routePaths.find((route) => route.routeId === routeDetailsRouteId) ?? null
    );
  }, [routeDetailsRouteId, routePaths]);

  const selectedCheckpointStatus = selectedCheckpoint
    ? getWorstStatus(
        selectedCheckpoint.enteringStatus,
        selectedCheckpoint.leavingStatus,
      )
    : null;
  const forecastRows = useMemo(
    () => buildForecastRows(selectedCheckpointForecast),
    [selectedCheckpointForecast],
  );
  const travelWindow = selectedCheckpointForecast?.travelWindow ?? null;

  const selectedCheckpointStatusVisual = selectedCheckpointStatus
    ? STATUS_VISUALS[selectedCheckpointStatus]
    : STATUS_VISUALS["غير معروف"];
  const enteringVisual = selectedCheckpoint
    ? STATUS_VISUALS[selectedCheckpoint.enteringStatus]
    : STATUS_VISUALS["غير معروف"];
  const leavingVisual = selectedCheckpoint
    ? STATUS_VISUALS[selectedCheckpoint.leavingStatus]
    : STATUS_VISUALS["غير معروف"];
  const routeFromPoint =
    resolveRouteEndpointInfo(routeFrom, checkpointsById, userLocation)?.point ??
    null;
  const routeToPoint =
    resolveRouteEndpointInfo(routeTo, checkpointsById, userLocation)?.point ??
    null;

  const closeHeatmapStream = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const ensureHeatmapNetworkLoaded = useCallback(async () => {
    if (corridorsRaw.length > 0) {
      return;
    }

    if (eventSourceRef.current) {
      return;
    }

    setIsHeatmapLoading(true);
    setHeatmapError(null);

    try {
      const payload = await fetchHeatmapCache();

      if ("type" in payload) {
        setCorridorsRaw(payload.features);
        setBuildProgress((current) => {
          const next = createEmptyHeatmapBuildProgress();
          next.built = payload.features.length;
          next.completed = payload.features.length;
          next.total = payload.features.length;
          next.percentage = payload.features.length > 0 ? 100 : 0;
          next.cached = true;
          return current.total > next.total ? current : next;
        });
        setIsHeatmapBuilding(false);
        setIsHeatmapLoading(false);
        return;
      }

      setIsHeatmapBuilding(true);
      setBuildProgress(createEmptyHeatmapBuildProgress());

      const source = streamHeatmapNetwork({
        onStart: (event) => {
          setBuildProgress((current) => mergeHeatmapProgress(current, event));
          setIsHeatmapBuilding(!(event.cached ?? false));
        },
        onRouteBuilt: (corridor, event) => {
          setCorridorsRaw((current) => {
            if (current.some((item) => item.properties.id === corridor.properties.id)) {
              return current;
            }

            return [...current, corridor];
          });
          setBuildProgress((current) => {
            const merged = mergeHeatmapProgress(current, event);
            return {
              ...merged,
              built: Math.max(
                merged.built,
                current.built + (event.corridor ? 1 : 0),
              ),
            };
          });
        },
        onRouteSkipped: (event) => {
          setBuildProgress((current) => {
            const merged = mergeHeatmapProgress(current, event);
            return { ...merged, skipped: Math.max(merged.skipped, current.skipped + 1) };
          });
        },
        onRouteFailed: (event) => {
          setBuildProgress((current) => {
            const merged = mergeHeatmapProgress(current, event);
            return { ...merged, failed: Math.max(merged.failed, current.failed + 1) };
          });
        },
        onProgress: (event) => {
          setBuildProgress((current) => mergeHeatmapProgress(current, event));
        },
        onDone: (event) => {
          setBuildProgress((current) => mergeHeatmapProgress(current, event));
          setIsHeatmapLoading(false);
          setIsHeatmapBuilding(false);
          closeHeatmapStream();
        },
        onError: (message, event) => {
          if (event) {
            setBuildProgress((current) => mergeHeatmapProgress(current, event));
          }
          setHeatmapError(message);
          setIsHeatmapLoading(false);
          setIsHeatmapBuilding(false);
          closeHeatmapStream();
        },
      });

      eventSourceRef.current = source;
    } catch (error) {
      setHeatmapError(
        error instanceof Error ? error.message : "تعذر تحميل شبكة عدم اليقين",
      );
      setIsHeatmapBuilding(false);
      setIsHeatmapLoading(false);
      closeHeatmapStream();
    }
  }, [closeHeatmapStream, corridorsRaw.length]);

  useEffect(() => {
    return () => {
      closeHeatmapStream();
    };
  }, [closeHeatmapStream]);

  useEffect(() => {
    if (!heatmapEnabled) {
      return;
    }

    if (corridorsRaw.length > 0 || eventSourceRef.current) {
      return;
    }

    void ensureHeatmapNetworkLoaded();
  }, [corridorsRaw.length, ensureHeatmapNetworkLoaded, heatmapEnabled]);

  function handleLoadDemoRoute(): void {
    setRouteError(null);

    startRouteTransition(() => {
      void (async () => {
        try {
          const nextRoutes = await getRoute(DEMO_ROUTE_REQUEST);
          setRoutes(nextRoutes);
          setRouteDetailsRouteId(null);
        } catch (error) {
          setRouteError(
            error instanceof Error
              ? error.message
              : "Unable to load route data.",
          );
        }
      })();
    });
  }

  function handleClearRoute(): void {
    setRouteError(null);
    setRoutes(EMPTY_ROUTES);
    setRouteDetailsRouteId(null);
  }

  const handleSelectRoute = useCallback((routeId: string) => {
    setRoutes((current) => ({
      ...current,
      selectedRouteId: routeId,
    }));
  }, []);

  const handleOpenRouteDetails = useCallback(
    (routeId: string) => {
      handleSelectRoute(routeId);
      setRouteDetailsRouteId(routeId);
    },
    [handleSelectRoute],
  );

  const handleApplyNaturalLanguageRoute = useCallback(
    (resolution: {
      origin: { lat: number; lng: number };
      destination: { lat: number; lng: number };
      route: NormalizedRoutes;
    }) => {
      setRouteError(null);
      setRoutes(resolution.route);
      setRouteFrom({
        kind: "map-point",
        lat: resolution.origin.lat,
        lng: resolution.origin.lng,
      });
      setRouteTo({
        kind: "map-point",
        lat: resolution.destination.lat,
        lng: resolution.destination.lng,
      });
      setRouteDetailsRouteId(null);
      setEndpointPlacementMode(null);
      setIsNaturalRouteModalOpen(false);
    },
    [],
  );

  function handleRouteButtonClick(): void {
    if (routes.mainRoute) {
      handleClearRoute();
      return;
    }

    const resolvedFrom = resolveRouteEndpointInfo(
      routeFrom,
      checkpointsById,
      userLocation,
    );
    const resolvedTo = resolveRouteEndpointInfo(
      routeTo,
      checkpointsById,
      userLocation,
    );

    if (!resolvedFrom) {
      setRouteError(
        routeFrom?.kind === "current-location"
          ? "Sync your location first to route from the current position."
          : "Choose a valid origin checkpoint.",
      );
      return;
    }

    if (!resolvedTo) {
      setRouteError("Choose a valid destination checkpoint.");
      return;
    }

    if (
      resolvedFrom.point.lat === resolvedTo.point.lat &&
      resolvedFrom.point.lng === resolvedTo.point.lng
    ) {
      setRouteError("Choose two different endpoints for the route.");
      return;
    }

    setRouteError(null);

    startRouteTransition(() => {
      void (async () => {
        try {
          const nextRoutes = await getRoute({
            origin: resolvedFrom.point,
            destination: resolvedTo.point,
            ...(resolvedFrom.city ? { origin_city: resolvedFrom.city } : {}),
            ...(resolvedTo.city ? { destination_city: resolvedTo.city } : {}),
            profile: "car",
          });
          setRoutes(nextRoutes);
          setRouteDetailsRouteId(null);
        } catch (error) {
          setRouteError(
            error instanceof Error
              ? error.message
              : "Unable to load route data.",
          );
        }
      })();
    });
  }

  function handleRetryCheckpoints(): void {
    setCheckpointReloadNonce((current) => current + 1);
  }

  const handleToggleHeatmap = useCallback(() => {
    setHeatmapEnabled((current) => {
      const next = !current;

      if (next) {
        void ensureHeatmapNetworkLoaded();
      }

      return next;
    });
  }, [ensureHeatmapNetworkLoaded]);

  const handleSyncLocation = useCallback(() => {
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError("Location access is not supported in this browser.");
      return;
    }

    setIsSyncingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setRouteFrom((current) => current ?? { kind: "current-location" });
        setIsSyncingLocation(false);
      },
      (error) => {
        setIsSyncingLocation(false);

        if (error.code === error.PERMISSION_DENIED) {
          setLocationError("Location permission was denied.");
          return;
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          setLocationError("Your current location could not be determined.");
          return;
        }

        if (error.code === error.TIMEOUT) {
          setLocationError("Location request timed out. Please try again.");
          return;
        }

        setLocationError("Unable to sync your location right now.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 15000,
      },
    );
  }, []);

  const handleCheckpointSelect = useCallback(
    (nextCheckpoint: MapCheckpoint | null) => {
      selectedCheckpointIdRef.current = nextCheckpoint?.id ?? null;
      setSelectedCheckpoint(nextCheckpoint);
      setSelectedCheckpointForecast(null);
      setForecastError(null);

      if (!nextCheckpoint) {
        checkpointForecastRequestNonce.current += 1;
        setIsForecastLoading(false);
        return;
      }

      const requestId = ++checkpointForecastRequestNonce.current;
      const statusType: CheckpointForecastStatusType = "both";

      setIsForecastLoading(true);

      void (async () => {
        try {
          const nextForecast = await getCheckpointForecast(
            nextCheckpoint.id,
            statusType,
          );

          if (
            checkpointForecastRequestNonce.current !== requestId ||
            selectedCheckpointIdRef.current !== nextCheckpoint.id
          ) {
            return;
          }

          setCheckpoints((currentCheckpoints) =>
            replaceCheckpointInCollection(
              currentCheckpoints,
              nextForecast.checkpoint,
            ),
          );
          setSelectedCheckpoint(nextForecast.checkpoint);
          setSelectedCheckpointForecast(nextForecast);
        } catch (error) {
          if (
            checkpointForecastRequestNonce.current !== requestId ||
            selectedCheckpointIdRef.current !== nextCheckpoint.id
          ) {
            return;
          }

          setForecastError(
            error instanceof Error
              ? error.message
              : "Unable to load checkpoint forecast.",
          );
        } finally {
          if (
            checkpointForecastRequestNonce.current === requestId &&
            selectedCheckpointIdRef.current === nextCheckpoint.id
          ) {
            setIsForecastLoading(false);
          }
        }
      })();
    },
    [],
  );

  const handleUseSelectedCheckpointAsOrigin = useCallback(() => {
    if (!selectedCheckpoint) {
      setRouteError("Select a checkpoint first to use it as the route origin.");
      return;
    }

    if (
      !hasValidCoordinates(
        selectedCheckpoint.latitude,
        selectedCheckpoint.longitude,
      )
    ) {
      setRouteError("Selected checkpoint does not have usable coordinates.");
      return;
    }

    setRouteError(null);
    setRouteFrom({ kind: "checkpoint", checkpointId: selectedCheckpoint.id });
    setEndpointPlacementMode(null);
  }, [selectedCheckpoint]);

  const handleUseSelectedCheckpointAsDestination = useCallback(() => {
    if (!selectedCheckpoint) {
      setRouteError(
        "Select a checkpoint first to use it as the route destination.",
      );
      return;
    }

    if (
      !hasValidCoordinates(
        selectedCheckpoint.latitude,
        selectedCheckpoint.longitude,
      )
    ) {
      setRouteError("Selected checkpoint does not have usable coordinates.");
      return;
    }

    setRouteError(null);
    setRouteTo({ kind: "checkpoint", checkpointId: selectedCheckpoint.id });
    setEndpointPlacementMode(null);
  }, [selectedCheckpoint]);

  const handleUseCurrentLocationAsOrigin = useCallback(() => {
    if (!userLocation) {
      setRouteError("Sync your location first before using it as the origin.");
      return;
    }

    setRouteError(null);
    setRouteFrom({ kind: "current-location" });
    setEndpointPlacementMode(null);
  }, [userLocation]);

  const handleActivateEndpointPlacement = useCallback(
    (endpoint: "from" | "to") => {
      setEndpointPlacementMode((current) => (current === endpoint ? null : endpoint));
    },
    [],
  );

  const handlePlaceEndpoint = useCallback(
    (point: RoutePoint) => {
      if (endpointPlacementMode === "from") {
        setRouteFrom({ kind: "map-point", lat: point.lat, lng: point.lng });
        setEndpointPlacementMode(null);
        setRouteError(null);
        return;
      }

      if (endpointPlacementMode === "to") {
        setRouteTo({ kind: "map-point", lat: point.lat, lng: point.lng });
        setEndpointPlacementMode(null);
        setRouteError(null);
      }
    },
    [endpointPlacementMode],
  );

  const routeFromLabel = formatSelectionLabel(routeFrom, checkpointsById, userLocation);
  const routeToLabel = routeTo
    ? formatSelectionLabel(routeTo, checkpointsById, userLocation)
    : "غير محدد";
  const placementBadgeLabel =
    endpointPlacementMode === "from"
      ? "Tap map to place FROM"
      : endpointPlacementMode === "to"
        ? "Tap map to place TO"
        : "Ready";

  return (
    <main className="relative min-h-screen overflow-hidden bg-transparent text-[var(--clr-white)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,var(--clr-green-dim),transparent_28%),radial-gradient(circle_at_82%_12%,var(--glass-bg-raised),transparent_26%),radial-gradient(circle_at_bottom,var(--clr-red-soft),transparent_22%)]" />

      <MapView
        checkpoints={checkpoints}
        routes={routes}
        departAt={routes.departAt}
        userLocation={userLocation}
        routeEndpoints={{
          from: routeFromPoint,
          to: routeToPoint,
        }}
        heatmapEnabled={heatmapEnabled}
        heatmapSegments={corridorSegments}
        placementMode={endpointPlacementMode}
        onMapPlacement={handlePlaceEndpoint}
        onCheckpointSelect={handleCheckpointSelect}
        onRouteSelect={handleSelectRoute}
        onRouteOpen={handleOpenRouteDetails}
      />

      <div
        aria-hidden="true"
        className="mashwar-column-shell pointer-events-none absolute left-[var(--space-3)] top-[var(--space-3)] bottom-[var(--space-3)] z-10 w-[min(calc(100vw-var(--space-6)),calc(var(--panel-width)+var(--space-5)))]"
      />

      <aside className="pointer-events-auto absolute left-[var(--space-4)] top-[var(--space-4)] z-20 flex w-[min(calc(100vw-var(--space-8)),var(--panel-width))] flex-col gap-[var(--space-3)]">
        <section className="mashwar-panel">
          <button
            type="button"
            onClick={handleSyncLocation}
            disabled={isSyncingLocation}
            className="mashwar-icon-button absolute left-[var(--space-4)] top-[var(--space-4)] inline-flex h-10 w-10 items-center justify-center disabled:cursor-wait disabled:opacity-55"
            aria-label={isSyncingLocation ? "Syncing location" : "Sync location"}
          >
            <LocationSyncIcon className={`h-5 w-5 ${isSyncingLocation ? "animate-pulse" : ""}`} />
          </button>

          <div className="p-[var(--panel-padding)] pl-16">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="mashwar-mono text-[10px] uppercase tracking-[0.34em] text-[var(--clr-slate)]">
                  MOVEMENT
                </p>
                <h2 dir="rtl" className="mashwar-arabic mashwar-display mt-2 text-[var(--text-lg)] text-[var(--clr-white)]">
                  من - إلى
                </h2>
              </div>

              <span
                className="mashwar-pill px-3 py-1 text-[11px] font-semibold"
                style={{
                  borderColor: endpointPlacementMode
                    ? "var(--clr-green-bright)"
                    : "var(--glass-border)",
                  color: endpointPlacementMode
                    ? "var(--clr-green-soft)"
                    : "var(--clr-sand)",
                  backgroundColor: endpointPlacementMode
                    ? "var(--clr-green-dim)"
                    : "var(--glass-bg-mid)",
                }}
              >
                <span className={endpointPlacementMode ? "mashwar-live-dot" : "mashwar-live-dot"} />
                <span className="mashwar-mono">{placementBadgeLabel}</span>
              </span>
            </div>

            <div className="mt-[var(--space-4)] grid gap-[var(--space-3)]">
              <EndpointChip
                label="من"
                value={routeFromLabel}
                helper={endpointPlacementMode === "from" ? "اضغط على أي نقطة في الخريطة" : undefined}
                isActive={endpointPlacementMode === "from"}
                onActivate={() => handleActivateEndpointPlacement("from")}
                onClear={() => setRouteFrom(null)}
              />
              <EndpointChip
                label="إلى"
                value={routeToLabel}
                helper={endpointPlacementMode === "to" ? "اضغط على أي نقطة في الخريطة" : undefined}
                isActive={endpointPlacementMode === "to"}
                onActivate={() => handleActivateEndpointPlacement("to")}
                onClear={() => setRouteTo(null)}
              />
            </div>

            <div className="mt-[var(--space-3)] flex flex-wrap gap-[var(--space-2)]">
              <button
                type="button"
                onClick={handleUseCurrentLocationAsOrigin}
                disabled={!userLocation}
                className="mashwar-action px-3 py-2 text-[11px] disabled:cursor-not-allowed"
              >
                الحالي
              </button>
              <button
                type="button"
                onClick={handleUseSelectedCheckpointAsOrigin}
                disabled={!selectedCheckpoint}
                className="mashwar-action px-3 py-2 text-[11px] disabled:cursor-not-allowed"
              >
                استخدم كمن
              </button>
              <button
                type="button"
                onClick={handleUseSelectedCheckpointAsDestination}
                disabled={!selectedCheckpoint}
                className="mashwar-action px-3 py-2 text-[11px] disabled:cursor-not-allowed"
              >
                استخدم كإلى
              </button>
            </div>

            <button
              type="button"
              onClick={handleRouteButtonClick}
              disabled={isRoutePending}
              className="mashwar-action mashwar-action-primary mt-[var(--space-3)] flex h-10 w-full items-center justify-center gap-2 px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
            >
              <span>{routePaths.length > 0 ? "مسح المسار" : "ابدأ التوجيه"}</span>
              {routePaths.length > 0 ? (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/12 text-[12px] leading-none">
                  ×
                </span>
              ) : null}
            </button>

            <div className="mt-[var(--space-3)] flex flex-wrap items-center gap-[var(--space-2)] text-[11px] text-[var(--clr-slate)]">
              {routeError ? (
                <span className="mashwar-pill px-3 py-1 text-[var(--clr-white)]" style={{ borderColor: "var(--risk-high)", backgroundColor: "var(--risk-high-bg)" }}>
                  {routeError}
                </span>
              ) : null}
              {locationError ? (
                <span className="mashwar-pill px-3 py-1 text-[var(--clr-white)]" style={{ borderColor: "var(--risk-high)", backgroundColor: "var(--risk-high-bg)" }}>
                  {locationError}
                </span>
              ) : null}
            </div>

            {routePaths.length > 0 ? (
              <div className="glass-card mt-[var(--space-4)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[var(--clr-slate)]">
                      ROUTES ON MAP
                    </p>
                    <p className="mt-1 text-[13px] text-[var(--clr-sand)]">
                      كل المسارات المعادة تظهر فوق الخريطة. مرر فوق أي مسار لرؤية الوقت والمخاطر ثم اضغط لفتح التفاصيل.
                    </p>
                  </div>
                  <span className="mashwar-pill px-3 py-1 text-[11px]">
                    {routePaths.length} ACTIVE
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-[var(--glass-border)]" />

          <div className="space-y-[var(--space-4)] p-[var(--panel-padding)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="mashwar-display text-[var(--text-md)] text-[var(--clr-white)]">
                  لوحة الحركة
                </h3>
                <div className="mashwar-pill mt-[var(--space-2)] px-3 py-1.5 text-[11px]">
                  <span className="mashwar-live-dot" />
                  <span className="mashwar-mono">{checkpoints.length}</span>
                  <span>CHECKPOINTS</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <MapStatChip
                label="mappable"
                value={`${mappableCheckpointCount}`}
                tone="neutral"
              />
              <MapStatChip
                label="missing coords"
                value={`${checkpointsWithoutCoordinates.length}`}
                tone="amber"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsNaturalRouteModalOpen(true)}
                className="mashwar-action px-3 py-2 text-sm"
              >
                موجز المسار الذكي
              </button>
              <button
                type="button"
                onClick={handleLoadDemoRoute}
                disabled={isRoutePending}
                className="mashwar-action px-3 py-2 text-sm disabled:cursor-wait"
              >
                تحميل مسار تجريبي
              </button>
            </div>

            <HeatmapToggle
              enabled={heatmapEnabled}
              loading={isHeatmapLoading || isHeatmapBuilding}
              onToggle={handleToggleHeatmap}
            />

            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px]">
              <button
                type="button"
                onClick={handleRetryCheckpoints}
                className="mashwar-link-button underline-offset-4 hover:underline"
              >
                إعادة تحميل الحواجز
              </button>
              <button
                type="button"
                onClick={handleSyncLocation}
                disabled={isSyncingLocation}
                className="mashwar-link-button underline-offset-4 hover:underline disabled:cursor-wait disabled:opacity-55"
              >
                {isSyncingLocation ? "جارٍ مزامنة الموقع..." : "مزامنة الموقع"}
              </button>
            </div>

            <div className="space-y-2 text-[12px] leading-6 text-[var(--clr-slate)]">
              {isLoadingCheckpoints ? (
                <p className="mashwar-arabic">جارٍ تحميل ذكاء الحركة من واجهة الحواجز.</p>
              ) : (
                <p className="mashwar-arabic">نقاط الحواجز الحية جاهزة للاختيار فوق الخريطة.</p>
              )}

              {!isLoadingCheckpoints && checkpointError ? (
                <p className="text-[var(--clr-white)]" style={{ color: "var(--risk-high)" }}>{checkpointError}</p>
              ) : null}

              {!isLoadingCheckpoints && routeError ? (
                <p className="text-[var(--clr-white)]" style={{ color: "var(--risk-high)" }}>{routeError}</p>
              ) : null}

              {!isLoadingCheckpoints && checkpointsWithoutCoordinates.length > 0 ? (
                <p className="mashwar-arabic">
                  يوجد {checkpointsWithoutCoordinates.length} حاجز بدون إحداثيات، لذلك لن يظهر داخل طبقة الخريطة.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </aside>

      {heatmapEnabled ? (
        <aside className="pointer-events-auto absolute left-[var(--space-4)] bottom-[var(--space-4)] z-20 w-[min(calc(100vw-var(--space-8)),var(--panel-width))]">
          <HeatmapLegendPanel
            progress={buildProgress}
            isBuilding={isHeatmapBuilding}
            isLoading={isHeatmapLoading}
            error={heatmapError}
            corridorCount={corridorsRaw.length}
          />
        </aside>
      ) : null}

      <aside className="pointer-events-auto absolute left-[var(--space-4)] top-[calc(var(--space-4)+32rem)] z-30 w-[min(calc(100vw-var(--space-8)),var(--panel-width))]">
        {selectedCheckpoint ? (
          <section
            className="mashwar-panel max-h-[calc(100dvh-32rem)] overflow-hidden"
            style={{ animation: "mashwar-panel-in-left 220ms ease-out" }}
          >
            <div className="mashwar-scroll max-h-[calc(100dvh-32rem)] overflow-y-auto">
              <div className="border-b border-[var(--glass-border)] p-[var(--panel-padding)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="mashwar-mono text-[10px] uppercase tracking-[0.34em] text-[var(--clr-slate)]">
                      CHECKPOINT
                    </p>
                    <h2 dir="rtl" className="mashwar-arabic mashwar-display mt-2 text-[var(--text-lg)] text-[var(--clr-white)]">
                      {selectedCheckpoint.name}
                    </h2>
                    <div className="mt-3">
                      <StatusPill status={selectedCheckpointStatus ?? "غير معروف"} />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCheckpointSelect(null)}
                    className="mashwar-icon-button inline-flex h-8 w-8 items-center justify-center text-[var(--clr-slate)]"
                    aria-label="Close checkpoint panel"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="space-y-[var(--space-4)] p-[var(--panel-padding)]">
                <div className="grid gap-[var(--space-3)]">
                  {([
                    ["ENTERING", selectedCheckpoint.enteringStatus, enteringVisual],
                    ["LEAVING", selectedCheckpoint.leavingStatus, leavingVisual],
                  ] as const).map(([label, status, visual]) => (
                    <section
                      key={label}
                      className="glass-card p-3"
                    >
                      <p className="mashwar-mono text-[9px] uppercase tracking-[0.28em] text-[var(--clr-slate)]">
                        {label}
                      </p>
                      <p
                        className="mashwar-arabic mt-2 text-[18px] font-bold"
                        style={{ color: visual.text }}
                        dir="rtl"
                      >
                        {status}
                      </p>
                      <div className="mt-2">
                        <StatusPill status={status} compact />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleUseSelectedCheckpointAsOrigin}
                          className="mashwar-action px-2.5 py-1 text-[11px]"
                        >
                          استخدم كمن
                        </button>
                        <button
                          type="button"
                          onClick={handleUseSelectedCheckpointAsDestination}
                          className="mashwar-action px-2.5 py-1 text-[11px]"
                        >
                          استخدم كإلى
                        </button>
                      </div>
                    </section>
                  ))}
                </div>

                <section className="glass-card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[var(--clr-slate)]">
                        FORECAST
                      </p>
                    </div>
                    <span className="mashwar-pill inline-flex items-center gap-2 px-3 py-1 text-[var(--clr-green-soft)]" style={{ borderColor: "var(--risk-low)", backgroundColor: "var(--risk-low-bg)" }}>
                      <span className="mashwar-live-dot" />
                      UPDATED
                    </span>
                  </div>

                  {travelWindow && buildTravelWindowEntries(travelWindow).length > 0 ? (
                    <div className="glass-card mt-[var(--space-4)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[var(--clr-slate)]">
                            TRAVEL WINDOW
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[10px] text-[var(--clr-slate)]">
                          {travelWindow.referenceTime ? (
                            <span className="mashwar-pill px-2.5 py-1">
                              Reference {formatForecastDateTime(travelWindow.referenceTime)}
                            </span>
                          ) : null}
                          {travelWindow.scope ? (
                            <span className="mashwar-pill px-2.5 py-1">
                              Scope {travelWindow.scope}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {buildTravelWindowEntries(travelWindow).map((entry) => (
                          <article
                            key={entry.kind}
                            className="glass-card p-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="mashwar-mono text-[9px] uppercase tracking-[0.24em] text-[var(--clr-slate)]">
                                  {entry.kind.toUpperCase()}
                                </p>
                                <h4 className="mashwar-display mt-1 text-[14px] font-semibold text-[var(--clr-white)]">
                                  {entry.label}
                                </h4>
                              </div>
                              <span className="mashwar-pill px-2.5 py-1 text-[11px]">
                                {entry.item?.windowLabel ?? "n/a"}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                              <div className="glass-card p-2.5">
                                <p className="mashwar-mono text-[9px] uppercase tracking-[0.22em] text-[var(--clr-slate)]">
                                  Day
                                </p>
                                <p className="mt-1 text-[13px] font-semibold text-[var(--clr-white)]">
                                  {entry.item?.dayOfWeek ?? "n/a"}
                                </p>
                              </div>
                              <div className="glass-card p-2.5">
                                <p className="mashwar-mono text-[9px] uppercase tracking-[0.22em] text-[var(--clr-slate)]">
                                  Hour
                                </p>
                                <p className="mashwar-data mt-1 text-[13px] font-semibold text-[var(--clr-white)]">
                                  {formatTravelWindowHour(entry.item?.hour ?? null)}
                                </p>
                              </div>
                              <div className="glass-card p-2.5 xl:col-span-2">
                                <p className="mashwar-mono text-[9px] uppercase tracking-[0.22em] text-[var(--clr-slate)]">
                                  Target time
                                </p>
                                <p className="mashwar-data mt-1 text-[13px] font-semibold text-[var(--clr-white)]">
                                  {formatForecastDateTime(entry.item?.targetDateTime ?? null)}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <div className="glass-card p-2.5">
                                <p className="mashwar-mono text-[9px] uppercase tracking-[0.22em] text-[var(--clr-slate)]">
                                  Entering
                                </p>
                                <p className="mashwar-arabic mt-1 text-[13px] font-semibold text-[var(--clr-white)]">
                                  {entry.item?.enteringPrediction?.predictedStatus ?? "n/a"}
                                </p>
                                <p className="mashwar-data mt-1 text-[11px] text-[var(--clr-slate)]">
                                  Confidence {formatForecastConfidence(entry.item?.enteringPrediction?.confidence ?? null)}
                                </p>
                              </div>
                              <div className="glass-card p-2.5">
                                <p className="mashwar-mono text-[9px] uppercase tracking-[0.22em] text-[var(--clr-slate)]">
                                  Leaving
                                </p>
                                <p className="mashwar-arabic mt-1 text-[13px] font-semibold text-[var(--clr-white)]">
                                  {entry.item?.leavingPrediction?.predictedStatus ?? "n/a"}
                                </p>
                                <p className="mashwar-data mt-1 text-[11px] text-[var(--clr-slate)]">
                                  Confidence {formatForecastConfidence(entry.item?.leavingPrediction?.confidence ?? null)}
                                </p>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <p className="mt-2 mashwar-mono text-[10px] uppercase tracking-[0.22em] text-[var(--risk-med)]">
                    Captured{" "}
                    {formatForecastDateTime(
                      selectedCheckpointForecast?.request.asOf ?? null,
                    )}
                  </p>
                  <p className="mt-2 text-[12px] text-[var(--clr-slate)]">
                    {forecastRows.length > 0
                      ? `${forecastRows.length} horizons with entering and leaving predictions`
                      : isForecastLoading
                        ? "Loading forecast horizons..."
                        : "Forecast timeline is waiting for data."}
                  </p>

                  {forecastError ? (
                    <p className="mashwar-pill mt-3 rounded-[var(--radius-md)] px-3 py-2 text-[12px] text-[var(--clr-white)]" style={{ borderColor: "var(--risk-high)", backgroundColor: "var(--risk-high-bg)" }}>
                      {forecastError}
                    </p>
                  ) : null}

                  {isForecastLoading ? (
                    <p className="glass-card mt-3 px-3 py-2 text-[12px] text-[var(--clr-sand)]">
                      Forecasting checkpoint behavior.
                    </p>
                  ) : null}

                  <div className="mt-3 space-y-1.5">
                    {forecastRows.length > 0 ? (
                      forecastRows.map((row) => (
                        <ForecastEntry key={row.horizon} row={row} />
                      ))
                    ) : (
                      <div className="glass-card border-dashed px-3 py-3 text-[12px] text-[var(--clr-slate)]">
                        No forecast rows returned for this checkpoint yet.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </section>
        ) : null}
      </aside>

      <MashwarNaturalLanguageRouteModal
        open={isNaturalRouteModalOpen}
        currentLocation={userLocation}
        onApplyRoute={handleApplyNaturalLanguageRoute}
        onClose={() => setIsNaturalRouteModalOpen(false)}
      />
      <RouteDetailsModal
        open={Boolean(routeDetailsRoute)}
        route={routeDetailsRoute}
        departAt={routes.departAt}
        routeVersion={routes.version}
        checkpointMatching={routes.checkpointMatching}
        onClose={() => setRouteDetailsRouteId(null)}
      />
      <TradeoffExplainerModal
        explainer={routes.tradeoffExplainer}
        selectedRouteId={routes.selectedRouteId}
        onRouteSelect={handleSelectRoute}
      />
    </main>
  );
}

function resolveRouteEndpointInfo(
  selection:
    | { kind: "current-location" }
    | { kind: "checkpoint"; checkpointId: string }
    | { kind: "map-point"; lat: number; lng: number }
    | null,
  checkpointsById: Map<string, MapCheckpoint>,
  userLocation: UserLocation | null,
): { point: RoutePoint; city: string | null } | null {
  if (!selection) {
    return null;
  }

  if (selection.kind === "current-location") {
    if (!userLocation) {
      return null;
    }

    return {
      point: {
        lat: userLocation.lat,
        lng: userLocation.lng,
      },
      city: null,
    };
  }

  if (selection.kind === "map-point") {
    return {
      point: {
        lat: selection.lat,
        lng: selection.lng,
      },
      city: null,
    };
  }

  const checkpoint = checkpointsById.get(selection.checkpointId);
  if (
    !checkpoint ||
    !hasValidCoordinates(checkpoint.latitude, checkpoint.longitude)
  ) {
    return null;
  }

  if (checkpoint.latitude === null || checkpoint.longitude === null) {
    return null;
  }

  return {
    point: {
      lat: checkpoint.latitude,
      lng: checkpoint.longitude,
    },
    city: checkpoint.city,
  };
}
