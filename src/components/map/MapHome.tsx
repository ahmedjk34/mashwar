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
import {
  DEMO_ROUTE_REQUEST,
  getStatusColor,
  getWorstStatus,
} from "@/lib/config/map";
import { getCheckpoints } from "@/lib/services/checkpoints";
import { getCheckpointForecast } from "@/lib/services/forecast";
import { getRoute } from "@/lib/services/routing";
import type {
  CheckpointForecastStatusType,
  MapCheckpoint,
  NormalizedCheckpointForecast,
  NormalizedRoutes,
  UserLocation,
} from "@/lib/types/map";

const EMPTY_ROUTES: NormalizedRoutes = {
  mainRoute: null,
  alternativeRoutes: [],
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
      return "Next day 08:00 UTC";
    default:
      return horizon;
  }
}

function formatForecastDateTime(value: string | null): string {
  if (!value) {
    return "Pending";
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

function formatForecastConfidence(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return `${Math.round(value * 100)}%`;
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

  const coordinateMissingExamples = useMemo(() => {
    return checkpointsWithoutCoordinates
      .slice(0, 3)
      .map((checkpoint) => checkpoint.name)
      .join(" • ");
  }, [checkpointsWithoutCoordinates]);

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
    setRoutes({
      mainRoute: null,
      alternativeRoutes: [],
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
      const statusType: CheckpointForecastStatusType = "entering";

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

  return (
    <main className="relative flex min-h-screen flex-1 overflow-hidden bg-[#f3f5ef]">
      <MapView
        checkpoints={checkpoints}
        routes={routes}
        userLocation={userLocation}
        onCheckpointSelect={handleCheckpointSelect}
      />

      <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-col gap-3 md:max-w-md">
        <section className="pointer-events-auto rounded-2xl border border-black/10 bg-white/92 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.14)] backdrop-blur-md">
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
              onClick={handleClearRoute}
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-black/[0.04]"
            >
              Clear route
            </button>
            <button
              type="button"
              onClick={handleRetryCheckpoints}
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-black/[0.04]"
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

      {selectedCheckpoint &&
      selectedCheckpointStatus &&
      selectedCheckpointStatusUi &&
      enteringStatusUi &&
      leavingStatusUi ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-start">
          <section className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-[28px] border border-white/70 bg-white/96 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <div className="border-b border-black/6 bg-[linear-gradient(135deg,rgba(14,165,233,0.08),rgba(37,99,235,0.02))] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-black/40">
                    Checkpoint
                  </p>
                  <h2 className="mt-2 truncate text-lg font-semibold text-black">
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

            <div className="px-5 py-5">
              <div className="rounded-2xl border border-black/6 bg-[#f8fafc] p-4">
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

                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl bg-white px-3 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
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
                        className="rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: enteringStatusUi.softBg,
                          color: enteringStatusUi.softText,
                        }}
                      >
                        {enteringStatusUi.chipLabel}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white px-3 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
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
                        className="rounded-full px-2.5 py-1 text-xs font-medium"
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

                <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-800/70">
                        Forecast
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {isForecastLoading
                          ? "Loading the checkpoint forecast and preparing the live override..."
                          : selectedCheckpointForecast
                            ? `Forecast applied from ${selectedCheckpointForecast.request.statusType} status.`
                            : "Click a checkpoint to load the forecast timeline."}
                      </p>
                    </div>

                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
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
                    <p className="mt-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
                      {forecastError}
                    </p>
                  ) : null}

                  {isForecastLoading ? (
                    <div className="mt-3 rounded-xl border border-sky-100 bg-white px-3 py-3 text-sm text-slate-600">
                      Forecasting the current checkpoint state now.
                    </div>
                  ) : null}

                  {selectedCheckpointForecast ? (
                    <div className="mt-3 space-y-3">
                      {selectedCheckpointForecast.predictions.length > 0 ? (
                        selectedCheckpointForecast.predictions.map((item) => {
                          const forecastStatusUi = getStatusUi(
                            item.prediction.predictedStatus,
                          );

                          return (
                            <div
                              key={`${item.horizon}-${item.targetDateTime ?? "pending"}`}
                              className="rounded-2xl border border-white/80 bg-white px-3 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/40">
                                    {getForecastHorizonLabel(item.horizon)}
                                  </p>
                                  <p className="mt-1 text-sm font-medium text-black">
                                    {formatForecastDateTime(item.targetDateTime)}
                                  </p>
                                </div>

                                <div
                                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                                  style={{
                                    backgroundColor: forecastStatusUi.softBg,
                                    color: forecastStatusUi.softText,
                                  }}
                                >
                                  {forecastStatusUi.chipLabel}
                                </div>
                              </div>

                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{
                                    backgroundColor: getStatusColor(
                                      item.prediction.predictedStatus,
                                    ),
                                  }}
                                />
                                <p className="text-sm font-semibold text-black">
                                  {item.prediction.predictedStatus}
                                </p>
                                <p className="text-xs text-black/45">
                                  {formatForecastConfidence(
                                    item.prediction.confidence,
                                  )} confidence
                                </p>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-xl border border-sky-100 bg-white px-3 py-3 text-sm text-slate-600">
                          The forecast response did not include timeline items.
                        </div>
                      )}
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
