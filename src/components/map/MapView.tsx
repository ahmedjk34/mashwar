"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";

import {
  buildCheckpointFeatureCollection,
  calculateRouteBounds,
  CHECKPOINT_CLUSTER_COUNT_LAYER_ID,
  CHECKPOINT_CLUSTER_LAYER_ID,
  CHECKPOINT_INTERACTIVE_LAYER_IDS,
  CHECKPOINT_SOURCE_ID,
  CHECKPOINT_UNCLUSTERED_LAYER_ID,
  CLUSTER_COLOR_EXPRESSION,
  CLUSTER_RADIUS_EXPRESSION,
  DEFAULT_ZOOM,
  DEFAULT_MAP_GLYPHS_URL,
  getMapTileUrlTemplate,
  getRenderableRoutes,
  MAX_ZOOM,
  MIN_ZOOM,
  PALESTINE_BOUNDS,
  PALESTINE_CENTER,
  ROUTE_STYLE,
  USER_LOCATION_ACCURACY_LAYER_ID,
  USER_LOCATION_LAYER_ID,
  USER_LOCATION_SOURCE_ID,
  USER_LOCATION_STYLE,
  TILE_LAYER_ID,
  TILE_SOURCE_ID,
  transformRouteToGeoJSON,
  UNCLUSTERED_RADIUS_EXPRESSION,
} from "@/lib/config/map";
import type {
  MapCheckpoint,
  NormalizedRoutes,
  RoutePath,
  RoutePoint,
  RoutingRiskLevel,
  UserLocation,
} from "@/lib/types/map";

interface MapViewProps {
  checkpoints: MapCheckpoint[];
  routes: NormalizedRoutes;
  departAt?: string | null;
  userLocation?: UserLocation | null;
  routeEndpoints?: {
    from: RoutePoint | null;
    to: RoutePoint | null;
  };
  placementMode?: "from" | "to" | null;
  onMapPlacement?: (point: RoutePoint) => void;
  onCheckpointSelect?: (checkpoint: MapCheckpoint | null) => void;
  onRouteSelect?: (routeId: string) => void;
  onRouteOpen?: (routeId: string) => void;
}

type MapLibreModule = typeof import("maplibre-gl");

const ROUTE_ENDPOINT_SOURCE_ID = "route-endpoints-source";
const ROUTE_ENDPOINT_FROM_LAYER_ID = "route-endpoint-from-layer";
const ROUTE_ENDPOINT_TO_LAYER_ID = "route-endpoint-to-layer";
const ROUTE_LAYER_IDS = [
  "route-v2-slot-1",
  "route-v2-slot-2",
  "route-v2-slot-3",
] as const;
const ROUTE_LAYER_OUTLINE_IDS = [
  "route-v2-slot-1-outline",
  "route-v2-slot-2-outline",
  "route-v2-slot-3-outline",
] as const;

const ROUTE_LABEL_OFFSETS = [
  { x: -34, y: -112 },
  { x: 0, y: -132 },
  { x: 34, y: -112 },
] as const;

type RouteLabelTone = "good" | "warning" | "danger";

interface RouteLabelItem {
  routeId: string;
  rank: number;
  x: number;
  y: number;
  accentColor: string;
  tone: RouteLabelTone;
  riskLabel: string;
  scoreLabel: string;
  delayLabel: string | null;
  smartEtaLabel: string;
  noteLabel: string | null;
}

function getRouteLayerStyle(routeIndex: number, isSelected: boolean) {
  const color =
    ROUTE_STYLE.PALETTE[routeIndex] ??
    ROUTE_STYLE.PALETTE[ROUTE_STYLE.PALETTE.length - 1];

  return {
    color,
    width: isSelected ? ROUTE_STYLE.MAIN_WIDTH : ROUTE_STYLE.ALT_WIDTH,
    opacity: isSelected ? ROUTE_STYLE.MAIN_OPACITY : ROUTE_STYLE.ALT_OPACITY,
    outlineColor: ROUTE_STYLE.OUTLINE_COLOR,
    outlineWidth: ROUTE_STYLE.OUTLINE_WIDTH,
  };
}

