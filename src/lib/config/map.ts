import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
} from "geojson";

import type {
  CheckpointFeatureProperties,
  LngLatCoordinate,
  MapCheckpoint,
  MapCheckpointStatus,
  NormalizedRoutes,
  RoutePath,
  RoutePoint,
  RoutingRequest,
} from "@/lib/types/map";

export const DEFAULT_MAP_TILE_URL_TEMPLATE =
  "http://164.68.121.28/tiles/{z}/{x}/{y}.png";
export const DEFAULT_MAP_GLYPHS_URL =
  "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

export const PALESTINE_CENTER: LngLatCoordinate = [35.1, 31.4];
export const PALESTINE_BOUNDS: [LngLatCoordinate, LngLatCoordinate] = [
  [33.9, 29.2],
  [36.3, 33.6],
];

export const DEFAULT_ZOOM = 8;
export const MIN_ZOOM = 5;
export const MAX_ZOOM = 16;

export const TILE_SOURCE_ID = "west-bank-raster-source";
export const TILE_LAYER_ID = "west-bank-raster-layer";

export const CHECKPOINT_SOURCE_ID = "checkpoint-source";
export const CHECKPOINT_CLUSTER_LAYER_ID = "checkpoint-cluster-layer";
export const CHECKPOINT_CLUSTER_COUNT_LAYER_ID =
  "checkpoint-cluster-count-layer";
export const CHECKPOINT_UNCLUSTERED_LAYER_ID =
  "checkpoint-unclustered-layer";

export const CHECKPOINT_INTERACTIVE_LAYER_IDS = [
  CHECKPOINT_CLUSTER_LAYER_ID,
  CHECKPOINT_CLUSTER_COUNT_LAYER_ID,
  CHECKPOINT_UNCLUSTERED_LAYER_ID,
] as const;

export const ROUTE_MAIN_SOURCE_ID = "route-main-source";
export const ROUTE_MAIN_LAYER_ID = "route-main-layer";
export const ROUTE_ALT_1_SOURCE_ID = "route-alt-1-source";
export const ROUTE_ALT_1_LAYER_ID = "route-alt-1-layer";
export const ROUTE_ALT_2_SOURCE_ID = "route-alt-2-source";
export const ROUTE_ALT_2_LAYER_ID = "route-alt-2-layer";
export const USER_LOCATION_SOURCE_ID = "user-location-source";
export const USER_LOCATION_LAYER_ID = "user-location-layer";
export const USER_LOCATION_ACCURACY_LAYER_ID = "user-location-accuracy-layer";
export const HEATMAP_CORRIDOR_SOURCE_ID = "mashwar-uncertainty-corridors";
export const HEATMAP_CORRIDOR_GLOW_LAYER_ID =
  "mashwar-uncertainty-corridors-glow";
export const HEATMAP_CORRIDOR_MAIN_LAYER_ID =
  "mashwar-uncertainty-corridors-main";

export const ROUTE_STYLE = {
  MAIN_WIDTH: 6.5,
  MAIN_OPACITY: 1,
  ALT_WIDTH: 5.5,
  ALT_OPACITY: 1,
  OUTLINE_COLOR: "#0f172a",
  OUTLINE_WIDTH: 10,
  PALETTE: ["#006233", "#f59e0b", "#ee2a35"] as const,
} as const;

export const USER_LOCATION_STYLE = {
  DOT_COLOR: "#00a651",
  DOT_BORDER_COLOR: "#ffffff",
  ACCURACY_FILL: "#00a65133",
  ACCURACY_BORDER: "#00a65180",
} as const;

export const HEATMAP_COLOR_EXPRESSION = [
  "step",
  ["get", "score"],
  "#22c55e",
  30,
  "#facc15",
  60,
  "#f97316",
  80,
  "#ef4444",
] as const;

export const HEATMAP_MAIN_WIDTH_EXPRESSION = [
  "interpolate",
  ["linear"],
  ["zoom"],
  8,
  2,
  11,
  4,
  14,
  7,
] as const;

