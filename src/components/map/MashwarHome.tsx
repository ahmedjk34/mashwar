"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DirectionStatusTile,
  FusedDirectionsStatusTile,
} from "@/components/map/checkpoint/CheckpointStatusTiles";
import ForecastHorizonCard, {
  type ForecastRow,
} from "@/components/map/checkpoint/ForecastHorizonCard";
import HardshipIndexFeature from "@/components/map/HardshipIndexFeature";
import LocaleToggle from "@/components/map/LocaleToggle";
import MapView from "@/components/map/MapView";
import MashwarNaturalLanguageRouteModal from "@/components/map/MashwarNaturalLanguageRouteModal";
import { RouteLoadingFlagStripe, RouteLoadingMicroDots } from "@/components/map/RouteLoadingCard";
import RouteBuildingOverlay from "@/components/map/RouteBuildingOverlay";
import RouteDetailsModal from "@/components/map/RouteDetailsModal";
import TradeoffExplainerModal from "@/components/map/TradeoffExplainerModal";
import {
  checkpointFlowSubkey,
  ERR_HEATMAP_LOAD,
  safeCheckpointFlowLabel,
} from "@/i18n/message-key-map";
import { translateServiceError } from "@/lib/i18n/translate-service-error";
import { buildCorridorSegments } from "@/lib/heatmap/corridorSegments";
import { normalizeCheckpointId } from "@/lib/heatmap/normalizeCheckpoint";
import {
  getRouteDisplayEtaMinutes,
  hasValidCoordinates,
  getRenderableRoutes,
  getWorstStatus,
} from "@/lib/config/map";
import { getCheckpoints } from "@/lib/services/checkpoints";
import { getCheckpointForecast } from "@/lib/services/forecast";
import { fetchHeatmapCache, streamHeatmapNetwork } from "@/lib/services/heatmap";
import { reverseGeocodeShortLabel } from "@/lib/services/nominatimReverseGeocode";
import { getRoute } from "@/lib/services/routing";
import { formatForecastDateTimePalestine } from "@/lib/utils/forecast-datetime";
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
import { useLocale, useTranslations } from "next-intl";
import { FaFire } from "react-icons/fa";
import { IoChevronDown, IoClose, IoSearch } from "react-icons/io5";
import { MdMyLocation, MdSwapHoriz } from "react-icons/md";

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

function formatTravelWindowHour(
  value: number | null,
  tCommon: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (value === null || !Number.isFinite(value)) {
    return tCommon("notAvailable");
  }

  return `${`${Math.trunc(value)}`.padStart(2, "0")}:00`;
}

