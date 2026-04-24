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
import NaturalLanguageRouteModal from "@/components/map/NaturalLanguageRouteModal";
import TradeoffExplainerModal from "@/components/map/TradeoffExplainerModal";
import {
  DEMO_ROUTE_REQUEST,
  hasValidCoordinates,
  getStatusColor,
  getWorstStatus,
} from "@/lib/config/map";
import { getCheckpoints } from "@/lib/services/checkpoints";
import { getCheckpointForecast } from "@/lib/services/forecast";
import { getRoute } from "@/lib/services/routing";
import { formatDateTimeInPalestine } from "@/lib/utils/palestine-time";
import type {
  CheckpointForecastStatusType,
  MapCheckpoint,
  RoutePoint,
  NormalizedCheckpointForecast,
  NormalizedRoutes,
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

function getStatusUi(status: ReturnType<typeof getWorstStatus>) {
  switch (status) {
    case "سالك":
      return {
        chipLabel: "Open",
        sectionLabel: "Low risk",
        accent: "#16a34a",
        softBg: "#eaf8ef",
        softText: "#166534",
      };
    case "أزمة متوسطة":
      return {
        chipLabel: "Slow",
        sectionLabel: "Moderate delay",
        accent: "#f59e0b",
        softBg: "#fff5e8",
        softText: "#b45309",
      };
    case "أزمة خانقة":
      return {
        chipLabel: "Heavy",
        sectionLabel: "Severe delay",
        accent: "#f97316",
        softBg: "#fff0e8",
        softText: "#c2410c",
      };
    case "مغلق":
      return {
        chipLabel: "Closed",
        sectionLabel: "Blocked",
        accent: "#ef4444",
        softBg: "#fef0f0",
        softText: "#b91c1c",
      };
    default:
      return {
        chipLabel: "Unknown",
        sectionLabel: "Status unclear",
        accent: "#94a3b8",
        softBg: "#f1f5f9",
        softText: "#475569",
      };
  }
}

function getDirectionalStatusLabel(direction: "entering" | "leaving") {
  return direction === "entering" ? "Entering" : "Leaving";
}

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

function getForecastHorizonLabel(horizon: string): string {
  switch (horizon) {
    case "plus_30m":
      return "+30m";
    case "plus_1h":
      return "+1h";
    case "plus_2h":
      return "+2h";
    case "next_day_8am":
      return "Next day 08:00 Palestine";
    default:
      return horizon;
  }
}

function formatForecastDateTime(value: string | null): string {
  return formatDateTimeInPalestine(value);
}

function formatForecastConfidence(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return `${Math.round(value * 100)}%`;
}

type RouteEndpointSelection =
  | { kind: "current-location" }
  | { kind: "checkpoint"; checkpointId: string };

interface ResolvedRouteEndpoint {
  point: RoutePoint;
  city: string | null;
}

function getRouteSelectionLabel(
  selection: RouteEndpointSelection | null,
  checkpointsById: Map<string, MapCheckpoint>,
): string {
  if (!selection) {
    return "غير محدد";
  }

  if (selection.kind === "current-location") {
    return "الحالي";
  }

  const checkpoint = checkpointsById.get(selection.checkpointId);
  if (!checkpoint) {
    return "Checkpoint";
  }

  return checkpoint.city ? `${checkpoint.name} · ${checkpoint.city}` : checkpoint.name;
}

function resolveRouteEndpoint(
  selection: RouteEndpointSelection | null,
  checkpointsById: Map<string, MapCheckpoint>,
  userLocation: UserLocation | null,
): ResolvedRouteEndpoint | null {
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

  const checkpoint = checkpointsById.get(selection.checkpointId);
  if (
    !checkpoint ||
    !hasValidCoordinates(checkpoint.latitude, checkpoint.longitude)
  ) {
    return null;
  }

  const latitude = checkpoint.latitude;
  const longitude = checkpoint.longitude;
  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    point: {
      lat: latitude,
      lng: longitude,
    },
    city: checkpoint.city,
  };
}