export const HEATMAP_GLOW_WIDTH_EXPRESSION = [
  "interpolate",
  ["linear"],
  ["zoom"],
  8,
  8,
  11,
  14,
  14,
  22,
] as const;

export const STATUS_COLORS: Record<MapCheckpointStatus, string> = {
  سالك: "#00a651",
  "أزمة متوسطة": "#f59e0b",
  "أزمة خانقة": "#ee2a35",
  مغلق: "#ee2a35",
  "غير معروف": "#94a3b8",
};

export const STATUS_BORDERS: Record<MapCheckpointStatus, string> = {
  سالك: "#006233",
  "أزمة متوسطة": "#f59e0b",
  "أزمة خانقة": "#c41f29",
  مغلق: "#c41f29",
  "غير معروف": "#64748b",
};

export const CLUSTER_COLOR_EXPRESSION = [
  "step",
  ["get", "point_count"],
  "#b8e6ce",
  25,
  "#00a651",
  75,
  "#006233",
  150,
  "#ee2a35",
] as const;

export const CLUSTER_RADIUS_EXPRESSION = [
  "step",
  ["get", "point_count"],
  16,
  25,
  22,
  75,
  28,
  150,
  34,
] as const;

export const UNCLUSTERED_RADIUS_EXPRESSION = [
  "interpolate",
  ["linear"],
  ["zoom"],
  5,
  5,
  10,
  7,
  16,
  10,
] as const;

export const DEMO_ROUTE_REQUEST: RoutingRequest = {
  origin: { lat: 31.9038, lng: 35.2034 },
  destination: { lat: 31.7054, lng: 35.2024 },
  profile: "car",
};

const STATUS_PRIORITY: MapCheckpointStatus[] = [
  "مغلق",
  "أزمة خانقة",
  "أزمة متوسطة",
  "سالك",
  "غير معروف",
];

const STATUS_ALIASES: Record<string, MapCheckpointStatus> = {
  سالك: "سالك",
  open: "سالك",
  normal: "سالك",
  clear: "سالك",
  "low delay": "سالك",
  "low traffic": "سالك",
  "free flow": "سالك",
  "أزمة متوسطة": "أزمة متوسطة",
  moderate: "أزمة متوسطة",
  medium: "أزمة متوسطة",
  warning: "أزمة متوسطة",
  "medium delay": "أزمة متوسطة",
  "medium traffic": "أزمة متوسطة",
  "crisis medium": "أزمة متوسطة",
  أزمة: "أزمة متوسطة",
  "أزمة خانقة": "أزمة خانقة",
  severe: "أزمة خانقة",
  "heavy traffic": "أزمة خانقة",
  "high delay": "أزمة خانقة",
  "crisis severe": "أزمة خانقة",
  jammed: "أزمة خانقة",
  مغلق: "مغلق",
  closed: "مغلق",
  blocked: "مغلق",
  block: "مغلق",
  "غير معروف": "غير معروف",
  unknown: "غير معروف",
  unavailable: "غير معروف",
  "n/a": "غير معروف",
};

function normalizeStatusKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isValidTileTemplate(
  value: string | null | undefined,
): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  return (
    (trimmed.startsWith("http://") || trimmed.startsWith("https://")) &&
    trimmed.includes("{z}") &&
    trimmed.includes("{x}") &&
    trimmed.includes("{y}")
  );
}

export function getMapTileUrlTemplate(): string {
  const configured = process.env.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE;
  if (isValidTileTemplate(configured)) {
    return configured.trim();
  }

  return DEFAULT_MAP_TILE_URL_TEMPLATE;
}

