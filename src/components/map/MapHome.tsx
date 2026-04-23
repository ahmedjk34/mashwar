"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import MapView from "@/components/map/MapView";
import {
  DEMO_ROUTE_REQUEST,
  getStatusColor,
  getWorstStatus,
} from "@/lib/config/map";
import { getCheckpoints } from "@/lib/services/checkpoints";
import { getRoute } from "@/lib/services/routing";
import type { MapCheckpoint, NormalizedRoutes } from "@/lib/types/map";

const EMPTY_ROUTES: NormalizedRoutes = {
  mainRoute: null,
  alternativeRoutes: [],
};

export default function MapHome() {
  const [checkpoints, setCheckpoints] = useState<MapCheckpoint[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] =
    useState<MapCheckpoint | null>(null);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isLoadingCheckpoints, setIsLoadingCheckpoints] = useState(true);
  const [routes, setRoutes] = useState<NormalizedRoutes>(EMPTY_ROUTES);
  const [isRoutePending, startRouteTransition] = useTransition();

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
  }, []);

  const fallbackCheckpointCount = useMemo(() => {
    return checkpoints.filter((checkpoint) => checkpoint.usesFallbackStatus)
      .length;
  }, [checkpoints]);

  const selectedCheckpointStatus = selectedCheckpoint
    ? getWorstStatus(
        selectedCheckpoint.enteringStatus,
        selectedCheckpoint.leavingStatus,
      )
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

  return (
    <main className="relative flex min-h-screen flex-1 overflow-hidden bg-[#f3f5ef]">
      <MapView
        checkpoints={checkpoints}
        routes={routes}
        onCheckpointSelect={setSelectedCheckpoint}
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
              {checkpoints.length} checkpoints
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
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
          </div>

          <div className="mt-4 space-y-2 text-sm text-black/70">
            <p>
              {isLoadingCheckpoints
                ? "Loading checkpoints from the configured Geo API..."
                : "Checkpoint dots are rendered through clustered GeoJSON layers."}
            </p>

            {routes.mainRoute ? (
              <p>
                Route rendered with {routes.alternativeRoutes.length} alternative
                {routes.alternativeRoutes.length === 1 ? "" : "s"}.
              </p>
            ) : (
              <p>No route loaded yet. Use the demo trigger to test line rendering.</p>
            )}

            {fallbackCheckpointCount > 0 ? (
              <p className="text-[#92400e]">
                {fallbackCheckpointCount} checkpoint
                {fallbackCheckpointCount === 1 ? "" : "s"} currently use the
                temporary status-color fallback because the documented endpoint
                only guarantees coordinates.
              </p>
            ) : null}

            {checkpointError ? (
              <p className="text-[#b91c1c]">{checkpointError}</p>
            ) : null}

            {routeError ? <p className="text-[#b91c1c]">{routeError}</p> : null}
          </div>
        </section>

        {selectedCheckpoint && selectedCheckpointStatus ? (
          <section className="pointer-events-auto rounded-2xl border border-black/10 bg-white/94 p-4 shadow-[0_16px_44px_rgba(15,23,42,0.14)] backdrop-blur-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/45">
                  Selected checkpoint
                </p>
                <h2 className="mt-1 text-base font-semibold text-black">
                  {selectedCheckpoint.name}
                </h2>
              </div>

              <div className="flex items-center gap-2 rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 text-sm font-medium text-black">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: getStatusColor(selectedCheckpointStatus),
                  }}
                />
                {selectedCheckpointStatus}
              </div>
            </div>

            <div className="mt-3 space-y-1 text-sm text-black/70">
              <p>
                Location: {selectedCheckpoint.latitude.toFixed(5)},{" "}
                {selectedCheckpoint.longitude.toFixed(5)}
              </p>
              <p>
                Status model: entering {selectedCheckpoint.enteringStatus} •
                leaving {selectedCheckpoint.leavingStatus}
              </p>
              {selectedCheckpoint.usesFallbackStatus ? (
                <p className="text-[#92400e]">
                  Temporary dev fallback status. Wire the real status-bearing
                  checkpoint endpoint here when available.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