export default function MapHome() {
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
  const [routeFrom, setRouteFrom] = useState<RouteEndpointSelection | null>(
    null,
  );
  const [routeTo, setRouteTo] = useState<RouteEndpointSelection | null>(null);
  const checkpointForecastRequestNonce = useRef(0);
  const selectedCheckpointIdRef = useRef<string | null>(null);

  const handleSelectRoute = useCallback((routeId: string) => {
    setRoutes((current) => ({
      ...current,
      selectedRouteId: routeId,
    }));
  }, []);

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

  const coordinateMissingExamples = useMemo(() => {
    return checkpointsWithoutCoordinates
      .slice(0, 3)
      .map((checkpoint) => checkpoint.name)
      .join(" • ");
  }, [checkpointsWithoutCoordinates]);

  const checkpointsById = useMemo(() => {
    return new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  }, [checkpoints]);

  const selectedCheckpointStatus = selectedCheckpoint
    ? getWorstStatus(
        selectedCheckpoint.enteringStatus,
        selectedCheckpoint.leavingStatus,
      )
    : null;
  const selectedCheckpointStatusUi = selectedCheckpointStatus
    ? getStatusUi(selectedCheckpointStatus)
    : null;
  const enteringStatusUi = selectedCheckpoint
    ? getStatusUi(selectedCheckpoint.enteringStatus)
    : null;
  const leavingStatusUi = selectedCheckpoint
    ? getStatusUi(selectedCheckpoint.leavingStatus)
    : null;
  const forecastRows = useMemo(
    () => buildForecastRows(selectedCheckpointForecast),
    [selectedCheckpointForecast],
  );

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
    setRouteFrom(null);
    setRouteTo(null);
    setRoutes(EMPTY_ROUTES);
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

  const handleBuildRoute = useCallback(() => {
    setRouteError(null);

    const resolvedFrom = resolveRouteEndpoint(routeFrom, checkpointsById, userLocation);
    const resolvedTo = resolveRouteEndpoint(routeTo, checkpointsById, userLocation);

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
        } catch (error) {
          setRouteError(
            error instanceof Error
              ? error.message
              : "Unable to load route data.",
          );
        }
      })();
    });
  }, [checkpointsById, routeFrom, routeTo, startRouteTransition, userLocation]);

  const routeFromLabel = getRouteSelectionLabel(routeFrom, checkpointsById);
  const routeToLabel = getRouteSelectionLabel(routeTo, checkpointsById);

  return (
    <main className="relative flex min-h-screen flex-1 overflow-hidden bg-[#f3f5ef]">
      <MapView
        checkpoints={checkpoints}
        routes={routes}
        departAt={routes.departAt}
        userLocation={userLocation}
        onCheckpointSelect={handleCheckpointSelect}
        onRouteSelect={handleSelectRoute}
      />

      <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-col gap-3">
        <section className="pointer-events-auto w-full max-w-4xl rounded-[30px] border border-white/55 bg-white/72 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-black/45">
                Routing
              </p>
              <h2 className="text-lg font-semibold text-black">من - إلى</h2>
              <p className="text-sm text-black/60">
                Route between checkpoints, or start from your current synced
                location.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-medium text-[#1d4ed8]">
              <span className="h-2 w-2 rounded-full bg-[#2563eb]" />
              {isRoutePending ? "Building route" : "Ready"}
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1.2fr_auto]">
            <div className="rounded-3xl border border-white/60 bg-white/55 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-black/40">
                    من
                  </p>
                  <p className="mt-2 text-base font-semibold text-black">
                    {routeFromLabel}
                  </p>
                </div>

                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                  style={{
                    backgroundColor:
                      routeFrom?.kind === "current-location"
                        ? "#dbeafe"
                        : "#eef2ff",
                    color:
                      routeFrom?.kind === "current-location"
                        ? "#1d4ed8"
                        : "#4338ca",
                  }}
                >
                  {routeFrom?.kind === "current-location"
                    ? "الحالي"
                    : routeFrom
                      ? "Checkpoint"
                      : "Unset"}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleUseCurrentLocationAsOrigin}
                    className="rounded-full border border-sky-200/70 bg-white/65 px-3 py-2 text-sm font-medium text-sky-900 transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!userLocation}
                >
                  الحالي
                </button>
                {selectedCheckpoint ? (
                  <button
                    type="button"
                    onClick={handleUseSelectedCheckpointAsOrigin}
                    className="rounded-full border border-white/60 bg-white/65 px-3 py-2 text-sm font-medium text-black transition hover:bg-white/80"
                  >
                    التحديد كمن
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-3xl border border-white/60 bg-white/55 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-black/40">
                    إلى
                  </p>
                  <p className="mt-2 text-base font-semibold text-black">
                    {routeToLabel}
                  </p>
                </div>

                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                  style={{
                    backgroundColor: routeTo ? "#ecfeff" : "#f1f5f9",
                    color: routeTo ? "#155e75" : "#475569",
                  }}
                >
                  {routeTo ? "Selected" : "Unset"}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {selectedCheckpoint ? (
                  <button
                    type="button"
                    onClick={handleUseSelectedCheckpointAsDestination}
                    className="rounded-full border border-white/60 bg-white/65 px-3 py-2 text-sm font-medium text-black transition hover:bg-white/80"
                  >
                    التحديد كإلى
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-3xl border border-black/6 bg-[linear-gradient(135deg,#0f172a,#1d4ed8)] p-4 text-white">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/70">
                  Action
                </p>
                <p className="text-sm text-white/75">
                  Build the route after picking both endpoints.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleBuildRoute}
                  disabled={isRoutePending}
                  className="rounded-full border border-white/60 bg-white/75 px-4 py-2 text-sm font-semibold text-[#0f172a] transition hover:bg-white/90 disabled:cursor-wait disabled:opacity-60"
                >
                  {isRoutePending ? "Routing..." : "Route"}
                </button>
                <button
                  type="button"
                  onClick={handleClearRoute}
                  className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/18"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-black/55">
            <span className="rounded-full bg-black/[0.04] px-2.5 py-1">
              Route from checkpoints by default
            </span>
            <span className="rounded-full bg-black/[0.04] px-2.5 py-1">
              Current location only works for من
            </span>
          </div>
        </section>

        <section className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/55 bg-white/70 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-black/45">
                Mashwar Web Base
              </p>
              <h1 className="text-lg font-semibold text-black">
                West Bank Map
              </h1>
              <p className="text-sm text-black/65">
                MapLibre base using the React Native map rules, tile source, and
                routing shape.
              </p>
            </div>

            <div className="rounded-full bg-[#eef5e8] px-3 py-1 text-xs font-medium text-[#365314]">
              {checkpoints.length} current checkpoints
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsNaturalRouteModalOpen(true)}
              className="rounded-full bg-[linear-gradient(135deg,#0f172a,#1d4ed8)] px-4 py-2 text-sm font-medium text-white shadow-[0_10px_30px_rgba(37,99,235,0.28)] transition hover:shadow-[0_12px_36px_rgba(37,99,235,0.36)]"
            >
              Natural route brief
            </button>
            <button
              type="button"
              onClick={handleLoadDemoRoute}
              disabled={isRoutePending}
              className="rounded-full bg-[#111827] px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-60"
            >
              {isRoutePending ? "Loading route..." : "Load demo route"}
            </button>
            <button
              type="button"
              onClick={handleRetryCheckpoints}
              className="rounded-full border border-white/60 bg-white/65 px-4 py-2 text-sm font-medium text-black transition hover:bg-white/80"
            >
              Retry checkpoints
            </button>
            <button
              type="button"
              onClick={handleSyncLocation}
              disabled={isSyncingLocation}
              className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-900 transition hover:bg-sky-100 disabled:cursor-wait disabled:opacity-60"
            >
              {isSyncingLocation ? "Syncing location..." : "Sync location"}
            </button>
          </div>

          <div className="mt-4 space-y-2 text-sm text-black/70">
            <p>
              {isLoadingCheckpoints
                ? "Loading current checkpoints from the backend contract in API_GUIDE.md..."
                : "Checkpoint dots are rendered through clustered GeoJSON layers using the backend's live entering/leaving statuses."}
            </p>

            {!isLoadingCheckpoints ? (
              <p>
                {mappableCheckpointCount} of {checkpoints.length} checkpoints have
                usable coordinates and can be drawn on the map.
              </p>
            ) : null}

            {!isLoadingCheckpoints &&
            checkpoints.length > 0 &&
            mappableCheckpointCount === 0 ? (
              <p className="rounded-xl border border-[#f59e0b]/30 bg-[#fff7ed] px-3 py-2 text-[#9a3412]">
                The backend returned {checkpoints.length} checkpoint
                {checkpoints.length === 1 ? "" : "s"}, but none include usable
                latitude/longitude values, so the map has nothing to draw yet.
                {coordinateMissingExamples
                  ? ` Examples: ${coordinateMissingExamples}.`
                  : ""}
              </p>
            ) : null}

            {!isLoadingCheckpoints &&
            checkpointsWithoutCoordinates.length > 0 &&
            mappableCheckpointCount > 0 ? (
              <p className="text-[#92400e]">
                {checkpointsWithoutCoordinates.length} checkpoint
                {checkpointsWithoutCoordinates.length === 1 ? "" : "s"} were
                skipped because they are missing coordinates.
              </p>
            ) : null}

            {routes.mainRoute ? (
              <p>
                Route rendered with {routes.alternativeRoutes.length} alternative
                {routes.alternativeRoutes.length === 1 ? "" : "s"}.
              </p>
            ) : (
              <p>No route loaded yet. Use the demo trigger to test line rendering.</p>
            )}

            {checkpointError ? (
              <p className="text-[#b91c1c]">{checkpointError}</p>
            ) : null}

            {routeError ? <p className="text-[#b91c1c]">{routeError}</p> : null}

            {userLocation ? (
              <p className="text-[#0f766e]">
                Location synced at {userLocation.lat.toFixed(5)},{" "}
                {userLocation.lng.toFixed(5)}. The map will zoom there.
              </p>
            ) : (
              <p className="text-black/55">
                Sync your location to center the map on your current position.
              </p>
            )}

            {locationError ? (
              <p className="text-[#b91c1c]">{locationError}</p>
            ) : null}
          </div>
        </section>
      </div>

      <NaturalLanguageRouteModal
        open={isNaturalRouteModalOpen}
        onClose={() => setIsNaturalRouteModalOpen(false)}
      />
      <TradeoffExplainerModal
        explainer={routes.tradeoffExplainer}
        selectedRouteId={routes.selectedRouteId}
        onRouteSelect={handleSelectRoute}
      />

      {selectedCheckpoint &&
      selectedCheckpointStatus &&
      selectedCheckpointStatusUi &&
      enteringStatusUi &&
      leavingStatusUi ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-start">
          <section className="pointer-events-auto w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[28px] border border-white/55 bg-white/58 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
            <div className="border-b border-white/40 bg-[linear-gradient(135deg,rgba(255,255,255,0.55),rgba(219,234,254,0.22))] px-5 py-3 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-black/40">
                    Checkpoint
                  </p>
                  <h2 className="mt-1 truncate text-lg font-semibold text-black">
                    {selectedCheckpoint.name}
                  </h2>
                </div>

                <div
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
                  style={{
                    backgroundColor: selectedCheckpointStatusUi.softBg,
                    color: selectedCheckpointStatusUi.softText,
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: selectedCheckpointStatusUi.accent,
                    }}
                  />
                  {selectedCheckpointStatusUi.chipLabel}
                </div>
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="rounded-2xl border border-white/60 bg-white/45 p-3 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                    style={{
                      backgroundColor: `${getStatusColor(selectedCheckpointStatus)}18`,
                    }}
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{
                        backgroundColor: getStatusColor(selectedCheckpointStatus),
                      }}
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/40">
                      Checkpoint overview
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-base font-semibold text-black">
                        {selectedCheckpointStatus}
                      </span>
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: selectedCheckpointStatusUi.softBg,
                          color: selectedCheckpointStatusUi.softText,
                        }}
                      >
                        {selectedCheckpointStatusUi.sectionLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/55 bg-white/60 px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] backdrop-blur-md">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: getStatusColor(
                              selectedCheckpoint.enteringStatus,
                            ),
                          }}
                        />
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/40">
                            {getDirectionalStatusLabel("entering")}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-black">
                            {selectedCheckpoint.enteringStatus}
                          </p>
                        </div>
                      </div>

                      <span
                        className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                        style={{
                          backgroundColor: enteringStatusUi.softBg,
                          color: enteringStatusUi.softText,
                        }}
                      >
                        {enteringStatusUi.chipLabel}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/55 bg-white/60 px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] backdrop-blur-md">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: getStatusColor(
                              selectedCheckpoint.leavingStatus,
                            ),
                          }}
                        />
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/40">
                            {getDirectionalStatusLabel("leaving")}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-black">
                            {selectedCheckpoint.leavingStatus}
                          </p>
                        </div>
                      </div>

                      <span
                        className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                        style={{
                          backgroundColor: leavingStatusUi.softBg,
                          color: leavingStatusUi.softText,
                        }}
                      >
                        {leavingStatusUi.chipLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleUseSelectedCheckpointAsOrigin}
                    className="rounded-full border border-white/60 bg-white/65 px-3 py-1.5 text-sm font-medium text-black transition hover:bg-white/80"
                  >
                    استخدم كمن
                  </button>
                  <button
                    type="button"
                    onClick={handleUseSelectedCheckpointAsDestination}
                    className="rounded-full border border-white/60 bg-white/65 px-3 py-1.5 text-sm font-medium text-black transition hover:bg-white/80"
                  >
                    استخدم كإلى
                  </button>
                </div>

                <div className="mt-3 rounded-2xl border border-white/55 bg-white/50 p-3 backdrop-blur-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-800/70">
                        Forecast
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {isForecastLoading
                          ? "Loading hourly forecast..."
                          : selectedCheckpointForecast
                            ? "Forecast grouped by hour."
                            : "Click a checkpoint to load the forecast timeline."}
                      </p>
                      {selectedCheckpointForecast ? (
                        <p className="mt-1.5 text-[11px] uppercase tracking-[0.18em] text-sky-800/55">
                          Captured {formatForecastDateTime(selectedCheckpointForecast.request.asOf)}
                        </p>
                      ) : null}
                    </div>

                    <div className="inline-flex items-center gap-2 rounded-full border border-white/55 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-md">
                      {isForecastLoading ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border border-slate-300 border-t-slate-700" />
                      ) : (
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: selectedCheckpointForecast
                              ? "#0f766e"
                              : "#cbd5e1",
                          }}
                        />
                      )}
                      <span>
                        {isForecastLoading
                          ? "Loading"
                          : selectedCheckpointForecast
                            ? "Updated"
                            : "Waiting"}
                      </span>
                    </div>
                  </div>

                  {forecastError ? (
                    <p className="mt-2.5 rounded-xl border border-white/55 bg-white/55 px-3 py-2 text-sm text-[#b91c1c] backdrop-blur-md">
                      {forecastError}
                    </p>
                  ) : null}

                  {isForecastLoading ? (
                    <div className="mt-2.5 rounded-xl border border-white/55 bg-white/60 px-3 py-2.5 text-sm text-slate-600 backdrop-blur-md">
                      Forecasting checkpoints by hour now.
                    </div>
                  ) : null}

                  {selectedCheckpointForecast ? (
                    <div className="mt-2.5 space-y-2">
                      <div className="rounded-2xl border border-white/55 bg-white/55 px-3 py-2 text-sm text-slate-600 backdrop-blur-md">
                        {forecastRows.length > 0
                          ? `Forecast returned ${forecastRows.length} horizon${forecastRows.length === 1 ? "" : "s"} with entering and leaving predictions.`
                          : "The forecast response did not include timeline items."}
                      </div>

                      <div className="space-y-2">
                        {forecastRows.length > 0 ? (
                          forecastRows.map((row) => {
                            const enteringUi = row.entering
                              ? getStatusUi(row.entering.prediction.predictedStatus)
                              : null;
                            const leavingUi = row.leaving
                              ? getStatusUi(row.leaving.prediction.predictedStatus)
                              : null;

                            return (
                              <article
                                key={row.horizon}
                                className="rounded-[18px] border border-white/55 bg-white/58 p-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] backdrop-blur-md"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-800/55">
                                      {getForecastHorizonLabel(row.horizon)}
                                    </p>
                                    <p className="mt-0.5 text-sm font-medium text-black">
                                      {formatForecastDateTime(row.targetDateTime)}
                                    </p>
                                  </div>

                                  <div className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                    {row.entering && row.leaving
                                      ? "Both"
                                      : row.entering
                                        ? "Entering"
                                        : row.leaving
                                          ? "Leaving"
                                          : "Pending"}
                                  </div>
                                </div>

                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                  {(["entering", "leaving"] as const).map((direction) => {
                                    const item = row[direction];
                                    const ui =
                                      direction === "entering"
                                        ? enteringUi
                                        : leavingUi;

                                    return (
                                      <div
                                        key={direction}
                                        className={`rounded-xl border p-2.5 backdrop-blur-md ${
                                          direction === "entering"
                                            ? "border-emerald-100/70 bg-emerald-50/35"
                                            : "border-amber-100/70 bg-amber-50/35"
                                        } ${item ? "" : "opacity-55"}`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-black/40">
                                            {getDirectionalStatusLabel(direction)}
                                          </p>
                                          <span
                                            className="rounded-full border border-white/50 bg-white/75 px-2 py-0.5 text-[10px] font-medium shadow-sm backdrop-blur-md"
                                            style={
                                              item && ui
                                                ? {
                                                    color: ui.softText,
                                                  }
                                                : undefined
                                            }
                                          >
                                            {item && ui ? ui.chipLabel : "Pending"}
                                          </span>
                                        </div>

                                        {item ? (
                                          <div className="mt-1.5 flex items-center gap-2">
                                            <span
                                              className="h-2 w-2 rounded-full"
                                              style={{
                                                backgroundColor: getStatusColor(
                                                  item.prediction.predictedStatus,
                                                ),
                                              }}
                                            />
                                            <p className="text-sm font-semibold text-black">
                                              {item.prediction.predictedStatus}
                                            </p>
                                            <p className="text-[11px] text-black/45">
                                              {formatForecastConfidence(
                                                item.prediction.confidence,
                                              )} confidence
                                            </p>
                                          </div>
                                        ) : (
                                          <p className="mt-2 text-xs text-black/35">
                                            No data
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </article>
                            );
                          })
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/55 bg-white/50 px-3 py-3 text-sm text-slate-500 backdrop-blur-md">
                            The forecast response did not include timeline items.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