function getRouteRiskLabel(route: RoutePath): {
  label: string;
  tone: RouteLabelTone;
} {
  const riskLevel: RoutingRiskLevel =
    route.riskLevel !== "unknown"
      ? route.riskLevel
      : route.routeViability === "good"
        ? "low"
        : route.routeViability === "avoid"
          ? "high"
          : "medium";

  switch (riskLevel) {
    case "low":
      return { label: "LOW RISK", tone: "good" };
    case "high":
      return { label: "HIGH RISK", tone: "danger" };
    case "medium":
      return { label: "MEDIUM RISK", tone: "warning" };
    default:
      return { label: "RISK UNKNOWN", tone: "warning" };
  }
}

function getRouteToneStyles(tone: RouteLabelTone) {
  switch (tone) {
    case "good":
      return {
        text: "#166534",
        border: "rgba(34, 197, 94, 0.22)",
        background: "rgba(34, 197, 94, 0.12)",
      };
    case "danger":
      return {
        text: "#b91c1c",
        border: "rgba(239, 68, 68, 0.22)",
        background: "rgba(239, 68, 68, 0.12)",
      };
    default:
      return {
        text: "#b45309",
        border: "rgba(245, 158, 11, 0.22)",
        background: "rgba(245, 158, 11, 0.12)",
      };
  }
}

function formatDelayLabel(delayMinutes: number | null): string | null {
  if (delayMinutes === null || !Number.isFinite(delayMinutes) || delayMinutes <= 0) {
    return null;
  }

  return `+${Math.round(delayMinutes)} min delay`;
}