function buildTravelWindowEntries(
  travelWindow: NormalizedCheckpointTravelWindow | null,
  tHeadline: (key: "best" | "worst") => string,
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
      label: tHeadline("best"),
      item: travelWindow.best,
    });
  }

  if (travelWindow.worst) {
    entries.push({
      kind: "worst",
      label: tHeadline("worst"),
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

type SelectionT = (key: string, values?: Record<string, string | number>) => string;

function formatSelectionLabel(
  selection:
    | { kind: "current-location" }
    | { kind: "checkpoint"; checkpointId: string }
    | { kind: "map-point"; lat: number; lng: number }
    | null,
  checkpointsById: Map<string, MapCheckpoint>,
  userLocation: UserLocation | null,
  tSelection: SelectionT,
): string {
  if (!selection) {
    return tSelection("unset");
  }

  if (selection.kind === "current-location") {
    return userLocation ? tSelection("current") : tSelection("unset");
  }

  if (selection.kind === "map-point") {
    return tSelection("pinnedOnMap");
  }

  const checkpoint = checkpointsById.get(selection.checkpointId);
  if (!checkpoint) {
    return tSelection("unset");
  }

  return checkpoint.city
    ? tSelection("nameWithCity", { name: checkpoint.name, city: checkpoint.city })
    : checkpoint.name;
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
  tSelection: SelectionT,
): string {
  if (!selection) {
    return tSelection("unset");
  }

  if (selection.kind === "checkpoint") {
    return formatSelectionLabel(selection, checkpointsById, userLocation, tSelection);
  }

  if (selection.kind === "current-location") {
    if (!userLocation) {
      return tSelection("unset");
    }

    return geocodeLabel ?? tSelection("current");
  }

  return geocodeLabel ?? tSelection("unset");
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
  const [routeChromeExpanded, setRouteChromeExpanded] = useState(true);
  const prevRoutePathCount = useRef<number | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routes, setRoutes] = useState<NormalizedRoutes>(EMPTY_ROUTES);
  const [routeDetailsRouteId, setRouteDetailsRouteId] = useState<string | null>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
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

  const locale = useLocale();
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tRoute = useTranslations("home.route");
  const tSelection = useTranslations("home.selection");
  const tPlacement = useTranslations("home.placement");
  const tPanel = useTranslations("checkpoint.panel");
  const tFlow = useTranslations("checkpoint.flow");
  const tFloat = useTranslations("home.floating");
  const tForecastTravelHeadline = useTranslations("forecast.travelHeadline");

  const errorBannerText = useMemo(() => {
    const parts = [
      routeError,
      locationError,
      checkpointError,
      heatmapEnabled ? heatmapError : null,
    ].filter(Boolean) as string[];
    return parts.map((p) => translateServiceError(p, tErrors)).join(tCommon("errorJoiner"));
  }, [routeError, locationError, checkpointError, heatmapError, heatmapEnabled, tCommon, tErrors]);

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
  const routeForCompactSummary = useMemo(() => {
    if (routePaths.length === 0) {
      return null;
    }
    const selectedId = routes.selectedRouteId;
    if (selectedId) {
      return routePaths.find((route) => route.routeId === selectedId) ?? routePaths[0];
    }
    return routePaths[0];
  }, [routePaths, routes.selectedRouteId]);
  const routeDetailsRoute = useMemo(() => {
    if (!routeDetailsRouteId) {
      return null;
    }

    return (
      routePaths.find((route) => route.routeId === routeDetailsRouteId) ?? null
    );
  }, [routeDetailsRouteId, routePaths]);

  useEffect(() => {
    const n = routePaths.length;
    const prev = prevRoutePathCount.current;
    if (n === 0) {
      setRouteChromeExpanded(true);
      prevRoutePathCount.current = 0;
      return;
    }
    if (prev !== null && prev === 0 && n > 0) {
      setRouteChromeExpanded(false);
    }
    prevRoutePathCount.current = n;
  }, [routePaths.length]);

  const handleTradeoffExplainerOpenChange = useCallback((dialogOpen: boolean) => {
    if (dialogOpen) {
      setRouteChromeExpanded(false);
    }
  }, []);

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

  const travelWindowEntries = useMemo(
    () => buildTravelWindowEntries(travelWindow, (k) => tForecastTravelHeadline(k)),
    [travelWindow, tForecastTravelHeadline],
  );

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
      setHeatmapError(error instanceof Error ? error.message : ERR_HEATMAP_LOAD);
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
    setIsRouteLoading(true);

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
          error instanceof Error ? error.message : "Unable to load route data.",
        );
      } finally {
        setIsRouteLoading(false);
      }
    })();
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
    tSelection,
  );
  const routeToBaseLabel = getRowLabelForEndpoint(
    routeTo,
    toGeocodeLabel,
    checkpointsById,
    userLocation,
    tSelection,
  );

  const worstFlowLabel =
    selectedCheckpointStatus !== null
      ? tFlow(checkpointFlowSubkey(selectedCheckpointStatus))
      : "";

  const fromGpsSet = routeFrom?.kind === "current-location";
  const toGpsSet = toOrigin === "gps" && routeTo?.kind === "map-point";

  const showRouteChromeCompact =
    routePaths.length > 0 &&
    !isRouteLoading &&
    !endpointPlacementMode &&
    !routeChromeExpanded;

  const compactRouteSummary = routeForCompactSummary
    ? tRoute("compactEta", { minutes: getRouteDisplayEtaMinutes(routeForCompactSummary) })
    : tRoute("compactRouteReady");

  return (
    <main className="fixed inset-0 z-0 h-[100dvh] w-screen overflow-hidden bg-transparent text-[var(--clr-white)]">
      <RouteBuildingOverlay open={isRouteLoading} />

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

      <div className="fixed left-1/2 top-5 z-[1100] flex w-[min(calc(100vw-24px),864px)] -translate-x-1/2 flex-col items-stretch gap-2">
        {showRouteChromeCompact ? (
          <div
            className="overflow-hidden rounded-full border border-white/[0.14] shadow-[0_12px_44px_rgba(0,0,0,0.5),0_0_0_1px_rgba(0,98,51,0.14),0_0_28px_-8px_rgba(238,42,53,0.12)]"
            style={{
              animation: "mashwar-modal-in 220ms ease-out both",
              backgroundColor: "rgba(12,14,16,0.9)",
              backgroundImage:
                "linear-gradient(155deg, rgba(0,98,51,0.18) 0%, transparent 45%), linear-gradient(325deg, rgba(238,42,53,0.14) 0%, transparent 42%), linear-gradient(180deg, rgba(245,245,240,0.06) 0%, transparent 28%)",
              backdropFilter: "blur(14px)",
            }}
          >
            <RouteLoadingFlagStripe dense className="opacity-95" />
            <div className="flex items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4">
              <p className="mashwar-arabic min-w-0 flex-1 truncate text-center text-[12px] font-semibold text-[var(--clr-white)] sm:text-[13px]">
                {compactRouteSummary}
              </p>
              <button
                type="button"
                onClick={() => setRouteChromeExpanded(true)}
                title={tRoute("expandEndpointsTitle")}
                aria-label={tRoute("expandEndpointsAria")}
                className="mashwar-arabic shrink-0 rounded-full border border-white/18 bg-[rgba(245,245,240,0.08)] px-3 py-1.5 text-[11px] font-semibold text-[var(--clr-sand)] transition hover:border-[var(--clr-green)]/45 hover:bg-[rgba(0,98,51,0.15)] hover:text-[var(--clr-green-soft)] active:scale-[0.98]"
              >
                {tRoute("expandEndpoints")}
              </button>
              <button
                type="button"
                onClick={handleRouteButtonClick}
                className="mashwar-arabic shrink-0 rounded-full bg-[var(--clr-red-deep)] px-3 py-1.5 text-[11px] font-semibold text-[var(--clr-white)] shadow-[0_2px_12px_rgba(0,0,0,0.35)] transition hover:bg-[var(--clr-red)] active:scale-[0.98]"
              >
                {tRoute("clear")}
              </button>
            </div>
          </div>
        ) : null}

        <div
          className={`overflow-hidden rounded-full border border-white/[0.14] shadow-[0_12px_44px_rgba(0,0,0,0.5),0_0_0_1px_rgba(0,98,51,0.14),0_0_28px_-8px_rgba(238,42,53,0.12)] transition duration-300 ease-out ${
            showRouteChromeCompact
              ? "pointer-events-none max-h-0 -translate-y-2 scale-[0.98] opacity-0"
              : "max-h-[min(40vh,720px)] translate-y-0 scale-100 opacity-100"
          }`}
          style={{
            backgroundColor: "rgba(12,14,16,0.9)",
            backgroundImage:
              "linear-gradient(155deg, rgba(0,98,51,0.18) 0%, transparent 45%), linear-gradient(325deg, rgba(238,42,53,0.14) 0%, transparent 42%), linear-gradient(180deg, rgba(245,245,240,0.06) 0%, transparent 28%)",
            backdropFilter: "blur(14px)",
          }}
        >
          <RouteLoadingFlagStripe dense className="opacity-95" />
          <div
            dir="ltr"
            className="flex w-full max-w-full items-stretch gap-2 overflow-x-hidden px-2.5 py-2 sm:gap-3 sm:px-3.5"
          >
            <button
              type="button"
              onClick={handleRouteButtonClick}
              disabled={isRouteLoading}
              className={`mashwar-arabic shrink-0 self-center rounded-full px-4 py-2.5 text-sm font-semibold text-[var(--clr-white)] shadow-[0_2px_14px_rgba(0,0,0,0.35)] transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 ${
                routePaths.length > 0
                  ? "bg-[var(--clr-red-deep)] hover:bg-[var(--clr-red)] hover:shadow-[0_4px_18px_rgba(238,42,53,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--clr-red)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(12,14,16,0.95)]"
                  : "bg-[var(--clr-green)] hover:brightness-110 hover:shadow-[0_4px_20px_rgba(0,98,51,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--clr-green-bright)]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(12,14,16,0.95)]"
              }`}
            >
              {routePaths.length > 0 ? tRoute("clear") : tRoute("start")}
            </button>

            <div
              dir={locale === "ar" ? "rtl" : "ltr"}
              className="flex min-h-[52px] min-w-0 flex-1 items-stretch justify-between gap-3 sm:gap-4 md:gap-5"
            >
              <div
                dir={locale === "ar" ? "rtl" : "ltr"}
                className={`flex min-w-0 flex-1 items-stretch gap-2 sm:gap-3 ${
                  endpointPlacementMode === "to" ? "opacity-40" : ""
                } ${swapAnimating ? "translate-y-3.5" : ""}`}
              >
                <button
                  type="button"
                  onClick={handleGpsAsFrom}
                  disabled={gpsLoading.from}
                  title={
                    gpsErrorField === "from" ? tErrors("geoUnavailable") : tRoute("gpsFromTitle")
                  }
                  aria-label={tRoute("gpsFromAria")}
                  className={`relative flex min-h-[52px] min-w-[3.25rem] shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl border px-1.5 py-1.5 shadow-inner transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--clr-green-bright)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(12,14,16,0.92)] active:scale-[0.97] disabled:cursor-wait sm:min-h-[56px] sm:min-w-[3.75rem] sm:px-2 ${
                    gpsErrorField === "from" ? "mashwar-gps-shake" : ""
                  } ${
                    fromGpsSet
                      ? "border-[var(--clr-green)]/85 bg-[rgba(0,98,51,0.26)] text-[var(--clr-green-soft)] shadow-[0_0_0_1px_rgba(0,166,81,0.45)]"
                      : "border-white/20 bg-white/[0.06] text-white/75 hover:border-[var(--clr-green)]/55 hover:bg-[rgba(0,98,51,0.16)] hover:text-[var(--clr-green-soft)]"
                  }`}
                >
                  {fromGpsSet ? (
                    <span
                      className="pointer-events-none absolute inset-0 rounded-2xl bg-[var(--clr-green)]/22 animate-ping"
                      style={{ animationDuration: "1.8s" }}
                      aria-hidden
                    />
                  ) : null}
                  {gpsLoading.from ? (
                    <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                      <RouteLoadingMicroDots
                        dotClassName="h-2 w-2 rounded-full"
                        gapClass="gap-0.5"
                      />
                    </span>
                  ) : null}
                  <MdMyLocation
                    className={`relative h-6 w-6 shrink-0 transition duration-200 sm:h-7 sm:w-7 ${gpsLoading.from ? "opacity-25" : ""} ${fromGpsSet ? "scale-105 fill-[var(--clr-green-soft)]" : ""}`}
                    aria-hidden
                  />
                  <span className="mashwar-arabic relative max-w-[4.25rem] text-center text-[9px] font-semibold leading-tight text-current opacity-90 sm:text-[10px]">
                    {tRoute("gpsLocationShort")}
                  </span>
                </button>

                <div
                  className={`flex min-w-0 flex-1 items-center gap-0.5 rounded-2xl border border-transparent bg-[rgba(245,245,240,0.06)] px-1 py-1 transition-all duration-300 ease-out sm:px-1.5 ${
                    endpointPlacementMode === "from"
                      ? "border-[var(--clr-green)]/40 ring-2 ring-[var(--clr-green)]/90 ring-offset-2 ring-offset-[rgba(12,14,16,0.92)] shadow-[0_0_28px_rgba(0,166,81,0.3)]"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleActivateEndpointPlacement("from")}
                    className="flex min-h-[48px] min-w-0 flex-1 flex-col justify-center rounded-xl px-2.5 py-2 text-end transition hover:bg-white/10 sm:min-h-[52px] sm:px-3"
                  >
                    <span className="mashwar-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--clr-green-soft)] sm:text-[11px]">
                      {tRoute("from")}
                    </span>
                    <div className="flex min-w-0 items-center justify-end gap-1">
                      {fromResolving ? (
                        <span className="flex min-w-0 w-full flex-col items-end gap-1 py-0.5">
                          <RouteLoadingFlagStripe dense className="w-20 max-w-full opacity-90" />
                          <RouteLoadingMicroDots
                            dotClassName="h-1.5 w-1.5 rounded-full"
                            gapClass="gap-0.5"
                            justify="end"
                          />
                        </span>
                      ) : (
                        <span
                          dir={locale === "ar" ? "rtl" : "ltr"}
                          className="mashwar-arabic min-w-0 flex-1 truncate text-end text-[14px] font-semibold leading-snug text-white sm:text-[15px]"
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
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-white/55 transition hover:bg-white/14 hover:text-white"
                      aria-label={tRoute("clearFromAria")}
                    >
                      <IoClose className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={handleSwapEndpoints}
                disabled={swapAnimating}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full border border-white/20 bg-[rgba(245,245,240,0.07)] text-[var(--clr-sand)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-[var(--clr-green)]/45 hover:bg-[rgba(0,98,51,0.14)] hover:text-[var(--clr-green-soft)] active:scale-[0.96] disabled:cursor-wait disabled:opacity-50 sm:h-12 sm:w-12"
                title={tRoute("swapEndpointsTitle")}
                aria-label={tRoute("swapEndpointsAria")}
              >
                <MdSwapHoriz className="h-7 w-7" aria-hidden />
              </button>

              <div
                dir={locale === "ar" ? "rtl" : "ltr"}
                className={`flex min-w-0 flex-1 items-stretch gap-2 sm:gap-3 ${
                  endpointPlacementMode === "from" ? "opacity-40" : ""
                } ${swapAnimating ? "-translate-y-3.5" : ""}`}
              >
                <div
                  className={`flex min-w-0 flex-1 items-center gap-0.5 rounded-2xl border border-transparent bg-[rgba(245,245,240,0.06)] px-1 py-1 transition-all duration-300 ease-out sm:px-1.5 ${
                    endpointPlacementMode === "to"
                      ? "border-[var(--clr-red)]/45 ring-2 ring-[var(--clr-red)]/88 ring-offset-2 ring-offset-[rgba(12,14,16,0.92)] shadow-[0_0_28px_rgba(238,42,53,0.28)]"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleActivateEndpointPlacement("to")}
                    className="flex min-h-[48px] min-w-0 flex-1 flex-col justify-center rounded-xl px-2.5 py-2 text-end transition hover:bg-white/10 sm:min-h-[52px] sm:px-3"
                  >
                    <span className="mashwar-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#fca5a5] sm:text-[11px]">
                      {tRoute("to")}
                    </span>
                    <div className="flex min-w-0 items-center justify-end gap-1">
                      {toResolving ? (
                        <span className="flex min-w-0 w-full flex-col items-end gap-1 py-0.5">
                          <RouteLoadingFlagStripe dense className="w-20 max-w-full opacity-90" />
                          <RouteLoadingMicroDots
                            dotClassName="h-1.5 w-1.5 rounded-full"
                            gapClass="gap-0.5"
                            justify="end"
                          />
                        </span>
                      ) : (
                        <span
                          dir={locale === "ar" ? "rtl" : "ltr"}
                          className="mashwar-arabic min-w-0 flex-1 truncate text-end text-[14px] font-semibold leading-snug text-white sm:text-[15px]"
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
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-white/55 transition hover:bg-white/14 hover:text-white"
                      aria-label={tRoute("clearToAria")}
                    >
                      <IoClose className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={handleGpsAsTo}
                  disabled={gpsLoading.to}
                  title={gpsErrorField === "to" ? tErrors("geoUnavailable") : tRoute("gpsToTitle")}
                  aria-label={tRoute("gpsToAria")}
                  className={`relative flex min-h-[52px] min-w-[3.25rem] shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl border px-1.5 py-1.5 shadow-inner transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--clr-red)]/65 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(12,14,16,0.92)] active:scale-[0.97] disabled:cursor-wait sm:min-h-[56px] sm:min-w-[3.75rem] sm:px-2 ${
                    gpsErrorField === "to" ? "mashwar-gps-shake" : ""
                  } ${
                    toGpsSet
                      ? "border-[var(--clr-red)]/85 bg-[rgba(238,42,53,0.22)] text-[#fecaca] shadow-[0_0_0_1px_rgba(238,42,53,0.48)]"
                      : "border-white/20 bg-white/[0.06] text-white/75 hover:border-[var(--clr-red)]/55 hover:bg-[rgba(238,42,53,0.16)] hover:text-[#fecaca]"
                  }`}
                >
                  {toGpsSet ? (
                    <span
                      className="pointer-events-none absolute inset-0 rounded-2xl bg-[var(--clr-red)]/24 animate-ping"
                      style={{ animationDuration: "1.8s" }}
                      aria-hidden
                    />
                  ) : null}
                  {gpsLoading.to ? (
                    <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                      <RouteLoadingMicroDots
                        dotClassName="h-2 w-2 rounded-full"
                        gapClass="gap-0.5"
                      />
                    </span>
                  ) : null}
                  <MdMyLocation
                    className={`relative h-6 w-6 shrink-0 transition duration-200 sm:h-7 sm:w-7 ${gpsLoading.to ? "opacity-25" : ""} ${toGpsSet ? "scale-105 fill-[#fecaca]" : ""}`}
                    aria-hidden
                  />
                  <span className="mashwar-arabic relative max-w-[4.25rem] text-center text-[9px] font-semibold leading-tight text-current opacity-90 sm:text-[10px]">
                    {tRoute("gpsLocationShort")}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {routeError ||
          locationError ||
          checkpointError ||
          (heatmapEnabled && heatmapError) ? (
            <div className="border-t border-[var(--clr-red)]/25 bg-[rgba(238,42,53,0.08)] px-3 py-2 text-center text-[11px] text-[#fecaca]">
              {errorBannerText}
            </div>
          ) : null}
        </div>

        {endpointPlacementMode === "from" ? (
          <p
            className="mashwar-arabic pointer-events-none mx-auto rounded-full border border-[var(--clr-green)]/40 bg-[rgba(0,98,51,0.18)] px-4 py-2 text-center text-[12px] font-medium text-[var(--clr-green-soft)] shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
            style={{ backdropFilter: "blur(10px)" }}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            {tPlacement("hintFrom")}
          </p>
        ) : endpointPlacementMode === "to" ? (
          <p
            className="mashwar-arabic pointer-events-none mx-auto rounded-full border border-[var(--clr-red)]/45 bg-[rgba(238,42,53,0.14)] px-4 py-2 text-center text-[12px] font-medium text-[#fecaca] shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
            style={{ backdropFilter: "blur(10px)" }}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            {tPlacement("hintTo")}
          </p>
        ) : null}
      </div>

      <div className="fixed right-4 top-5 z-[1100] flex flex-col items-end sm:right-5">
        <div className="flex w-[9.5rem] flex-col gap-2 sm:w-[10.5rem]">
          <button
            type="button"
            onClick={handleSmartRouterCardClick}
            title={tFloat("smartRouterTitle")}
            aria-label={tFloat("smartRouterAria")}
            aria-pressed={smartRouterOn}
            className={`group inline-flex w-full items-center gap-2 rounded-full border px-2 py-1.5 shadow-[0_8px_22px_rgba(0,0,0,0.28)] transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--clr-white)] active:scale-[0.98] ${
              locale === "ar" ? "justify-start" : "justify-end"
            } ${
              smartRouterOn
                ? "border-black/45 bg-[#1a1a19] text-white hover:border-black/55 hover:bg-[#222221]"
                : "border-black/50 bg-[#121211] text-white hover:border-black/40 hover:bg-[#181817]"
            }`}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition duration-200 ${
                smartRouterOn
                  ? "bg-white/14 text-white ring-1 ring-white/22"
                  : "bg-white/10 text-[#e8e8e4] ring-1 ring-white/16 group-hover:bg-white/14 group-hover:text-white"
              }`}
            >
              <IoSearch className="h-4 w-4" aria-hidden />
            </span>
            <span
              className={`mashwar-arabic min-w-0 shrink text-[10px] font-semibold leading-snug sm:text-[11px] ${
                locale === "ar" ? "text-right" : "text-left"
              }`}
            >
              {tFloat("smartRouterCta")}
            </span>
          </button>

          <button
            type="button"
            onClick={handleToggleHeatmap}
            title={tFloat("heatmapTitle")}
            aria-label={tFloat("heatmapAria")}
            aria-pressed={heatmapEnabled}
            className={`group inline-flex w-full items-center gap-2 rounded-full border px-2 py-1.5 text-white shadow-[0_8px_22px_rgba(160,24,36,0.35)] transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85c66]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--clr-white)] active:scale-[0.98] ${
              locale === "ar" ? "justify-start" : "justify-end"
            } ${
              heatmapEnabled
                ? "border-[#9f1522]/90 bg-[#9f1522] hover:border-[#b81d2c] hover:bg-[#ae1a28]"
                : "border-[#c41f29]/85 bg-[#d42a35] hover:border-[#e03a45] hover:bg-[#df333f]"
            }`}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 transition duration-200 ${
                heatmapEnabled
                  ? "bg-black/28 text-[#ffe8e6] ring-white/22"
                  : "bg-black/18 text-[#ffe8e6] ring-white/18 group-hover:bg-black/24"
              }`}
            >
              <FaFire
                className={`h-4 w-4 ${isHeatmapLoading || isHeatmapBuilding ? "animate-pulse" : ""}`}
                aria-hidden
              />
            </span>
            <span
              className={`mashwar-arabic min-w-0 shrink text-[10px] font-semibold leading-snug sm:text-[11px] ${
                locale === "ar" ? "text-right" : "text-left"
              }`}
            >
              {tFloat("heatmapCta")}
            </span>
          </button>

          <HardshipIndexFeature />

          <LocaleToggle />
        </div>
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
                    <p
                      className="mashwar-arabic text-[11px] font-semibold leading-none text-[var(--clr-sand)]"
                      dir={locale === "ar" ? "rtl" : "ltr"}
                    >
                      {tPanel("kicker")}
                    </p>
                    <p className="mashwar-mono mt-1 text-[9px] uppercase tracking-[0.22em] text-[var(--clr-slate)]">
                      {tPanel("kickerMono")}
                    </p>
                    <h2
                      dir={locale === "ar" ? "rtl" : "ltr"}
                      className="mashwar-arabic mashwar-display mt-3 text-[clamp(1.25rem,4.2vw,1.5rem)] leading-tight text-[var(--clr-white)]"
                    >
                      {selectedCheckpoint.name}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCheckpointSelect(null)}
                    className="mashwar-icon-button inline-flex h-10 w-10 shrink-0 items-center justify-center text-[var(--clr-slate)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(10,12,16,0.9)]"
                    aria-label={tPanel("closeAria")}
                  >
                    <IoClose className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              </header>

              <div className="space-y-4 p-[var(--panel-padding)]">
                <section aria-labelledby="checkpoint-now-heading">
                  <h3 id="checkpoint-now-heading" className="sr-only">
                    {tPanel("currentSrOnly")}
                  </h3>

                  {selectedCheckpoint.enteringStatus !== selectedCheckpoint.leavingStatus ? (
                    <div
                      role="status"
                      className="mb-3 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-amber-400/25 bg-amber-500/[0.08] px-3 py-2.5"
                      dir={locale === "ar" ? "rtl" : "ltr"}
                    >
                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
                      <p className="mashwar-arabic min-w-0 text-[12px] leading-snug text-[var(--clr-sand)]">
                        {tPanel("mismatchAlert", { worst: worstFlowLabel })}
                      </p>
                    </div>
                  ) : null}

                  {selectedCheckpoint.enteringStatus === selectedCheckpoint.leavingStatus ? (
                    <FusedDirectionsStatusTile status={selectedCheckpoint.enteringStatus} />
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <DirectionStatusTile direction="entering" status={selectedCheckpoint.enteringStatus} />
                      <DirectionStatusTile direction="leaving" status={selectedCheckpoint.leavingStatus} />
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleUseSelectedCheckpointAsOrigin}
                      className="mashwar-action mashwar-action-primary flex min-h-[48px] flex-col items-center justify-center gap-0.5 px-4 py-3 text-center"
                    >
                      <span
                        className="mashwar-arabic text-[13px] font-semibold leading-tight"
                        dir={locale === "ar" ? "rtl" : "ltr"}
                      >
                        {tPanel("routeFromCta")}
                      </span>
                      <span className="mashwar-mono text-[9px] font-medium uppercase tracking-[0.14em] opacity-80">
                        {tPanel("routeFromSub")}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleUseSelectedCheckpointAsDestination}
                      className="mashwar-action flex min-h-[48px] flex-col items-center justify-center gap-0.5 px-4 py-3 text-center"
                    >
                      <span
                        className="mashwar-arabic text-[13px] font-semibold leading-tight"
                        dir={locale === "ar" ? "rtl" : "ltr"}
                      >
                        {tPanel("routeToCta")}
                      </span>
                      <span className="mashwar-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--clr-slate)]">
                        {tPanel("routeToSub")}
                      </span>
                    </button>
                  </div>
                </section>

                <section
                  className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg)]/60 p-4"
                  aria-labelledby="checkpoint-forecast-heading"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--glass-border)] pb-3">
                    <div className="min-w-0" dir={locale === "ar" ? "rtl" : "ltr"}>
                      <h3
                        id="checkpoint-forecast-heading"
                        className="mashwar-arabic text-[15px] font-bold text-[var(--clr-white)]"
                      >
                        {tPanel("forecastTitle")}
                      </h3>
                      <p className="mashwar-mono mt-0.5 text-[9px] uppercase tracking-[0.18em] text-[var(--clr-slate)]">
                        {tPanel("forecastMono")}
                      </p>
                    </div>
                    <span
                      className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] text-[var(--clr-green-soft)]"
                      style={{ borderColor: "var(--risk-low)", backgroundColor: "var(--risk-low-bg)" }}
                    >
                      <span className="mashwar-live-dot" aria-hidden />
                      <span className="mashwar-mono uppercase tracking-[0.12em]">{tPanel("live")}</span>
                    </span>
                  </div>

                  <p
                    className="mashwar-arabic mt-3 text-[11px] leading-relaxed text-[var(--clr-slate)]"
                    dir={locale === "ar" ? "rtl" : "ltr"}
                  >
                    {tPanel("lastDataUpdate")}{" "}
                    <span className="mashwar-mono font-medium text-[var(--clr-sand)]" dir="ltr">
                      {formatForecastDateTimePalestine(
                        selectedCheckpointForecast?.request.asOf ?? null,
                        tCommon,
                      )}
                    </span>
                  </p>

                  {travelWindow && travelWindowEntries.length > 0 ? (
                    <details className="group mt-4 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)]/80 open:bg-[var(--glass-bg-mid)]">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-[var(--radius-sm)] px-3 py-2.5 text-[var(--clr-white)] marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--glass-bg-mid)] [&::-webkit-details-marker]:hidden">
                        <span
                          className="mashwar-arabic text-[13px] font-semibold"
                          dir={locale === "ar" ? "rtl" : "ltr"}
                        >
                          {tPanel("travelWindowSummary")}
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
                              <span className="mashwar-arabic" dir={locale === "ar" ? "rtl" : "ltr"}>
                                {tPanel("pillReference")}{" "}
                              </span>
                              {formatForecastDateTimePalestine(travelWindow.referenceTime, tCommon)}
                            </span>
                          ) : null}
                          {travelWindow.scope ? (
                            <span className="mashwar-pill px-2.5 py-1 text-[10px]">
                              <span className="mashwar-arabic" dir={locale === "ar" ? "rtl" : "ltr"}>
                                {tPanel("pillScope")}{" "}
                              </span>
                              {travelWindow.scope}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 space-y-3">
                          {travelWindowEntries.map((entry) => (
                            <article
                              key={entry.kind}
                              className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg)]/90 p-3"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div dir={locale === "ar" ? "rtl" : "ltr"} className="min-w-0 text-end">
                                  <p className="mashwar-arabic text-[14px] font-bold text-[var(--clr-white)]">
                                    {tForecastTravelHeadline(entry.kind)}
                                  </p>
                                  <p
                                    className="mashwar-mono mt-0.5 text-[9px] uppercase tracking-[0.14em] text-[var(--clr-slate)]"
                                    dir="ltr"
                                  >
                                    {entry.kind === "best" ? tPanel("bestWindow") : tPanel("worstWindow")}
                                  </p>
                                </div>
                                <span className="mashwar-pill max-w-[55%] truncate px-2.5 py-1 text-[10px]">
                                  {entry.item?.windowLabel ?? tCommon("dash")}
                                </span>
                              </div>

                              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <div className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)]/90 p-2">
                                  <p
                                    className="mashwar-arabic text-[9px] text-[var(--clr-slate)]"
                                    dir={locale === "ar" ? "rtl" : "ltr"}
                                  >
                                    {tPanel("day")}
                                  </p>
                                  <p className="mashwar-mono mt-1 text-[11px] font-semibold text-[var(--clr-white)]">
                                    {entry.item?.dayOfWeek ?? tCommon("dash")}
                                  </p>
                                </div>
                                <div className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)]/90 p-2">
                                  <p
                                    className="mashwar-arabic text-[9px] text-[var(--clr-slate)]"
                                    dir={locale === "ar" ? "rtl" : "ltr"}
                                  >
                                    {tPanel("hour")}
                                  </p>
                                  <p className="mashwar-data mt-1 text-[11px] font-semibold text-[var(--clr-white)]">
                                    {formatTravelWindowHour(entry.item?.hour ?? null, tCommon)}
                                  </p>
                                </div>
                                <div className="col-span-2 rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)]/90 p-2 sm:col-span-2">
                                  <p
                                    className="mashwar-arabic text-[9px] text-[var(--clr-slate)]"
                                    dir={locale === "ar" ? "rtl" : "ltr"}
                                  >
                                    {tPanel("targetSlot")}
                                  </p>
                                  <p className="mashwar-data mt-1 text-[11px] font-semibold text-[var(--clr-white)]">
                                    {formatForecastDateTimePalestine(entry.item?.targetDateTime ?? null, tCommon)}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg)]/80 p-2.5">
                                  <p
                                    className="mashwar-arabic text-[10px] font-semibold text-[var(--clr-sand)]"
                                    dir={locale === "ar" ? "rtl" : "ltr"}
                                  >
                                    {tPanel("entering")}
                                  </p>
                                  <p
                                    className="mashwar-arabic mt-1 text-[13px] font-semibold text-[var(--clr-white)]"
                                    dir={locale === "ar" ? "rtl" : "ltr"}
                                  >
                                    {entry.item?.enteringPrediction?.predictedStatus
                                      ? safeCheckpointFlowLabel(
                                          entry.item.enteringPrediction.predictedStatus,
                                          tFlow,
                                        )
                                      : tCommon("dash")}
                                  </p>
                                  <p
                                    className="mashwar-arabic mt-1 text-[10px] text-[var(--clr-slate)]"
                                    dir={locale === "ar" ? "rtl" : "ltr"}
                                  >
                                    {`${tPanel("confidencePrefix")} ${tCommon("percent", {
                                      value: Math.round(
                                        (entry.item?.enteringPrediction?.confidence ?? 0) * 100,
                                      ),
                                    })}`}
                                  </p>
                                </div>
                                <div className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg)]/80 p-2.5">
                                  <p
                                    className="mashwar-arabic text-[10px] font-semibold text-[var(--clr-sand)]"
                                    dir={locale === "ar" ? "rtl" : "ltr"}
                                  >
                                    {tPanel("leaving")}
                                  </p>
                                  <p
                                    className="mashwar-arabic mt-1 text-[13px] font-semibold text-[var(--clr-white)]"
                                    dir={locale === "ar" ? "rtl" : "ltr"}
                                  >
                                    {entry.item?.leavingPrediction?.predictedStatus
                                      ? safeCheckpointFlowLabel(
                                          entry.item.leavingPrediction.predictedStatus,
                                          tFlow,
                                        )
                                      : tCommon("dash")}
                                  </p>
                                  <p
                                    className="mashwar-arabic mt-1 text-[10px] text-[var(--clr-slate)]"
                                    dir={locale === "ar" ? "rtl" : "ltr"}
                                  >
                                    {`${tPanel("confidencePrefix")} ${tCommon("percent", {
                                      value: Math.round(
                                        (entry.item?.leavingPrediction?.confidence ?? 0) * 100,
                                      ),
                                    })}`}
                                  </p>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    </details>
                  ) : null}

                  <p
                    className="mashwar-arabic mt-3 text-[12px] leading-snug text-[var(--clr-slate)]"
                    dir={locale === "ar" ? "rtl" : "ltr"}
                  >
                    {forecastRows.length > 0
                      ? tPanel("forecastPeriods", { count: forecastRows.length })
                      : isForecastLoading
                        ? tPanel("forecastLoading")
                        : tPanel("forecastWaiting")}
                  </p>

                  {forecastError ? (
                    <p
                      className="mashwar-arabic mt-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-[12px] leading-snug text-[var(--clr-white)]"
                      style={{ borderColor: "var(--risk-high)", backgroundColor: "var(--risk-high-bg)" }}
                      dir={locale === "ar" ? "rtl" : "ltr"}
                      role="alert"
                    >
                      {translateServiceError(forecastError, tErrors)}
                    </p>
                  ) : null}

                  {isForecastLoading ? (
                    <p
                      className="mashwar-arabic mt-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] px-3 py-2.5 text-[12px] text-[var(--clr-sand)]"
                      dir={locale === "ar" ? "rtl" : "ltr"}
                    >
                      {tPanel("forecastEstimating")}
                    </p>
                  ) : null}

                  <div className="mt-3 space-y-2">
                    {forecastRows.length > 0 ? (
                      forecastRows.map((row) => <ForecastHorizonCard key={row.horizon} row={row} />)
                    ) : (
                      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--glass-border)] px-3 py-4 text-center">
                        <p
                          className="mashwar-arabic text-[12px] text-[var(--clr-slate)]"
                          dir={locale === "ar" ? "rtl" : "ltr"}
                        >
                          {tPanel("forecastEmpty")}
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
        onExplainerOpenChange={handleTradeoffExplainerOpenChange}
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
