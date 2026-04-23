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
import {
  DEMO_ROUTE_REQUEST,
  hasValidCoordinates,
  getWorstStatus,
} from "@/lib/config/map";
import { getCheckpoints } from "@/lib/services/checkpoints";
import { getCheckpointForecast } from "@/lib/services/forecast";
import { getRoute } from "@/lib/services/routing";
import type {
  CheckpointForecastStatusType,
  MapCheckpoint,
  MapCheckpointStatus,
  NormalizedCheckpointForecast,
  NormalizedRoutes,
  RoutePoint,
  UserLocation,
} from "@/lib/types/map";

const EMPTY_ROUTES: NormalizedRoutes = {
  mainRoute: null,
  alternativeRoutes: [],
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
    dot: "#22c55e",
    border: "#166534",
    bg: "#0d1f15",
    text: "#86efac",
    softBg: "rgba(34, 197, 94, 0.12)",
  },
  "أزمة متوسطة": {
    ar: "أزمة متوسطة",
    en: "SLOW",
    dot: "#f59e0b",
    border: "#92400e",
    bg: "#241a09",
    text: "#fbbf24",
    softBg: "rgba(245, 158, 11, 0.12)",
  },
  "أزمة خانقة": {
    ar: "أزمة خانقة",
    en: "HEAVY",
    dot: "#f97316",
    border: "#c2410c",
    bg: "#261307",
    text: "#fdba74",
    softBg: "rgba(249, 115, 22, 0.12)",
  },
  مغلق: {
    ar: "مغلق",
    en: "CLOSED",
    dot: "#ef4444",
    border: "#b91c1c",
    bg: "#1f0a0a",
    text: "#fca5a5",
    softBg: "rgba(239, 68, 68, 0.12)",
  },
  "غير معروف": {
    ar: "غير معروف",
    en: "UNKNOWN",
    dot: "#94a3b8",
    border: "#475569",
    bg: "#12151a",
    text: "#cbd5e1",
    softBg: "rgba(148, 163, 184, 0.12)",
  },
};