function formatRouteArrivalLabel(value: string | null): string {
  if (!value) {
    return "Arrival n/a";
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

function getRouteNoteLabel(route: RoutePath): string | null {
  if (route.expectedDelayMinutes !== null && route.expectedDelayMinutes > 0) {
    return "includes predicted checkpoint delay";
  }

  if (route.riskComponents.length > 0) {
    return route.riskComponents[0];
  }

  return null;
}

function getRouteScoreLabel(route: RoutePath): string {
  if (route.riskScore !== null && Number.isFinite(route.riskScore)) {
    return `Risk score ${route.riskScore.toFixed(1)}`;
  }

  if (Number.isFinite(route.routeScore)) {
    return `Routing score ${route.routeScore.toFixed(1)}`;
  }

  return "Risk score n/a";
}

function getRouteAnchorCoordinate(route: RoutePath): [number, number] {
  const coordinates = route.geometry.coordinates;
  if (coordinates.length === 0) {
    return [0, 0];
  }

  if (coordinates.length === 1) {
    return coordinates[0];
  }

  const midpointIndex = Math.max(
    0,
    Math.min(coordinates.length - 1, Math.floor((coordinates.length - 1) * 0.45)),
  );

  return coordinates[midpointIndex];
}

function cleanupRouteLayers(map: MapLibreMap): void {
  const layerIds = [
    ...ROUTE_LAYER_IDS,
    ...ROUTE_LAYER_OUTLINE_IDS,
    ROUTE_ENDPOINT_FROM_LAYER_ID,
    ROUTE_ENDPOINT_TO_LAYER_ID,
    USER_LOCATION_ACCURACY_LAYER_ID,
    USER_LOCATION_LAYER_ID,
  ];
  const sourceIds = [...ROUTE_LAYER_IDS, ROUTE_ENDPOINT_SOURCE_ID, USER_LOCATION_SOURCE_ID];

  layerIds.forEach((id) => {
    if (map.getLayer(id)) {
      map.removeLayer(id);
    }
  });

  sourceIds.forEach((id) => {
    if (map.getSource(id)) {
      map.removeSource(id);
    }
  });
}

export default function MapView({
  checkpoints,
  routes,
  departAt,
  userLocation,
  routeEndpoints,
  placementMode,
  onMapPlacement,
  onCheckpointSelect,
  onRouteSelect,
  onRouteOpen,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const routePopupRef = useRef<InstanceType<MapLibreModule["Popup"]> | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [routeLabelItems, setRouteLabelItems] = useState<RouteLabelItem[]>([]);

  const checkpointsById = useMemo(() => {
    return new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  }, [checkpoints]);

  const checkpointFeatureCollection = useMemo(() => {
    return buildCheckpointFeatureCollection(checkpoints);
  }, [checkpoints]);

  const routeEndpointsFeatureCollection = useMemo<
    FeatureCollection<Point, { role: "from" | "to" }>
  >(() => {
    const features: Array<
      FeatureCollection<Point, { role: "from" | "to" }>["features"][number]
    > = [];

    if (routeEndpoints?.from) {
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [routeEndpoints.from.lng, routeEndpoints.from.lat],
        },
        properties: {
          role: "from",
        },
      });
    }

    if (routeEndpoints?.to) {
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [routeEndpoints.to.lng, routeEndpoints.to.lat],
        },
        properties: {
          role: "to",
        },
      });
    }

    return {
      type: "FeatureCollection",
      features,
    };
  }, [routeEndpoints]);

  const routePaths = useMemo(() => getRenderableRoutes(routes), [routes]);

  const routeLayerBindings = useMemo(
    () =>
      routePaths.slice(0, ROUTE_LAYER_IDS.length).map((route, index) => ({
        layerId: ROUTE_LAYER_IDS[index],
        route,
      })),
    [routePaths],
  );

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || routePaths.length === 0) {
      setRouteLabelItems([]);
      return;
    }

    const map = mapRef.current;
    let animationFrame = 0;

    const updateRouteLabels = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        if (!mapRef.current) {
          return;
        }

        const canvas = map.getCanvas();
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        setRouteLabelItems(
          routePaths.slice(0, ROUTE_LAYER_IDS.length).flatMap((route, index) => {
            const [lng, lat] = getRouteAnchorCoordinate(route);
            const projected = map.project([lng, lat]);
            const offset = ROUTE_LABEL_OFFSETS[index] ?? ROUTE_LABEL_OFFSETS[ROUTE_LABEL_OFFSETS.length - 1];
            const x = projected.x + offset.x;
            const y = projected.y + offset.y;

            if (x < -220 || y < -220 || x > width + 220 || y > height + 220) {
              return [];
            }

            const risk = getRouteRiskLabel(route);

            return [
              {
                routeId: route.routeId,
                rank: route.rank,
                x,
                y,
                accentColor:
                  ROUTE_STYLE.PALETTE[index] ??
                  ROUTE_STYLE.PALETTE[ROUTE_STYLE.PALETTE.length - 1],
                tone: risk.tone,
                riskLabel: risk.label,
                scoreLabel: getRouteScoreLabel(route),
                delayLabel: formatDelayLabel(
                  route.expectedDelayMinutes ?? route.estimatedDelayMinutes,
                ),
                smartEtaLabel: formatRouteArrivalLabel(
                  resolveRouteArrivalDateTime(route),
                ),
                noteLabel: getRouteNoteLabel(route),
              },
            ];
          }),
        );
      });
    };

    updateRouteLabels();

    map.on("move", updateRouteLabels);
    map.on("zoom", updateRouteLabels);
    map.on("resize", updateRouteLabels);
    map.on("rotate", updateRouteLabels);

    return () => {
      cancelAnimationFrame(animationFrame);
      map.off("move", updateRouteLabels);
      map.off("zoom", updateRouteLabels);
      map.off("resize", updateRouteLabels);
      map.off("rotate", updateRouteLabels);
    };
  }, [departAt, mapLoaded, routePaths]);

  function closeRoutePopup(): void {
    routePopupRef.current?.remove();
    routePopupRef.current = null;
  }

  function resolveRouteArrivalDateTime(route: RoutePath): string | null {
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

  function getRouteHoverMarkup(route: RoutePath): string {
    const risk = getRouteRiskLabel(route);
    const smartEtaLabel = formatRouteArrivalLabel(resolveRouteArrivalDateTime(route));
    const expectedDelay = formatDelayLabel(
      route.expectedDelayMinutes ?? route.estimatedDelayMinutes,
    );
    const note = getRouteNoteLabel(route);
    const riskScoreLabel = getRouteScoreLabel(route);

    return `
      <div style="min-width: 160px; color: #f8fafc;">
        <div style="font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: #94a3b8;">Route #${route.rank}</div>
        <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 4px; font-size: 12px;">
          <div><span style="color: #94a3b8;">Smart ETA</span> <span style="font-weight: 600;">${smartEtaLabel}</span></div>
          <div><span style="color: #94a3b8;">Expected delay</span> <span style="font-weight: 600;">${expectedDelay ?? "n/a"}</span></div>
          <div><span style="color: #94a3b8;">Journey risk</span> <span style="font-weight: 600;">${risk.label} (${riskScoreLabel})</span></div>
          ${note ? `<div style="color: #cbd5e1;">${note}</div>` : ""}
        </div>
      </div>
    `;
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    let cancelled = false;

    async function initializeMap(): Promise<void> {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) {
        return;
      }

      maplibreRef.current = maplibregl;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          glyphs: DEFAULT_MAP_GLYPHS_URL,
          sources: {
            [TILE_SOURCE_ID]: {
              type: "raster",
              tiles: [getMapTileUrlTemplate()],
              tileSize: 256,
            },
          },
          layers: [
            {
              id: TILE_LAYER_ID,
              type: "raster",
              source: TILE_SOURCE_ID,
            },
          ],
        } as const,
        center: PALESTINE_CENTER,
        zoom: DEFAULT_ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        maxBounds: PALESTINE_BOUNDS,
        attributionControl: false,
      });

      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-left",
      );

      map.on("load", () => {
        if (!cancelled) {
          setMapLoaded(true);
        }
      });

      mapRef.current = map;
    }

    void initializeMap();

    return () => {
      cancelled = true;
      setMapLoaded(false);
      closeRoutePopup();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) {
      return;
    }

    const map = mapRef.current;
    const existingSource = map.getSource(
      CHECKPOINT_SOURCE_ID,
    ) as GeoJSONSource | undefined;

    if (!existingSource) {
      map.addSource(CHECKPOINT_SOURCE_ID, {
        type: "geojson",
        data: checkpointFeatureCollection,
        cluster: true,
        clusterRadius: 60,
        clusterMaxZoom: 13,
      });

      map.addLayer({
        id: CHECKPOINT_CLUSTER_LAYER_ID,
        type: "circle",
        source: CHECKPOINT_SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": CLUSTER_COLOR_EXPRESSION as any,
          "circle-radius": CLUSTER_RADIUS_EXPRESSION as any,
          "circle-opacity": 0.9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: CHECKPOINT_CLUSTER_COUNT_LAYER_ID,
        type: "symbol",
        source: CHECKPOINT_SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"] as any,
          "text-size": 12,
          "text-font": ["Open Sans Bold"],
        },
        paint: {
          "text-color": "#ffffff",
        },
      });

      map.addLayer({
        id: CHECKPOINT_UNCLUSTERED_LAYER_ID,
        type: "circle",
        source: CHECKPOINT_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "markerColor"] as any,
          "circle-radius": UNCLUSTERED_RADIUS_EXPRESSION as any,
          "circle-opacity": 0.95,
          "circle-stroke-width": 2,
          "circle-stroke-color": ["get", "markerBorderColor"] as any,
        },
      });

      return;
    }

    existingSource.setData(checkpointFeatureCollection);
  }, [checkpointFeatureCollection, mapLoaded]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) {
      return;
    }

    const map = mapRef.current;
    const existingSource = map.getSource(
      USER_LOCATION_SOURCE_ID,
    ) as GeoJSONSource | undefined;

    if (!userLocation) {
      if (existingSource) {
        existingSource.setData({
          type: "FeatureCollection",
          features: [],
        });
      }
      return;
    }

    const userLocationFeatureCollection = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [userLocation.lng, userLocation.lat],
          },
          properties: {
            accuracy: userLocation.accuracy ?? null,
          },
        },
      ],
    };

    if (!existingSource) {
      map.addSource(USER_LOCATION_SOURCE_ID, {
        type: "geojson",
        data: userLocationFeatureCollection,
      });

      map.addLayer({
        id: USER_LOCATION_ACCURACY_LAYER_ID,
        type: "circle",
        source: USER_LOCATION_SOURCE_ID,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "accuracy"], 0],
            0,
            28,
            50,
            40,
            150,
            55,
          ] as any,
          "circle-color": USER_LOCATION_STYLE.ACCURACY_FILL,
          "circle-stroke-color": USER_LOCATION_STYLE.ACCURACY_BORDER,
          "circle-stroke-width": 1,
        },
      });

      map.addLayer({
        id: USER_LOCATION_LAYER_ID,
        type: "circle",
        source: USER_LOCATION_SOURCE_ID,
        paint: {
          "circle-radius": 7,
          "circle-color": USER_LOCATION_STYLE.DOT_COLOR,
          "circle-stroke-color": USER_LOCATION_STYLE.DOT_BORDER_COLOR,
          "circle-stroke-width": 3,
        },
      });
      return;
    }

    existingSource.setData(userLocationFeatureCollection);
  }, [mapLoaded, userLocation]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) {
      return;
    }

    const map = mapRef.current;
    const existingSource = map.getSource(
      ROUTE_ENDPOINT_SOURCE_ID,
    ) as GeoJSONSource | undefined;

    if (!existingSource) {
      map.addSource(ROUTE_ENDPOINT_SOURCE_ID, {
        type: "geojson",
        data: routeEndpointsFeatureCollection,
      });

      map.addLayer({
        id: ROUTE_ENDPOINT_FROM_LAYER_ID,
        type: "circle",
        source: ROUTE_ENDPOINT_SOURCE_ID,
        filter: ["==", ["get", "role"], "from"],
        paint: {
          "circle-radius": 10,
          "circle-color": "#3b82f6",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      map.addLayer({
        id: ROUTE_ENDPOINT_TO_LAYER_ID,
        type: "circle",
        source: ROUTE_ENDPOINT_SOURCE_ID,
        filter: ["==", ["get", "role"], "to"],
        paint: {
          "circle-radius": 10,
          "circle-color": "#f59e0b",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      return;
    }

    existingSource.setData(routeEndpointsFeatureCollection);
  }, [mapLoaded, routeEndpointsFeatureCollection]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !userLocation) {
      return;
    }

    mapRef.current.easeTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 14,
      duration: 900,
    });
  }, [mapLoaded, userLocation]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) {
      return;
    }

    const map = mapRef.current;
    map.getCanvas().style.cursor = placementMode ? "crosshair" : "";

    const handleClusterClick = async (event: any) => {
      if (placementMode && onMapPlacement) {
        onMapPlacement({
          lat: event.lngLat.lat,
          lng: event.lngLat.lng,
        });
        return;
      }

      const clusterFeature = event.features?.[0];
      const clusterId = Number(clusterFeature?.properties?.cluster_id);

      if (!Number.isFinite(clusterId)) {
        return;
      }

      const source = map.getSource(CHECKPOINT_SOURCE_ID) as
        | GeoJSONSource
        | undefined;
      if (!source?.getClusterExpansionZoom) {
        return;
      }

      const zoom = await source.getClusterExpansionZoom(clusterId);
      const [lng, lat] = clusterFeature.geometry.coordinates;

      map.easeTo({
        center: [lng, lat],
        zoom: Math.min(zoom, MAX_ZOOM),
        duration: 500,
      });
    };

    const handleCheckpointClick = (event: any) => {
      if (placementMode && onMapPlacement) {
        onMapPlacement({
          lat: event.lngLat.lat,
          lng: event.lngLat.lng,
        });
        return;
      }

      const checkpointId = String(
        event.features?.[0]?.properties?.checkpointId ?? "",
      );
      if (!checkpointId) {
        return;
      }

      onCheckpointSelect?.(checkpointsById.get(checkpointId) ?? null);
    };

    const handlePointerEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handlePointerLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", CHECKPOINT_CLUSTER_LAYER_ID, handleClusterClick);
    map.on("click", CHECKPOINT_CLUSTER_COUNT_LAYER_ID, handleClusterClick);
    map.on("click", CHECKPOINT_UNCLUSTERED_LAYER_ID, handleCheckpointClick);

    CHECKPOINT_INTERACTIVE_LAYER_IDS.forEach((layerId) => {
      map.on("mouseenter", layerId, handlePointerEnter);
      map.on("mouseleave", layerId, handlePointerLeave);
    });

    return () => {
      map.off("click", CHECKPOINT_CLUSTER_LAYER_ID, handleClusterClick);
      map.off("click", CHECKPOINT_CLUSTER_COUNT_LAYER_ID, handleClusterClick);
      map.off("click", CHECKPOINT_UNCLUSTERED_LAYER_ID, handleCheckpointClick);

      CHECKPOINT_INTERACTIVE_LAYER_IDS.forEach((layerId) => {
        map.off("mouseenter", layerId, handlePointerEnter);
        map.off("mouseleave", layerId, handlePointerLeave);
      });
    };
  }, [checkpointsById, mapLoaded, onCheckpointSelect, onMapPlacement, placementMode]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !onCheckpointSelect) {
      return;
    }

    const map = mapRef.current;

    const handleBackgroundClick = (event: any) => {
      if (placementMode && onMapPlacement) {
        onMapPlacement({
          lat: event.lngLat.lat,
          lng: event.lngLat.lng,
        });
        return;
      }

      const interactiveFeatures = map.queryRenderedFeatures(event.point, {
        layers: [...CHECKPOINT_INTERACTIVE_LAYER_IDS],
      });

      if (interactiveFeatures.length > 0) {
        return;
      }

      onCheckpointSelect(null);
    };

    map.on("click", handleBackgroundClick);

    return () => {
      map.off("click", handleBackgroundClick);
    };
  }, [mapLoaded, onCheckpointSelect, onMapPlacement, placementMode]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) {
      return;
    }

    const map = mapRef.current;
    cleanupRouteLayers(map);

    if (routePaths.length === 0) {
      closeRoutePopup();
      return;
    }

    const selectedRouteId =
      routes.selectedRouteId ?? routePaths[0]?.routeId ?? null;
    const routeIndexById = new Map(
      routePaths.map((route, index) => [route.routeId, index] as const),
    );
    const orderedRoutes = [
      ...routePaths.filter((route) => route.routeId !== selectedRouteId),
      ...routePaths.filter((route) => route.routeId === selectedRouteId),
    ]
      .slice(0, ROUTE_LAYER_IDS.length)
      .map((route) => ({
        route,
        routeIndex: routeIndexById.get(route.routeId) ?? 0,
      }));

    orderedRoutes.forEach(({ route, routeIndex }, index) => {
      const sourceId = ROUTE_LAYER_IDS[index];
      const layerId = ROUTE_LAYER_IDS[index];
      const outlineLayerId = ROUTE_LAYER_OUTLINE_IDS[index];
      const style = getRouteLayerStyle(
        routeIndex,
        route.routeId === selectedRouteId,
      );

      map.addSource(sourceId, {
        type: "geojson",
        data: transformRouteToGeoJSON(route),
      });

      map.addLayer({
        id: outlineLayerId,
        type: "line",
        source: sourceId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": style.outlineColor,
          "line-width": style.outlineWidth,
          "line-opacity": 0.95,
        },
      });

      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": style.color,
          "line-width": style.width,
          "line-opacity": style.opacity,
        },
      });
    });

    const bounds = calculateRouteBounds(routes);
    if (!bounds) {
      return;
    }

    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        padding: { top: 50, right: 50, bottom: 50, left: 50 },
        duration: 1000,
      },
    );
  }, [mapLoaded, routePaths, routes]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) {
      return;
    }

    const map = mapRef.current;

    const routeByLayerId = new Map<string, RoutePath>(
      routeLayerBindings.map((binding) => [binding.layerId, binding.route]),
    );

    const getRouteFromEvent = (event: any): RoutePath | null => {
      const layerId = String(event.features?.[0]?.layer?.id ?? "");
      return routeByLayerId.get(layerId) ?? null;
    };

    const handleRouteMouseEnter = (event: any) => {
      const route = getRouteFromEvent(event);
      if (!route || placementMode) {
        return;
      }

      map.getCanvas().style.cursor = "pointer";

      const Popup = maplibreRef.current?.Popup;
      if (!Popup) {
        return;
      }

      closeRoutePopup();
      routePopupRef.current = new Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 16,
        className: "mashwar-route-hover-popup",
      })
        .setLngLat(event.lngLat)
        .setHTML(getRouteHoverMarkup(route))
        .addTo(map);
    };

    const handleRouteMouseMove = (event: any) => {
      if (!routePopupRef.current || placementMode) {
        return;
      }

      routePopupRef.current.setLngLat(event.lngLat);
    };

    const handleRouteMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      closeRoutePopup();
    };

    const handleRouteClick = (event: any) => {
      const route = getRouteFromEvent(event);
      if (!route) {
        return;
      }

      if (placementMode && onMapPlacement) {
        onMapPlacement({
          lat: event.lngLat.lat,
          lng: event.lngLat.lng,
        });
        return;
      }

      onRouteSelect?.(route.routeId);
      onRouteOpen?.(route.routeId);
    };

    routeLayerBindings.forEach(({ layerId }) => {
      if (!map.getLayer(layerId)) {
        return;
      }

      map.on("mouseenter", layerId, handleRouteMouseEnter);
      map.on("mousemove", layerId, handleRouteMouseMove);
      map.on("mouseleave", layerId, handleRouteMouseLeave);
      map.on("click", layerId, handleRouteClick);
    });

    return () => {
      closeRoutePopup();

      routeLayerBindings.forEach(({ layerId }) => {
        if (!map.getLayer(layerId)) {
          return;
        }

        map.off("mouseenter", layerId, handleRouteMouseEnter);
        map.off("mousemove", layerId, handleRouteMouseMove);
        map.off("mouseleave", layerId, handleRouteMouseLeave);
        map.off("click", layerId, handleRouteClick);
      });
    };
  }, [
    departAt,
    mapLoaded,
    onMapPlacement,
    onRouteOpen,
    onRouteSelect,
    placementMode,
    routeLayerBindings,
  ]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />

      <div className="pointer-events-none absolute inset-0">
        {routeLabelItems.map((item) => {
          const toneStyles = getRouteToneStyles(item.tone);

          return (
            <div
              key={item.routeId}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: item.x, top: item.y }}
            >
              <div
                className="w-[196px] rounded-[18px] border border-slate-200 bg-white/92 px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur-xl"
                style={{
                  borderLeftColor: item.accentColor,
                  borderLeftWidth: 4,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Route #{item.rank}
                  </p>
                  <span
                    className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                    style={{
                      color: toneStyles.text,
                      backgroundColor: toneStyles.background,
                      borderColor: toneStyles.border,
                    }}
                  >
                    {item.riskLabel}
                  </span>
                </div>

                <div className="mt-2 text-[28px] font-semibold leading-none text-slate-950">
                  {item.smartEtaLabel}
                </div>

                <div className="mt-2 space-y-1 text-[12px] leading-5 text-slate-600">
                  <p>Smart ETA</p>
                  {item.delayLabel ? (
                    <p style={{ color: item.accentColor }}>{item.delayLabel}</p>
                  ) : (
                    <p className="text-slate-500">No predicted delay</p>
                  )}
                  <p>{item.scoreLabel}</p>
                  {item.noteLabel ? (
                    <p style={{ color: item.accentColor }}>{item.noteLabel}</p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