export function hasValidCoordinates(
  latitude?: number | null,
  longitude?: number | null,
): boolean {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function normalizeCheckpointStatus(
  status: string | null | undefined,
): MapCheckpointStatus {
  if (!status) {
    return "غير معروف";
  }

  const normalized = STATUS_ALIASES[normalizeStatusKey(status)];
  return normalized ?? "غير معروف";
}

export function getWorstStatus(
  enteringStatus: MapCheckpointStatus,
  leavingStatus: MapCheckpointStatus,
): MapCheckpointStatus {
  const enteringIndex = STATUS_PRIORITY.indexOf(enteringStatus);
  const leavingIndex = STATUS_PRIORITY.indexOf(leavingStatus);

  const worstIndex = Math.min(
    enteringIndex === -1 ? STATUS_PRIORITY.length - 1 : enteringIndex,
    leavingIndex === -1 ? STATUS_PRIORITY.length - 1 : leavingIndex,
  );

  return STATUS_PRIORITY[worstIndex];
}

export function getStatusColor(status: MapCheckpointStatus): string {
  return STATUS_COLORS[status] ?? STATUS_COLORS["غير معروف"];
}

export function getStatusBorderColor(status: MapCheckpointStatus): string {
  return STATUS_BORDERS[status] ?? STATUS_BORDERS["غير معروف"];
}

export function buildCheckpointFeatureCollection(
  checkpoints: MapCheckpoint[],
): FeatureCollection<Point, CheckpointFeatureProperties> {
  const mappableCheckpoints = checkpoints.filter(
    (
      checkpoint,
    ): checkpoint is MapCheckpoint & { latitude: number; longitude: number } =>
      hasValidCoordinates(checkpoint.latitude, checkpoint.longitude),
  );

  const features: Array<Feature<Point, CheckpointFeatureProperties>> =
    mappableCheckpoints
      .map((checkpoint) => {
        const worstStatus = getWorstStatus(
          checkpoint.enteringStatus,
          checkpoint.leavingStatus,
        );

        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [checkpoint.longitude, checkpoint.latitude],
          },
          properties: {
            checkpointId: checkpoint.id,
            checkpointName: checkpoint.name,
            markerColor: getStatusColor(worstStatus),
            markerBorderColor: getStatusBorderColor(worstStatus),
            worstStatus,
          },
        };
      });

  return {
    type: "FeatureCollection",
    features,
  };
}

export function validateRoutePoint(point: RoutePoint): void {
  if (!hasValidCoordinates(point.lat, point.lng)) {
    throw new Error("Route points must include valid lat/lng coordinates.");
  }
}

export function transformRouteToGeoJSON(
  route: RoutePath,
): Feature<LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: route.geometry.coordinates,
    },
  };
}

export function getRenderableRoutes(routes: NormalizedRoutes): RoutePath[] {
  if (routes.routes.length > 0) {
    return routes.routes;
  }

  return [routes.mainRoute, ...routes.alternativeRoutes].filter(
    (route): route is RoutePath => Boolean(route),
  );
}

/** Rounded minutes for UI summaries: smart ETA when present, else raw drive time (matches MapView popups). */
export function getRouteDisplayEtaMinutes(route: RoutePath): number {
  if (route.smartEtaMinutes != null && Number.isFinite(route.smartEtaMinutes)) {
    return Math.round(route.smartEtaMinutes);
  }

  const ms = route.smartEtaMs ?? route.durationMs;
  if (typeof ms === "number" && Number.isFinite(ms) && ms > 0) {
    return Math.round(ms / 60000);
  }

  return Math.round(route.durationMinutes);
}

export function calculateRouteBounds(
  routes: NormalizedRoutes,
): [number, number, number, number] | null {
  const routePaths = getRenderableRoutes(routes);

  const coordinates = routePaths.flatMap((route) => route.geometry.coordinates);
  if (coordinates.length === 0) {
    return null;
  }

  const initial = {
    minLng: Number.POSITIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
  };

  const bounds = coordinates.reduce((accumulator, [lng, lat]) => {
    return {
      minLng: Math.min(accumulator.minLng, lng),
      minLat: Math.min(accumulator.minLat, lat),
      maxLng: Math.max(accumulator.maxLng, lng),
      maxLat: Math.max(accumulator.maxLat, lat),
    };
  }, initial);

  const lngPadding = (bounds.maxLng - bounds.minLng) * 0.05;
  const latPadding = (bounds.maxLat - bounds.minLat) * 0.05;

  return [
    bounds.minLng - lngPadding,
    bounds.minLat - latPadding,
    bounds.maxLng + lngPadding,
    bounds.maxLat + latPadding,
  ];
}
