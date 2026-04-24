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
import MashwarNaturalLanguageRouteModal from "@/components/map/MashwarNaturalLanguageRouteModal";
import RouteDetailsModal from "@/components/map/RouteDetailsModal";
import TradeoffExplainerModal from "@/components/map/TradeoffExplainerModal";
import { buildCorridorSegments } from "@/lib/heatmap/corridorSegments";
import { normalizeCheckpointId } from "@/lib/heatmap/normalizeCheckpoint";
import { hasValidCoordinates, getRenderableRoutes, getWorstStatus } from "@/lib/config/map";
import { getCheckpoints } from "@/lib/services/checkpoints";
import { getCheckpointForecast } from "@/lib/services/forecast";
import { fetchHeatmapCache, streamHeatmapNetwork } from "@/lib/services/heatmap";
import { reverseGeocodeShortLabel } from "@/lib/services/nominatimReverseGeocode";
import { getRoute } from "@/lib/services/routing";
import { formatDateTimeInPalestine } from "@/lib/utils/palestine-time";
import type {
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
import { FaFire } from "react-icons/fa";
import { IoChevronDown, IoClose, IoSearch } from "react-icons/io5";
import { MdMyLocation } from "react-icons/md";

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

/** Short horizon label for stacked forecast cards (Arabic-first UI). */
function getForecastHorizonTitleAr(horizon: string): string {
  switch (horizon) {
    case "plus_30m":
      return "خلال ٣٠ دقيقة";
    case "plus_1h":
      return "خلال ساعة";
    case "plus_2h":
      return "خلال ساعتين";
    case "next_day_8am":
      return "غدًا حوالي ٨ صباحًا";
    default:
      return horizon;
  }
}

function forecastCoverageLabelAr(row: ForecastRow): string {
  if (row.entering && row.leaving) {
    return "دخول وخروج";
  }
  if (row.entering) {
    return "دخول فقط";
  }
  return "خروج فقط";
}

function travelWindowHeadlineAr(kind: "best" | "worst"): string {
  return kind === "best" ? "أفضل وقت للعبور" : "أسوأ وقت للعبور";
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

type EndpointOrigin = "gps" | "map" | "checkpoint" | null;

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

function getRowLabelForEndpoint(
  selection:
    | { kind: "current-location" }
    | { kind: "checkpoint"; checkpointId: string }
    | { kind: "map-point"; lat: number; lng: number }
    | null,
  geocodeLabel: string | null,
  checkpointsById: Map<string, MapCheckpoint>,
  userLocation: UserLocation | null,
): string {
  if (!selection) {
    return "غير محدد";
  }

  if (selection.kind === "checkpoint") {
    return formatSelectionLabel(selection, checkpointsById, userLocation);
  }

  if (selection.kind === "current-location") {
    if (!userLocation) {
      return "غير محدد";
    }

    return geocodeLabel ?? "الحالي";
  }

  return geocodeLabel ?? "غير محدد";
}

function DirectionStatusTile({
  titleAr,
  titleEn,
  status,
}: {
  titleAr: string;
  titleEn: string;
  status: MapCheckpointStatus;
}) {
  const visual = STATUS_VISUALS[status] ?? STATUS_VISUALS["غير معروف"];

  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      style={{ borderInlineStartWidth: 3, borderInlineStartColor: visual.border }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-end" dir="rtl">
          <p className="mashwar-arabic text-[13px] font-semibold leading-tight text-[var(--clr-white)]">
            {titleAr}
          </p>
          <p className="mashwar-mono mt-0.5 text-[9px] uppercase tracking-[0.16em] text-[var(--clr-slate)]" dir="ltr">
            {titleEn}
          </p>
        </div>
        <span
          className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/10"
          style={{ backgroundColor: visual.dot }}
          aria-hidden
        />
      </div>
      <p
        className="mashwar-arabic mt-3 text-end text-[20px] font-bold leading-snug tracking-tight"
        style={{ color: visual.text }}
        dir="rtl"
      >
        {status}
      </p>
      <p className="mashwar-mono mt-1 text-end text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--clr-slate)] opacity-80" dir="ltr">
        {visual.en}
      </p>
    </div>
  );
}

function FusedDirectionsStatusTile({ status }: { status: MapCheckpointStatus }) {
  const visual = STATUS_VISUALS[status] ?? STATUS_VISUALS["غير معروف"];

  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-gradient-to-b from-[var(--glass-bg-raised)] to-[var(--glass-bg-mid)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      style={{ borderTopWidth: 3, borderTopColor: visual.border }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2" dir="rtl">
        <div className="text-end">
          <p className="mashwar-arabic text-[11px] font-semibold text-[var(--clr-sand)]">الاتجاهان</p>
          <p className="mashwar-mono mt-0.5 text-[9px] uppercase tracking-[0.18em] text-[var(--clr-slate)]" dir="ltr">
            Entering · leaving
          </p>
        </div>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/10"
          style={{ backgroundColor: visual.dot }}
          aria-hidden
        />
      </div>
      <p
        className="mashwar-arabic mt-4 text-center text-[clamp(1.35rem,4.5vw,1.75rem)] font-bold leading-tight"
        style={{ color: visual.text }}
        dir="rtl"
      >
        {status}
      </p>
      <p className="mashwar-mono mt-1 text-center text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--clr-slate)]" dir="ltr">
        {visual.en}
      </p>
    </div>
  );
}

function ForecastDirectionCell({
  titleAr,
  titleEn,
  item,
}: {
  titleAr: string;
  titleEn: string;
  item: ForecastRow["entering"];
}) {
  const status = item?.prediction.predictedStatus ?? "غير معروف";
  const visual = STATUS_VISUALS[status] ?? STATUS_VISUALS["غير معروف"];
  const tone = item ? getConfidenceTone(item.prediction.confidence) : null;

  return (
    <div
      className={`rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg)]/80 p-2.5 ${item ? "" : "opacity-55"}`}
      style={{ borderInlineStartWidth: 2, borderInlineStartColor: visual.border }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-end" dir="rtl">
          <p className="mashwar-arabic text-[12px] font-semibold text-[var(--clr-sand)]">{titleAr}</p>
          <p className="mashwar-mono text-[9px] uppercase tracking-[0.14em] text-[var(--clr-slate)]" dir="ltr">
            {titleEn}
          </p>
        </div>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: visual.dot }} aria-hidden />
      </div>
      <p
        className="mashwar-arabic mt-2 text-end text-[15px] font-bold leading-snug"
        style={{ color: item ? visual.text : "var(--clr-slate)" }}
        dir="rtl"
      >
        {item ? status : "—"}
      </p>
      {item ? (
        <p className="mashwar-mono mt-1 text-end text-[10px]" style={{ color: tone?.color ?? "var(--clr-slate)" }} dir="rtl">
          ثقة {formatForecastConfidence(item.prediction.confidence)}
        </p>
      ) : (
        <p className="mashwar-mono mt-1 text-end text-[10px] text-[var(--clr-slate)]">—</p>
      )}
    </div>
  );
}

function ForecastHorizonCard({ row }: { row: ForecastRow }) {
  return (
    <article className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)]/95 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--glass-border)] pb-2.5">
        <div className="min-w-0 text-end" dir="rtl">
          <h4 className="mashwar-arabic text-[15px] font-bold leading-snug text-[var(--clr-white)]">
            {getForecastHorizonTitleAr(row.horizon)}
          </h4>
          <p className="mashwar-mono mt-0.5 text-[10px] text-[var(--clr-slate)]" dir="ltr">
            {formatForecastDateTime(row.targetDateTime)}
          </p>
        </div>
        <span className="mashwar-arabic shrink-0 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-1 text-[10px] text-[var(--clr-sand)]">
          {forecastCoverageLabelAr(row)}
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ForecastDirectionCell titleAr="دخول" titleEn="Entering" item={row.entering} />
        <ForecastDirectionCell titleAr="خروج" titleEn="Leaving" item={row.leaving} />
      </div>
    </article>
  );
}