function getConfidenceTone(confidence: number | null): {
  color: string;
  label: string;
} {
  if (confidence === null) {
    return { color: "#6b7280", label: "n/a" };
  }

  if (confidence > 90) {
    return { color: "#86efac", label: `${Math.round(confidence * 100)}%` };
  }

  if (confidence >= 80) {
    return { color: "#22c55e", label: `${Math.round(confidence * 100)}%` };
  }

  return { color: "#f59e0b", label: `${Math.round(confidence * 100)}%` };
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
    timeZone: "UTC",
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
  selection: { kind: "current-location" } | { kind: "checkpoint"; checkpointId: string } | null,
  checkpointsById: Map<string, MapCheckpoint>,
  userLocation: UserLocation | null,
): string {
  if (!selection) {
    return "غير محدد";
  }

  if (selection.kind === "current-location") {
    return userLocation ? "الحالي" : "غير محدد";
  }

  return checkpointsById.get(selection.checkpointId)?.name ?? "غير محدد";
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
      className={`mashwar-pill inline-flex items-center gap-2 border ${compact ? "px-2.5 py-1" : "px-3 py-1.5"}`}
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
      className={`mashwar-pill inline-flex items-center rounded-full bg-[#0a0b0d] px-3 py-1 ${className}`}
      style={{ color: tone.color, border: "1px solid rgba(255,255,255,0.08)" }}
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
  onClear,
}: {
  label: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <div className="relative rounded-[8px] border border-[#2d3139] bg-[#1a1d24] px-3 py-2.5 transition-all duration-150 hover:bg-[#1d2129]">
      <button
        type="button"
        onClick={onClear}
        className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-transparent text-[#6b7280] transition hover:border-white/10 hover:bg-white/5 hover:text-[#f9fafb]"
        aria-label={`Clear ${label}`}
      >
        <span className="text-[15px] leading-none">×</span>
      </button>
      <p className="mashwar-mono text-[10px] uppercase tracking-[0.26em] text-[#6b7280]">
        {label}
      </p>
      <div className="mt-2 min-h-[26px] pr-6 text-[15px] font-medium text-[#f9fafb] mashwar-rtl">
        {value || "غير محدد"}
      </div>
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
      ? "text-[#22c55e]"
      : tone === "amber"
        ? "text-[#f59e0b]"
        : "text-[#cbd5e1]";

  const dotColor =
    tone === "green"
      ? "#22c55e"
      : tone === "amber"
        ? "#f59e0b"
        : "#64748b";

  return (
    <span className="mashwar-pill inline-flex items-center gap-2 border border-[#2d3139] bg-[#111318] px-3 py-1.5 text-[11px] text-[#cbd5e1]">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
      <span className={`mashwar-mono ${toneClass}`}>{value}</span>
      <span className="text-[#94a3b8]">{label}</span>
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
    <article className="rounded-[8px] bg-[#111318] p-3 transition-all duration-150 hover:bg-[#15181e]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="mashwar-pill border border-[#2148b6]/40 bg-[#0f172a] px-2.5 py-1 text-[11px] text-[#60a5fa]">
              <span className="mashwar-mono">{getForecastHorizonLabel(row.horizon)}</span>
            </span>
            <span className="mashwar-mono text-[10px] uppercase tracking-[0.18em] text-[#6b7280]">
              {formatForecastDateTime(row.targetDateTime)}
            </span>
          </div>
        </div>
        <span className="mashwar-mono text-[10px] uppercase tracking-[0.18em] text-[#6b7280]">
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
              className={`rounded-[8px] border border-white/5 bg-[#0a0b0d] p-2.5 ${item ? "" : "opacity-55"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="mashwar-mono text-[9px] uppercase tracking-[0.18em] text-[#6b7280]">
                  {getDirectionalStatusLabel(direction)}
                </span>
                <StatusPill status={item?.prediction.predictedStatus ?? "غير معروف"} compact />
              </div>

              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[18px] font-bold" style={{ color: item ? visual.text : "#94a3b8" }}>
                  {item ? visual.ar : "—"}
                </span>
                <span className="mashwar-mono text-[11px]" style={{ color: tone?.color ?? "#94a3b8" }}>
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
  const [isRoutePending, startRouteTransition] = useTransition();
  const [checkpointReloadNonce, setCheckpointReloadNonce] = useState(0);
  const [routeFrom, setRouteFrom] = useState<
    { kind: "current-location" } | { kind: "checkpoint"; checkpointId: string } | null
  >(null);
  const [routeTo, setRouteTo] = useState<
    { kind: "checkpoint"; checkpointId: string } | null
  >(null);
  const checkpointForecastRequestNonce = useRef(0);
  const selectedCheckpointIdRef = useRef<string | null>(null);

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
    return new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  }, [checkpoints]);

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

  const selectedCheckpointStatusVisual = selectedCheckpointStatus
    ? STATUS_VISUALS[selectedCheckpointStatus]
    : STATUS_VISUALS["غير معروف"];
  const enteringVisual = selectedCheckpoint
    ? STATUS_VISUALS[selectedCheckpoint.enteringStatus]
    : STATUS_VISUALS["غير معروف"];
  const leavingVisual = selectedCheckpoint
    ? STATUS_VISUALS[selectedCheckpoint.leavingStatus]
    : STATUS_VISUALS["غير معروف"];

  function handleLoadDemoRoute(): void {
    setRouteError(null);

    startRouteTransition(() => {
      void (async () => {
        try {
          const nextRoutes = await getRoute(DEMO_ROUTE_REQUEST);
          setRoutes(nextRoutes);
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
  }

  function handleRouteButtonClick(): void {
    if (routes.mainRoute) {
      handleClearRoute();
      return;
    }

    const resolvedFrom = resolveRoutePoint(routeFrom, checkpointsById, userLocation);
    const resolvedTo = resolveRoutePoint(routeTo, checkpointsById, userLocation);

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
      resolvedFrom.lat === resolvedTo.lat &&
      resolvedFrom.lng === resolvedTo.lng
    ) {
      setRouteError("Choose two different endpoints for the route.");
      return;
    }

    setRouteError(null);

    startRouteTransition(() => {
      void (async () => {
        try {
          const nextRoutes = await getRoute({
            startPoint: resolvedFrom,
            endPoint: resolvedTo,
          });
          setRoutes(nextRoutes);
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
  }, [selectedCheckpoint]);

  const handleUseCurrentLocationAsOrigin = useCallback(() => {
    if (!userLocation) {
      setRouteError("Sync your location first before using it as the origin.");
      return;
    }

    setRouteError(null);
    setRouteFrom({ kind: "current-location" });
  }, [userLocation]);

  const routeFromLabel = formatSelectionLabel(routeFrom, checkpointsById, userLocation);
  const routeToLabel = routeTo
    ? formatSelectionLabel(routeTo, checkpointsById, userLocation)
    : "غير محدد";

  const checkpointStatusText = selectedCheckpointStatus
    ? `${selectedCheckpointStatusVisual.ar} · ${selectedCheckpointStatusVisual.en}`
    : "غير معروف · UNKNOWN";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_32%),linear-gradient(180deg,#0a0b0d_0%,#090a0c_100%)] text-[#f9fafb]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,197,94,0.08),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.12),transparent_26%),radial-gradient(circle_at_bottom,rgba(239,68,68,0.08),transparent_24%)]" />

      <MapView
        checkpoints={checkpoints}
        routes={routes}
        userLocation={userLocation}
        onCheckpointSelect={handleCheckpointSelect}
      />

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(10,11,13,0.16),rgba(10,11,13,0.34))]" />

      <aside className="pointer-events-auto absolute left-4 top-4 z-20 w-[min(calc(100vw-2rem),26rem)]">
        <section className="mashwar-panel overflow-hidden">
          <div className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="mashwar-mono text-[10px] uppercase tracking-[0.34em] text-[#6b7280]">
                  ROUTING
                </p>
                <h2 className="mt-2 mashwar-rtl text-[18px] font-bold text-[#f9fafb]">
                  من - إلى
                </h2>
              </div>

              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0a0b0d] px-3 py-1 text-[11px] font-semibold text-[#d1fae5]">
                <span className="h-2 w-2 rounded-full bg-[#22c55e] shadow-[0_0_0_0_rgba(34,197,94,0.45)] animate-pulse" />
                <span className="mashwar-mono">Ready</span>
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <EndpointChip
                label="من"
                value={routeFromLabel}
                onClear={() => setRouteFrom(null)}
              />
              <EndpointChip
                label="إلى"
                value={routeToLabel}
                onClear={() => setRouteTo(null)}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleUseCurrentLocationAsOrigin}
                disabled={!userLocation}
                className="rounded-[6px] border border-[#2d3139] bg-[#0a0b0d] px-3 py-2 text-[11px] text-[#cbd5e1] transition-all duration-150 hover:bg-[#1a1d24] disabled:cursor-not-allowed disabled:opacity-45"
              >
                الحالي
              </button>
              <button
                type="button"
                onClick={handleUseSelectedCheckpointAsOrigin}
                disabled={!selectedCheckpoint}
                className="rounded-[6px] border border-[#2d3139] bg-[#0a0b0d] px-3 py-2 text-[11px] text-[#cbd5e1] transition-all duration-150 hover:bg-[#1a1d24] disabled:cursor-not-allowed disabled:opacity-45"
              >
                استخدم كمن
              </button>
              <button
                type="button"
                onClick={handleUseSelectedCheckpointAsDestination}
                disabled={!selectedCheckpoint}
                className="rounded-[6px] border border-[#2d3139] bg-[#0a0b0d] px-3 py-2 text-[11px] text-[#cbd5e1] transition-all duration-150 hover:bg-[#1a1d24] disabled:cursor-not-allowed disabled:opacity-45"
              >
                استخدم كإلى
              </button>
            </div>

            <button
              type="button"
              onClick={handleRouteButtonClick}
              disabled={isRoutePending}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-[#3b82f6] px-4 text-sm font-semibold text-white transition-all duration-150 hover:bg-[#4f8df7] disabled:cursor-wait disabled:opacity-70"
            >
              <span>{routes.mainRoute ? "Route" : "Route"}</span>
              {routes.mainRoute ? (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/12 text-[12px] leading-none">
                  ×
                </span>
              ) : null}
            </button>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#6b7280]">
              {routeError ? (
                <span className="rounded-full border border-[#2d3139] bg-[#0a0b0d] px-3 py-1 text-[#fca5a5]">
                  {routeError}
                </span>
              ) : null}
              {locationError ? (
                <span className="rounded-full border border-[#2d3139] bg-[#0a0b0d] px-3 py-1 text-[#fca5a5]">
                  {locationError}
                </span>
              ) : null}
            </div>
          </div>

          <div className="border-t border-white/6" />

          <div className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-medium text-[#f9fafb]">
                  West Bank Map
                </h3>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#2d3139] bg-[#0a0b0d] px-3 py-1.5 text-[11px] text-[#cbd5e1]">
                  <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
                  <span className="mashwar-mono">{checkpoints.length}</span>
                  <span>checkpoints loaded</span>
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
                className="rounded-[6px] border border-[#2d3139] bg-transparent px-3 py-2 text-sm text-[#f9fafb] transition-all duration-150 hover:bg-[#1a1d24]"
              >
                Natural Route Brief
              </button>
              <button
                type="button"
                onClick={handleLoadDemoRoute}
                disabled={isRoutePending}
                className="rounded-[6px] border border-[#2d3139] bg-transparent px-3 py-2 text-sm text-[#f9fafb] transition-all duration-150 hover:bg-[#1a1d24] disabled:cursor-wait disabled:opacity-55"
              >
                Load Demo Route
              </button>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px]">
              <button
                type="button"
                onClick={handleRetryCheckpoints}
                className="text-[#6b7280] underline-offset-4 transition hover:text-[#e5e7eb] hover:underline"
              >
                Retry Checkpoints
              </button>
              <button
                type="button"
                onClick={handleSyncLocation}
                disabled={isSyncingLocation}
                className="text-[#6b7280] underline-offset-4 transition hover:text-[#e5e7eb] hover:underline disabled:cursor-wait disabled:opacity-55"
              >
                {isSyncingLocation ? "Syncing Location..." : "Sync Location"}
              </button>
            </div>

            <div className="space-y-2 text-[12px] leading-6 text-[#94a3b8]">
              {isLoadingCheckpoints ? (
                <p>Loading checkpoint intelligence from the Geo API.</p>
              ) : (
                <p>Clustered checkpoint points are live and ready for selection.</p>
              )}

              {!isLoadingCheckpoints && checkpointError ? (
                <p className="text-[#fca5a5]">{checkpointError}</p>
              ) : null}

              {!isLoadingCheckpoints && routeError ? (
                <p className="text-[#fca5a5]">{routeError}</p>
              ) : null}

              {!isLoadingCheckpoints && checkpointsWithoutCoordinates.length > 0 ? (
                <p>
                  {checkpointsWithoutCoordinates.length} checkpoint
                  {checkpointsWithoutCoordinates.length === 1 ? "" : "s"} are missing
                  coordinates and stay out of the map layer.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </aside>

      <aside
        className="pointer-events-auto fixed bottom-4 left-4 z-30 w-[min(calc(100vw-2rem),21.25rem)]"
        aria-hidden={!selectedCheckpoint}
      >
        {selectedCheckpoint ? (
          <section
            className="mashwar-panel max-h-[calc(100dvh-8rem)] overflow-hidden"
            style={{ animation: "mashwar-panel-in-left 220ms ease-out" }}
          >
            <div className="mashwar-scroll max-h-[calc(100dvh-8rem)] overflow-y-auto">
              <div className="border-b border-white/6 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="mashwar-mono text-[10px] uppercase tracking-[0.34em] text-[#6b7280]">
                      CHECKPOINT
                    </p>
                    <h2 className="mt-2 mashwar-rtl text-[22px] font-bold text-[#f9fafb]">
                      {selectedCheckpoint.name}
                    </h2>
                    <div className="mt-3">
                      <StatusPill status={selectedCheckpointStatus ?? "غير معروف"} />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCheckpointSelect(null)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#2d3139] text-[#6b7280] transition hover:bg-[#1a1d24] hover:text-[#f9fafb]"
                    aria-label="Close checkpoint panel"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="space-y-4 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["ENTERING", selectedCheckpoint.enteringStatus, enteringVisual],
                    ["LEAVING", selectedCheckpoint.leavingStatus, leavingVisual],
                  ] as const).map(([label, status, visual]) => (
                    <section
                      key={label}
                      className="rounded-[8px] bg-[#111318] p-3"
                    >
                      <p className="mashwar-mono text-[9px] uppercase tracking-[0.28em] text-[#6b7280]">
                        {label}
                      </p>
                      <p
                        className="mt-2 text-[18px] font-bold"
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
                          className="rounded-[6px] border border-[#2d3139] px-2.5 py-1 text-[11px] text-[#cbd5e1] transition hover:bg-[#1a1d24]"
                        >
                          استخدم كمن
                        </button>
                        <button
                          type="button"
                          onClick={handleUseSelectedCheckpointAsDestination}
                          className="rounded-[6px] border border-[#2d3139] px-2.5 py-1 text-[11px] text-[#cbd5e1] transition hover:bg-[#1a1d24]"
                        >
                          استخدم كإلى
                        </button>
                      </div>
                    </section>
                  ))}
                </div>

                <section className="rounded-[8px] bg-[#111318] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                        FORECAST
                      </p>
                    </div>
                    <span className="mashwar-pill inline-flex items-center gap-2 border border-[#14532d] bg-[#0d1f15] px-3 py-1 text-[#86efac]">
                      <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
                      Updated
                    </span>
                  </div>

                  <p className="mt-2 mashwar-mono text-[10px] uppercase tracking-[0.22em] text-[#f59e0b]">
                    Captured {formatForecastDateTime(selectedCheckpointForecast?.request.asOf ?? null)}
                  </p>
                  <p className="mt-2 text-[12px] text-[#94a3b8]">
                    {forecastRows.length > 0
                      ? `${forecastRows.length} horizons with entering and leaving predictions`
                      : isForecastLoading
                        ? "Loading forecast horizons..."
                        : "Forecast timeline is waiting for data."}
                  </p>

                  {forecastError ? (
                    <p className="mt-3 rounded-[8px] border border-[#2d3139] bg-[#0a0b0d] px-3 py-2 text-[12px] text-[#fca5a5]">
                      {forecastError}
                    </p>
                  ) : null}

                  {isForecastLoading ? (
                    <p className="mt-3 rounded-[8px] border border-[#2d3139] bg-[#0a0b0d] px-3 py-2 text-[12px] text-[#cbd5e1]">
                      Forecasting checkpoint behavior.
                    </p>
                  ) : null}

                  <div className="mt-3 space-y-1.5">
                    {forecastRows.length > 0 ? (
                      forecastRows.map((row) => <ForecastEntry key={row.horizon} row={row} />)
                    ) : (
                      <div className="rounded-[8px] border border-dashed border-white/6 bg-[#0a0b0d] px-3 py-3 text-[12px] text-[#64748b]">
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
        onClose={() => setIsNaturalRouteModalOpen(false)}
      />
    </main>
  );
}

function resolveRoutePoint(
  selection:
    | { kind: "current-location" }
    | { kind: "checkpoint"; checkpointId: string }
    | null,
  checkpointsById: Map<string, MapCheckpoint>,
  userLocation: UserLocation | null,
): RoutePoint | null {
  if (!selection) {
    return null;
  }

  if (selection.kind === "current-location") {
    if (!userLocation) {
      return null;
    }

    return {
      lat: userLocation.lat,
      lng: userLocation.lng,
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
    lat: checkpoint.latitude,
    lng: checkpoint.longitude,
  };
}
