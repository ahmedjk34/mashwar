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
import { FaBrain, FaFire } from "react-icons/fa";
import { IoClose } from "react-icons/io5";
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
  const [isSyncingLocation, setIsSyncingLocation] = useState(false);
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
        setRouteFrom({ kind: "current-location" });
        setRouteError(null);
        setEndpointPlacementMode(null);
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

        setLocationError("Unable to read your location right now.");
      },
      DEFAULT_GEO_OPTIONS,
    );
  }, []);

  const handleGpsAsTo = useCallback(() => {
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError("Location access is not supported in this browser.");
      return;
    }

    setIsSyncingLocation(true);

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
        setRouteError(null);
        setEndpointPlacementMode(null);
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

        setLocationError("Unable to read your location right now.");
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

      <div
        className="fixed left-1/2 top-5 z-[1100] w-[min(calc(100vw-24px),720px)] -translate-x-1/2 overflow-hidden rounded-full border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        style={{
          backgroundColor: "rgba(20,20,20,0.85)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          dir="ltr"
          className="flex max-w-full items-center gap-1 overflow-x-hidden px-2 py-1.5"
        >
          <button
            type="button"
            onClick={handleGpsAsFrom}
            disabled={isSyncingLocation}
            title="استخدام موقعي كنقطة انطلاق"
            aria-label="استخدام موقعي كنقطة انطلاق"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-emerald-400 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
          >
            <MdMyLocation className="h-5 w-5" aria-hidden />
          </button>

          <div className="flex min-w-0 shrink items-center gap-0.5 rounded-full bg-white/5 px-1 py-0.5">
            <button
              type="button"
              onClick={() => handleActivateEndpointPlacement("from")}
              className={`flex min-w-0 max-w-[min(42vw,200px)] flex-col rounded-full px-2.5 py-1.5 text-left transition ${
                endpointPlacementMode === "from"
                  ? "ring-2 ring-emerald-400/90 ring-offset-2 ring-offset-[rgba(20,20,20,0.85)]"
                  : "hover:bg-white/8"
              }`}
            >
              <span className="mashwar-mono text-[9px] uppercase tracking-[0.2em] text-white/45">
                من
              </span>
              <span dir="rtl" className="mashwar-arabic truncate text-[13px] font-medium text-white">
                {routeFromLabel}
              </span>
            </button>
            {routeFrom ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setRouteFrom(null);
                  setRouteError(null);
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
                aria-label="مسح نقطة الانطلاق"
              >
                <IoClose className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>

          <span className="shrink-0 px-0.5 text-lg font-semibold text-white/70" aria-hidden>
            →
          </span>

          <div className="flex min-w-0 shrink items-center gap-0.5 rounded-full bg-white/5 px-1 py-0.5">
            <button
              type="button"
              onClick={() => handleActivateEndpointPlacement("to")}
              className={`flex min-w-0 max-w-[min(42vw,200px)] flex-col rounded-full px-2.5 py-1.5 text-left transition ${
                endpointPlacementMode === "to"
                  ? "ring-2 ring-amber-400/90 ring-offset-2 ring-offset-[rgba(20,20,20,0.85)]"
                  : "hover:bg-white/8"
              }`}
            >
              <span className="mashwar-mono text-[9px] uppercase tracking-[0.2em] text-white/45">
                إلى
              </span>
              <span dir="rtl" className="mashwar-arabic truncate text-[13px] font-medium text-white">
                {routeToLabel}
              </span>
            </button>
            {routeTo ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setRouteTo(null);
                  setRouteError(null);
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
                aria-label="مسح الوجهة"
              >
                <IoClose className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleGpsAsTo}
            disabled={isSyncingLocation}
            title="استخدام موقعي كوجهة"
            aria-label="استخدام موقعي كوجهة"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-amber-300 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
          >
            <MdMyLocation className="h-5 w-5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={handleRouteButtonClick}
            disabled={isRoutePending}
            className="mashwar-arabic ms-1 shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"
          >
            {routePaths.length > 0 ? "مسح المسار" : "ابدأ التوجيه"}
          </button>
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

      <div className="fixed right-5 top-5 z-[1100] flex flex-col gap-2.5">
        <button
          type="button"
          onClick={handleSmartRouterCardClick}
          title="موجز المسار الذكي"
          aria-pressed={smartRouterOn}
          className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border text-lg text-white/90 shadow-lg transition ${
            smartRouterOn
              ? "border-emerald-400 bg-white/10 shadow-[0_0_0_1px_rgba(52,211,153,0.65),0_0_18px_rgba(52,211,153,0.35)]"
              : "border-white/15 bg-[rgba(20,20,20,0.85)] hover:bg-white/10"
          }`}
          style={{ backdropFilter: "blur(10px)" }}
        >
          <FaBrain className="h-5 w-5" aria-hidden />
        </button>

        <button
          type="button"
          onClick={handleToggleHeatmap}
          title="خريطة حرارية"
          aria-pressed={heatmapEnabled}
          className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border text-lg text-white/90 shadow-lg transition ${
            heatmapEnabled
              ? "border-amber-400 bg-white/10 shadow-[0_0_0_1px_rgba(251,191,36,0.65),0_0_18px_rgba(251,191,36,0.3)]"
              : "border-white/15 bg-[rgba(20,20,20,0.85)] hover:bg-white/10"
          }`}
          style={{ backdropFilter: "blur(10px)" }}
        >
          <FaFire
            className={`h-5 w-5 ${isHeatmapLoading || isHeatmapBuilding ? "animate-pulse" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      <aside className="pointer-events-auto fixed bottom-6 left-4 right-4 z-[1050] mx-auto w-full max-w-2xl">
        {selectedCheckpoint ? (
          <section
            className="mashwar-panel max-h-[min(520px,calc(100dvh-7rem))] overflow-hidden"
            style={{ animation: "mashwar-panel-in-left 220ms ease-out" }}
          >
            <div className="mashwar-scroll max-h-[min(520px,calc(100dvh-7rem))] overflow-y-auto overflow-x-hidden">
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