const DEFAULT_GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};

export default function MashwarHome() {
  const [checkpoints, setCheckpoints] = useState<MapCheckpoint[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] =
    useState<MapCheckpoint | null>(null);
  const [selectedCheckpointForecast, setSelectedCheckpointForecast] =
    useState<NormalizedCheckpointForecast | null>(null);
  const [isNaturalRouteModalOpen, setIsNaturalRouteModalOpen] = useState(false);
  const [smartRouterOn, setSmartRouterOn] = useState(false);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [isForecastLoading, setIsForecastLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [fromGeocodeLabel, setFromGeocodeLabel] = useState<string | null>(null);
  const [toGeocodeLabel, setToGeocodeLabel] = useState<string | null>(null);
  const [fromResolving, setFromResolving] = useState(false);
  const [toResolving, setToResolving] = useState(false);
  const [fromOrigin, setFromOrigin] = useState<EndpointOrigin>(null);
  const [toOrigin, setToOrigin] = useState<EndpointOrigin>(null);
  const [gpsLoading, setGpsLoading] = useState({ from: false, to: false });
  const [gpsErrorField, setGpsErrorField] = useState<"from" | "to" | null>(null);
  const [swapAnimating, setSwapAnimating] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routes, setRoutes] = useState<NormalizedRoutes>(EMPTY_ROUTES);
  const [routeDetailsRouteId, setRouteDetailsRouteId] = useState<string | null>(null);
  const [isRoutePending, startRouteTransition] = useTransition();
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [corridorsRaw, setCorridorsRaw] = useState<HeatmapCorridorFeature[]>([]);
  const [corridorSegments, setCorridorSegments] =
    useState<HeatmapSegmentFeatureCollection>({
      type: "FeatureCollection",
      features: [],
    });
  const [isHeatmapLoading, setIsHeatmapLoading] = useState(false);
  const [isHeatmapBuilding, setIsHeatmapBuilding] = useState(false);
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
  const fromGeocodeNonce = useRef(0);
  const toGeocodeNonce = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function loadCheckpoints(): Promise<void> {
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
      }
    }

    void loadCheckpoints();
    return () => {
      cancelled = true;
    };
  }, []);

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
        setIsHeatmapBuilding(false);
        setIsHeatmapLoading(false);
        return;
      }

      setIsHeatmapBuilding(true);

      const source = streamHeatmapNetwork({
        onStart: (event) => {
          setIsHeatmapBuilding(!(event.cached ?? false));
        },
        onRouteBuilt: (corridor, _event) => {
          setCorridorsRaw((current) => {
            if (current.some((item) => item.properties.id === corridor.properties.id)) {
              return current;
            }

            return [...current, corridor];
          });
        },
        onDone: () => {
          setIsHeatmapLoading(false);
          setIsHeatmapBuilding(false);
          closeHeatmapStream();
        },
        onError: (message) => {
          setHeatmapError(message);
          setIsHeatmapLoading(false);
          setIsHeatmapBuilding(false);
          closeHeatmapStream();
        },
      });

      eventSourceRef.current = source;
    } catch (error) {
      setHeatmapError(
        error instanceof Error ? error.message : "تعذر تحميل الخريطة الحرارية",
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

  function handleClearRoute(): void {
    setRouteError(null);
    setRoutes(EMPTY_ROUTES);
    setRouteDetailsRouteId(null);
    setSmartRouterOn(false);
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
      setFromOrigin("map");
      setToOrigin("map");
      setFromGeocodeLabel(null);
      setToGeocodeLabel(null);
      setFromResolving(false);
      setToResolving(false);
      const fromNonce = ++fromGeocodeNonce.current;
      const toNonce = ++toGeocodeNonce.current;

      void (async () => {
        const [fromLabel, toLabel] = await Promise.all([
          reverseGeocodeShortLabel(resolution.origin.lat, resolution.origin.lng),
          reverseGeocodeShortLabel(
            resolution.destination.lat,
            resolution.destination.lng,
          ),
        ]);

        if (fromGeocodeNonce.current === fromNonce) {
          setFromGeocodeLabel(fromLabel);
        }

        if (toGeocodeNonce.current === toNonce) {
          setToGeocodeLabel(toLabel);
        }
      })();

      setRouteDetailsRouteId(null);
      setEndpointPlacementMode(null);
      setIsNaturalRouteModalOpen(false);
      setSmartRouterOn(true);
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

  const handleToggleHeatmap = useCallback(() => {
    setHeatmapEnabled((current) => {
      const next = !current;

      if (next) {
        void ensureHeatmapNetworkLoaded();
      }

      return next;
    });
  }, [ensureHeatmapNetworkLoaded]);

  const handleGpsAsFrom = useCallback(() => {
    setGpsErrorField(null);

    if (!navigator.geolocation) {
      setGpsErrorField("from");
      window.setTimeout(() => setGpsErrorField(null), 1200);
      return;
    }

    setGpsLoading((s) => ({ ...s, from: true }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation({
          lat,
          lng,
          accuracy: position.coords.accuracy,
        });
        setRouteFrom({ kind: "current-location" });
        setFromOrigin("gps");
        setFromGeocodeLabel(null);
        setRouteError(null);
        setEndpointPlacementMode(null);
        setGpsLoading((s) => ({ ...s, from: false }));

        const nonce = ++fromGeocodeNonce.current;
        void (async () => {
          const label = await reverseGeocodeShortLabel(lat, lng);
          if (fromGeocodeNonce.current !== nonce) {
            return;
          }

          setFromGeocodeLabel(label);
        })();
      },
      () => {
        setGpsLoading((s) => ({ ...s, from: false }));
        setGpsErrorField("from");
        window.setTimeout(() => setGpsErrorField(null), 1400);
      },
      DEFAULT_GEO_OPTIONS,
    );
  }, []);

  const handleGpsAsTo = useCallback(() => {
    setGpsErrorField(null);

    if (!navigator.geolocation) {
      setGpsErrorField("to");
      window.setTimeout(() => setGpsErrorField(null), 1200);
      return;
    }

    setGpsLoading((s) => ({ ...s, to: true }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation({
          lat,
          lng,
          accuracy: position.coords.accuracy,
        });
        setRouteTo({ kind: "map-point", lat, lng });
        setToOrigin("gps");
        setToGeocodeLabel(null);
        setRouteError(null);
        setEndpointPlacementMode(null);
        setGpsLoading((s) => ({ ...s, to: false }));

        const nonce = ++toGeocodeNonce.current;
        void (async () => {
          const label = await reverseGeocodeShortLabel(lat, lng);
          if (toGeocodeNonce.current !== nonce) {
            return;
          }

          setToGeocodeLabel(label);
        })();
      },
      () => {
        setGpsLoading((s) => ({ ...s, to: false }));
        setGpsErrorField("to");
        window.setTimeout(() => setGpsErrorField(null), 1400);
      },
      DEFAULT_GEO_OPTIONS,
    );
  }, []);

  const handleSmartRouterCardClick = useCallback(() => {
    setSmartRouterOn((prev) => {
      const next = !prev;
      if (next) {
        setIsNaturalRouteModalOpen(true);
      } else {
        setIsNaturalRouteModalOpen(false);
      }
      return next;
    });
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
    setFromOrigin("checkpoint");
    setFromGeocodeLabel(null);
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
    setToOrigin("checkpoint");
    setToGeocodeLabel(null);
    setEndpointPlacementMode(null);
  }, [selectedCheckpoint]);

  const handleActivateEndpointPlacement = useCallback(
    (endpoint: "from" | "to") => {
      setEndpointPlacementMode((current) => (current === endpoint ? null : endpoint));
    },
    [],
  );

  const handlePlaceEndpoint = useCallback(
    (point: RoutePoint) => {
      if (endpointPlacementMode === "from") {
        const nonce = ++fromGeocodeNonce.current;
        setRouteFrom({ kind: "map-point", lat: point.lat, lng: point.lng });
        setFromOrigin("map");
        setFromGeocodeLabel(null);
        setFromResolving(true);
        setEndpointPlacementMode(null);
        setRouteError(null);

        void (async () => {
          const label = await reverseGeocodeShortLabel(point.lat, point.lng);
          if (fromGeocodeNonce.current !== nonce) {
            return;
          }

          setFromGeocodeLabel(label);
          setFromResolving(false);
        })();
        return;
      }

      if (endpointPlacementMode === "to") {
        const nonce = ++toGeocodeNonce.current;
        setRouteTo({ kind: "map-point", lat: point.lat, lng: point.lng });
        setToOrigin("map");
        setToGeocodeLabel(null);
        setToResolving(true);
        setEndpointPlacementMode(null);
        setRouteError(null);

        void (async () => {
          const label = await reverseGeocodeShortLabel(point.lat, point.lng);
          if (toGeocodeNonce.current !== nonce) {
            return;
          }

          setToGeocodeLabel(label);
          setToResolving(false);
        })();
      }
    },
    [endpointPlacementMode],
  );

  const handleClearFrom = useCallback(() => {
    fromGeocodeNonce.current += 1;
    setRouteFrom(null);
    setFromGeocodeLabel(null);
    setFromResolving(false);
    setFromOrigin(null);
    setRouteError(null);
    setEndpointPlacementMode("from");
  }, []);

  const handleClearTo = useCallback(() => {
    toGeocodeNonce.current += 1;
    setRouteTo(null);
    setToGeocodeLabel(null);
    setToResolving(false);
    setToOrigin(null);
    setRouteError(null);
    setEndpointPlacementMode("to");
  }, []);

  const handleSwapEndpoints = useCallback(() => {
    if (swapAnimating) {
      return;
    }

    if (!routeFrom && !routeTo) {
      return;
    }

    setSwapAnimating(true);

    const prevFrom = routeFrom;
    const prevTo = routeTo;
    const nextFrom =
      !prevTo
        ? null
        : prevTo.kind === "checkpoint"
          ? { kind: "checkpoint" as const, checkpointId: prevTo.checkpointId }
          : { kind: "map-point" as const, lat: prevTo.lat, lng: prevTo.lng };

    const nextTo =
      !prevFrom
        ? null
        : prevFrom.kind === "checkpoint"
          ? { kind: "checkpoint" as const, checkpointId: prevFrom.checkpointId }
          : prevFrom.kind === "current-location"
            ? userLocation
              ? {
                  kind: "map-point" as const,
                  lat: userLocation.lat,
                  lng: userLocation.lng,
                }
              : null
            : { kind: "map-point" as const, lat: prevFrom.lat, lng: prevFrom.lng };

    window.setTimeout(() => {
      fromGeocodeNonce.current += 1;
      toGeocodeNonce.current += 1;
      setRouteFrom(nextFrom);
      setRouteTo(nextTo);
      setFromGeocodeLabel(toGeocodeLabel);
      setToGeocodeLabel(fromGeocodeLabel);
      setFromOrigin(toOrigin);
      setToOrigin(fromOrigin);
      setFromResolving(toResolving);
      setToResolving(fromResolving);
      setRouteError(null);
      setEndpointPlacementMode(null);
      setSwapAnimating(false);
    }, 300);
  }, [
    swapAnimating,
    routeFrom,
    routeTo,
    fromGeocodeLabel,
    toGeocodeLabel,
    fromOrigin,
    toOrigin,
    fromResolving,
    toResolving,
    userLocation,
  ]);

  const routeFromBaseLabel = getRowLabelForEndpoint(
    routeFrom,
    fromGeocodeLabel,
    checkpointsById,
    userLocation,
  );
  const routeToBaseLabel = getRowLabelForEndpoint(
    routeTo,
    toGeocodeLabel,
    checkpointsById,
    userLocation,
  );

  const fromGpsSet = routeFrom?.kind === "current-location";
  const toGpsSet = toOrigin === "gps" && routeTo?.kind === "map-point";

  return (
    <main className="fixed inset-0 z-0 h-[100dvh] w-screen overflow-hidden bg-transparent text-[var(--clr-white)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,var(--clr-green-dim),transparent_28%),radial-gradient(circle_at_82%_12%,var(--glass-bg-raised),transparent_26%),radial-gradient(circle_at_bottom,var(--clr-red-soft),transparent_22%)]" />

      <div className="absolute inset-0 h-full w-full">
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
      </div>

      <div className="fixed left-1/2 top-5 z-[1100] flex w-[min(calc(100vw-24px),720px)] -translate-x-1/2 flex-col items-stretch gap-2">
        <div
          className="overflow-hidden rounded-full border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
          style={{
            backgroundColor: "rgba(20,20,20,0.85)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="flex w-full max-w-full items-center justify-between gap-2 overflow-x-hidden px-2 py-1.5">
            <button
              type="button"
              onClick={handleRouteButtonClick}
              disabled={isRoutePending}
              className="mashwar-arabic order-1 shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_2px_12px_rgba(5,150,105,0.35)] transition hover:bg-emerald-500 hover:shadow-[0_4px_18px_rgba(5,150,105,0.45)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
            >
              {routePaths.length > 0 ? "مسح المسار" : "ابدأ التوجيه"}
            </button>

            <div
              dir="rtl"
              className="order-2 flex min-w-0 flex-1 items-center justify-center gap-1 sm:gap-1.5"
            >
              <div
                className={`flex min-w-0 shrink items-center gap-0.5 rounded-full bg-white/5 px-1 py-0.5 transition-all duration-300 ease-out ${
                  endpointPlacementMode === "to" ? "opacity-40" : ""
                } ${swapAnimating ? "translate-y-3.5" : ""} ${
                  endpointPlacementMode === "from"
                    ? "ring-2 ring-emerald-400/95 ring-offset-2 ring-offset-[rgba(20,20,20,0.85)] shadow-[0_0_22px_rgba(52,211,153,0.38)]"
                    : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleActivateEndpointPlacement("from")}
                  className="flex min-w-0 max-w-[min(30vw,160px)] flex-1 flex-col rounded-full px-2 py-1.5 text-end transition hover:bg-white/8"
                >
                  <span className="mashwar-mono text-[9px] uppercase tracking-[0.2em] text-white/45">
                    من
                  </span>
                  <div className="flex min-w-0 items-center justify-end gap-1">
                    {fromResolving ? (
                      <span
                        className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-emerald-300"
                        aria-hidden
                      />
                    ) : (
                      <span
                        dir="rtl"
                        className="mashwar-arabic min-w-0 flex-1 truncate text-end text-[13px] font-medium text-white"
                      >
                        {routeFromBaseLabel}
                      </span>
                    )}
                  </div>
                </button>
                {routeFrom && !fromResolving ? (
                  <button
                    type="button"
                    onClick={handleClearFrom}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/55 transition hover:bg-white/12 hover:text-white"
                    aria-label="مسح نقطة الانطلاق"
                  >
                    <IoClose className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleGpsAsFrom}
                disabled={gpsLoading.from}
                title={
                  gpsErrorField === "from"
                    ? "تعذر تحديد موقعك"
                    : "استخدام موقعي كنقطة انطلاق"
                }
                aria-label="استخدام موقعي كنقطة انطلاق"
                className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border shadow-inner transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(20,20,20,0.92)] active:scale-[0.96] disabled:cursor-wait ${
                  gpsErrorField === "from" ? "mashwar-gps-shake" : ""
                } ${
                  fromGpsSet
                    ? "border-emerald-400/75 bg-emerald-500/20 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.45)]"
                    : "border-white/18 bg-white/[0.04] text-white/60 hover:border-emerald-400/45 hover:bg-emerald-500/12 hover:text-emerald-200"
                }`}
              >
                {fromGpsSet ? (
                  <span
                    className="pointer-events-none absolute inset-0 rounded-full bg-emerald-400/20 animate-ping"
                    style={{ animationDuration: "1.8s" }}
                    aria-hidden
                  />
                ) : null}
                {gpsLoading.from ? (
                  <span
                    className="absolute h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-emerald-300"
                    aria-hidden
                  />
                ) : null}
                <MdMyLocation
                  className={`relative h-5 w-5 transition duration-200 ${fromGpsSet ? "scale-105 fill-current" : ""}`}
                  aria-hidden
                />
              </button>

              <button
                type="button"
                onClick={handleSwapEndpoints}
                disabled={swapAnimating}
                className="mashwar-arabic shrink-0 rounded-full border border-white/12 bg-white/[0.06] px-2 py-1.5 text-base font-bold text-white/70 transition hover:border-white/22 hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
                title="تبديل المن والى"
                aria-label="تبديل المن والى"
              >
                ↕
              </button>

              <div
                className={`flex min-w-0 shrink items-center gap-0.5 rounded-full bg-white/5 px-1 py-0.5 transition-all duration-300 ease-out ${
                  endpointPlacementMode === "from" ? "opacity-40" : ""
                } ${swapAnimating ? "-translate-y-3.5" : ""} ${
                  endpointPlacementMode === "to"
                    ? "ring-2 ring-red-500/90 ring-offset-2 ring-offset-[rgba(20,20,20,0.85)] shadow-[0_0_22px_rgba(248,113,113,0.35)]"
                    : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleActivateEndpointPlacement("to")}
                  className="flex min-w-0 max-w-[min(30vw,160px)] flex-1 flex-col rounded-full px-2 py-1.5 text-end transition hover:bg-white/8"
                >
                  <span className="mashwar-mono text-[9px] uppercase tracking-[0.2em] text-white/45">
                    إلى
                  </span>
                  <div className="flex min-w-0 items-center justify-end gap-1">
                    {toResolving ? (
                      <span
                        className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-red-300"
                        aria-hidden
                      />
                    ) : (
                      <span
                        dir="rtl"
                        className="mashwar-arabic min-w-0 flex-1 truncate text-end text-[13px] font-medium text-white"
                      >
                        {routeToBaseLabel}
                      </span>
                    )}
                  </div>
                </button>
                {routeTo && !toResolving ? (
                  <button
                    type="button"
                    onClick={handleClearTo}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/55 transition hover:bg-white/12 hover:text-white"
                    aria-label="مسح الوجهة"
                  >
                    <IoClose className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleGpsAsTo}
                disabled={gpsLoading.to}
                title={
                  gpsErrorField === "to"
                    ? "تعذر تحديد موقعك"
                    : "استخدام موقعي كوجهة"
                }
                aria-label="استخدام موقعي كوجهة"
                className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border shadow-inner transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/75 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(20,20,20,0.92)] active:scale-[0.96] disabled:cursor-wait ${
                  gpsErrorField === "to" ? "mashwar-gps-shake" : ""
                } ${
                  toGpsSet
                    ? "border-emerald-400/75 bg-emerald-500/20 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.45)]"
                    : "border-white/18 bg-white/[0.04] text-white/60 hover:border-red-400/45 hover:bg-red-500/12 hover:text-red-100"
                }`}
              >
                {toGpsSet ? (
                  <span
                    className="pointer-events-none absolute inset-0 rounded-full bg-emerald-400/20 animate-ping"
                    style={{ animationDuration: "1.8s" }}
                    aria-hidden
                  />
                ) : null}
                {gpsLoading.to ? (
                  <span
                    className="absolute h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-red-300"
                    aria-hidden
                  />
                ) : null}
                <MdMyLocation
                  className={`relative h-5 w-5 transition duration-200 ${toGpsSet ? "scale-105 fill-current" : ""}`}
                  aria-hidden
                />
              </button>
            </div>
          </div>

          {routeError ||
          locationError ||
          checkpointError ||
          (heatmapEnabled && heatmapError) ? (
            <div className="border-t border-white/10 px-3 py-2 text-center text-[11px] text-red-200">
              {[routeError, locationError, checkpointError, heatmapEnabled ? heatmapError : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
          ) : null}
        </div>

        {endpointPlacementMode === "from" ? (
          <p
            className="mashwar-arabic pointer-events-none mx-auto rounded-full border border-emerald-500/35 bg-[rgba(16,24,20,0.92)] px-4 py-2 text-center text-[12px] font-medium text-emerald-100 shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
            style={{ backdropFilter: "blur(10px)" }}
            dir="rtl"
          >
            انقر على الخريطة لتحديد نقطة الانطلاق
          </p>
        ) : endpointPlacementMode === "to" ? (
          <p
            className="mashwar-arabic pointer-events-none mx-auto rounded-full border border-red-500/35 bg-[rgba(24,16,18,0.92)] px-4 py-2 text-center text-[12px] font-medium text-red-100 shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
            style={{ backdropFilter: "blur(10px)" }}
            dir="rtl"
          >
            انقر على الخريطة لتحديد الوجهة
          </p>
        ) : null}
      </div>

      <div className="fixed right-5 top-5 z-[1100] flex flex-col gap-2.5">
        <button
          type="button"
          onClick={handleSmartRouterCardClick}
          title="موجز المسار الذكي"
          aria-pressed={smartRouterOn}
          className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border text-lg shadow-lg transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(12,12,12,0.9)] active:scale-[0.96] ${
            smartRouterOn
              ? "border-emerald-400/90 bg-emerald-500/[0.14] text-emerald-100 shadow-[0_0_0_1px_rgba(52,211,153,0.45),0_0_20px_rgba(16,185,129,0.22)]"
              : "border-white/12 bg-[rgba(20,20,20,0.88)] text-white/85 hover:border-emerald-400/40 hover:bg-emerald-500/[0.1] hover:text-emerald-50 hover:shadow-[0_0_0_1px_rgba(52,211,153,0.2),0_8px_24px_rgba(0,0,0,0.35)]"
          }`}
          style={{ backdropFilter: "blur(10px)" }}
        >
          <IoSearch className="h-5 w-5" aria-hidden />
        </button>

        <button
          type="button"
          onClick={handleToggleHeatmap}
          title="خريطة حرارية"
          aria-pressed={heatmapEnabled}
          className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border text-lg shadow-lg transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(12,12,12,0.9)] active:scale-[0.96] ${
            heatmapEnabled
              ? "border-amber-400/90 bg-amber-500/[0.14] text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.45),0_0_20px_rgba(245,158,11,0.2)]"
              : "border-white/12 bg-[rgba(20,20,20,0.88)] text-white/85 hover:border-amber-400/40 hover:bg-amber-500/[0.1] hover:text-amber-50 hover:shadow-[0_0_0_1px_rgba(251,191,36,0.2),0_8px_24px_rgba(0,0,0,0.35)]"
          }`}
          style={{ backdropFilter: "blur(10px)" }}
        >
          <FaFire
            className={`h-5 w-5 ${isHeatmapLoading || isHeatmapBuilding ? "animate-pulse" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      <aside className="pointer-events-auto fixed inset-x-0 bottom-0 z-[1050] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:bottom-6 sm:left-4 sm:right-4 sm:mx-auto sm:max-w-2xl sm:px-0 sm:pb-6 sm:pt-0">
        {selectedCheckpoint ? (
          <section
            className="mashwar-panel mx-auto max-h-[min(85dvh,640px)] w-full max-w-2xl overflow-hidden rounded-t-[var(--radius-xl)] sm:max-h-[min(560px,calc(100dvh-6rem))] sm:rounded-[var(--radius-xl)]"
            style={{ animation: "mashwar-panel-in-left 220ms ease-out" }}
          >
            <div className="mashwar-scroll max-h-[min(85dvh,640px)] overflow-y-auto overflow-x-hidden sm:max-h-[min(560px,calc(100dvh-6rem))]">
              <header className="border-b border-[var(--glass-border)] p-[var(--panel-padding)] pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="mashwar-arabic text-[11px] font-semibold leading-none text-[var(--clr-sand)]" dir="rtl">
                      معلومات الحاجز
                    </p>
                    <p className="mashwar-mono mt-1 text-[9px] uppercase tracking-[0.22em] text-[var(--clr-slate)]">
                      Checkpoint
                    </p>
                    <h2
                      dir="rtl"
                      className="mashwar-arabic mashwar-display mt-3 text-[clamp(1.25rem,4.2vw,1.5rem)] leading-tight text-[var(--clr-white)]"
                    >
                      {selectedCheckpoint.name}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCheckpointSelect(null)}
                    className="mashwar-icon-button inline-flex h-10 w-10 shrink-0 items-center justify-center text-[var(--clr-slate)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(10,12,16,0.9)]"
                    aria-label="إغلاق لوحة الحاجز"
                  >
                    <IoClose className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              </header>

              <div className="space-y-4 p-[var(--panel-padding)]">
                <section aria-labelledby="checkpoint-now-heading">
                  <h3 id="checkpoint-now-heading" className="sr-only">
                    الوضع الحالي
                  </h3>

                  {selectedCheckpoint.enteringStatus !== selectedCheckpoint.leavingStatus ? (
                    <div
                      role="status"
                      className="mb-3 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-amber-400/25 bg-amber-500/[0.08] px-3 py-2.5"
                      dir="rtl"
                    >
                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
                      <p className="mashwar-arabic min-w-0 text-[12px] leading-snug text-[var(--clr-sand)]">
                        <span className="font-semibold text-[var(--clr-white)]">تنبيه:</span> حالة الدخول تختلف عن
                        الخروج. راجع البطاقتين أدناه؛ أسوأ الحالتين هي{" "}
                        <span className="text-[var(--clr-white)]">
                          {STATUS_VISUALS[selectedCheckpointStatus ?? "غير معروف"].ar}
                        </span>
                        .
                      </p>
                    </div>
                  ) : null}

                  {selectedCheckpoint.enteringStatus === selectedCheckpoint.leavingStatus ? (
                    <FusedDirectionsStatusTile status={selectedCheckpoint.enteringStatus} />
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <DirectionStatusTile
                        titleAr="دخول"
                        titleEn="Entering"
                        status={selectedCheckpoint.enteringStatus}
                      />
                      <DirectionStatusTile
                        titleAr="خروج"
                        titleEn="Leaving"
                        status={selectedCheckpoint.leavingStatus}
                      />
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleUseSelectedCheckpointAsOrigin}
                      className="mashwar-action mashwar-action-primary flex min-h-[48px] flex-col items-center justify-center gap-0.5 px-4 py-3 text-center"
                    >
                      <span className="mashwar-arabic text-[13px] font-semibold leading-tight" dir="rtl">
                        نقطة الانطلاق
                      </span>
                      <span className="mashwar-mono text-[9px] font-medium uppercase tracking-[0.14em] opacity-80">
                        Route from here
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleUseSelectedCheckpointAsDestination}
                      className="mashwar-action flex min-h-[48px] flex-col items-center justify-center gap-0.5 px-4 py-3 text-center"
                    >
                      <span className="mashwar-arabic text-[13px] font-semibold leading-tight" dir="rtl">
                        الوجهة
                      </span>
                      <span className="mashwar-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--clr-slate)]">
                        Route to here
                      </span>
                    </button>
                  </div>
                </section>

                <section
                  className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg)]/60 p-4"
                  aria-labelledby="checkpoint-forecast-heading"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--glass-border)] pb-3">
                    <div className="min-w-0" dir="rtl">
                      <h3
                        id="checkpoint-forecast-heading"
                        className="mashwar-arabic text-[15px] font-bold text-[var(--clr-white)]"
                      >
                        التوقعات
                      </h3>
                      <p className="mashwar-mono mt-0.5 text-[9px] uppercase tracking-[0.18em] text-[var(--clr-slate)]">
                        Forecast
                      </p>
                    </div>
                    <span
                      className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] text-[var(--clr-green-soft)]"
                      style={{ borderColor: "var(--risk-low)", backgroundColor: "var(--risk-low-bg)" }}
                    >
                      <span className="mashwar-live-dot" aria-hidden />
                      <span className="mashwar-mono uppercase tracking-[0.12em]">Live</span>
                    </span>
                  </div>

                  <p className="mashwar-arabic mt-3 text-[11px] leading-relaxed text-[var(--clr-slate)]" dir="rtl">
                    آخر تحديث للبيانات:{" "}
                    <span className="mashwar-mono font-medium text-[var(--clr-sand)]" dir="ltr">
                      {formatForecastDateTime(selectedCheckpointForecast?.request.asOf ?? null)}
                    </span>
                  </p>

                  {travelWindow && buildTravelWindowEntries(travelWindow).length > 0 ? (
                    <details className="group mt-4 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)]/80 open:bg-[var(--glass-bg-mid)]">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-[var(--radius-sm)] px-3 py-2.5 text-[var(--clr-white)] marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--glass-bg-mid)] [&::-webkit-details-marker]:hidden">
                        <span className="mashwar-arabic text-[13px] font-semibold" dir="rtl">
                          نافذة السفر
                        </span>
                        <IoChevronDown
                          className="h-4 w-4 shrink-0 text-[var(--clr-slate)] transition duration-200 group-open:rotate-180"
                          aria-hidden
                        />
                      </summary>
                      <div className="border-t border-[var(--glass-border)] px-3 pb-3 pt-2">
                        <div className="flex flex-wrap gap-2">
                          {travelWindow.referenceTime ? (
                            <span className="mashwar-pill px-2.5 py-1 text-[10px]">
                              <span className="mashwar-arabic" dir="rtl">
                                مرجع{" "}
                              </span>
                              {formatForecastDateTime(travelWindow.referenceTime)}
                            </span>
                          ) : null}
                          {travelWindow.scope ? (
                            <span className="mashwar-pill px-2.5 py-1 text-[10px]">
                              <span className="mashwar-arabic" dir="rtl">
                                النطاق{" "}
                              </span>
                              {travelWindow.scope}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 space-y-3">
                          {buildTravelWindowEntries(travelWindow).map((entry) => (
                            <article
                              key={entry.kind}
                              className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg)]/90 p-3"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div dir="rtl" className="min-w-0 text-end">
                                  <p className="mashwar-arabic text-[14px] font-bold text-[var(--clr-white)]">
                                    {travelWindowHeadlineAr(entry.kind)}
                                  </p>
                                  <p className="mashwar-mono mt-0.5 text-[9px] uppercase tracking-[0.14em] text-[var(--clr-slate)]" dir="ltr">
                                    {entry.kind === "best" ? "Best window" : "Worst window"}
                                  </p>
                                </div>
                                <span className="mashwar-pill max-w-[55%] truncate px-2.5 py-1 text-[10px]">
                                  {entry.item?.windowLabel ?? "—"}
                                </span>
                              </div>

                              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <div className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)]/90 p-2">
                                  <p className="mashwar-arabic text-[9px] text-[var(--clr-slate)]" dir="rtl">
                                    اليوم
                                  </p>
                                  <p className="mashwar-mono mt-1 text-[11px] font-semibold text-[var(--clr-white)]">
                                    {entry.item?.dayOfWeek ?? "—"}
                                  </p>
                                </div>
                                <div className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)]/90 p-2">
                                  <p className="mashwar-arabic text-[9px] text-[var(--clr-slate)]" dir="rtl">
                                    الساعة
                                  </p>
                                  <p className="mashwar-data mt-1 text-[11px] font-semibold text-[var(--clr-white)]">
                                    {formatTravelWindowHour(entry.item?.hour ?? null)}
                                  </p>
                                </div>
                                <div className="col-span-2 rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)]/90 p-2 sm:col-span-2">
                                  <p className="mashwar-arabic text-[9px] text-[var(--clr-slate)]" dir="rtl">
                                    الموعد المستهدف
                                  </p>
                                  <p className="mashwar-data mt-1 text-[11px] font-semibold text-[var(--clr-white)]">
                                    {formatForecastDateTime(entry.item?.targetDateTime ?? null)}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg)]/80 p-2.5">
                                  <p className="mashwar-arabic text-[10px] font-semibold text-[var(--clr-sand)]" dir="rtl">
                                    دخول
                                  </p>
                                  <p className="mashwar-arabic mt-1 text-[13px] font-semibold text-[var(--clr-white)]" dir="rtl">
                                    {entry.item?.enteringPrediction?.predictedStatus ?? "—"}
                                  </p>
                                  <p className="mashwar-arabic mt-1 text-[10px] text-[var(--clr-slate)]" dir="rtl">
                                    ثقة {formatForecastConfidence(entry.item?.enteringPrediction?.confidence ?? null)}
                                  </p>
                                </div>
                                <div className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg)]/80 p-2.5">
                                  <p className="mashwar-arabic text-[10px] font-semibold text-[var(--clr-sand)]" dir="rtl">
                                    خروج
                                  </p>
                                  <p className="mashwar-arabic mt-1 text-[13px] font-semibold text-[var(--clr-white)]" dir="rtl">
                                    {entry.item?.leavingPrediction?.predictedStatus ?? "—"}
                                  </p>
                                  <p className="mashwar-arabic mt-1 text-[10px] text-[var(--clr-slate)]" dir="rtl">
                                    ثقة {formatForecastConfidence(entry.item?.leavingPrediction?.confidence ?? null)}
                                  </p>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    </details>
                  ) : null}

                  <p className="mashwar-arabic mt-3 text-[12px] leading-snug text-[var(--clr-slate)]" dir="rtl">
                    {forecastRows.length > 0
                      ? `${forecastRows.length} فترات زمنية (دخول وخروج).`
                      : isForecastLoading
                        ? "جاري تحميل التوقعات…"
                        : "بانتظار بيانات الخط الزمني للتوقعات."}
                  </p>

                  {forecastError ? (
                    <p
                      className="mashwar-arabic mt-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-[12px] leading-snug text-[var(--clr-white)]"
                      style={{ borderColor: "var(--risk-high)", backgroundColor: "var(--risk-high-bg)" }}
                      dir="rtl"
                      role="alert"
                    >
                      {forecastError}
                    </p>
                  ) : null}

                  {isForecastLoading ? (
                    <p className="mashwar-arabic mt-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] px-3 py-2.5 text-[12px] text-[var(--clr-sand)]" dir="rtl">
                      جاري تقدير سلوك الحاجز…
                    </p>
                  ) : null}

                  <div className="mt-3 space-y-2">
                    {forecastRows.length > 0 ? (
                      forecastRows.map((row) => <ForecastHorizonCard key={row.horizon} row={row} />)
                    ) : (
                      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--glass-border)] px-3 py-4 text-center">
                        <p className="mashwar-arabic text-[12px] text-[var(--clr-slate)]" dir="rtl">
                          لا توجد صفوف توقع لهذا الحاجز بعد.
                        </p>
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
        onClose={() => {
          setIsNaturalRouteModalOpen(false);
          setSmartRouterOn(false);
        }}
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
