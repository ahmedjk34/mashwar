import type { FeatureCollection, GeoJsonProperties, LineString } from "geojson";

import { getGeoApiBaseUrl } from "@/lib/services/geo-api";
import type {
  HeatmapBuildProgress,
  HeatmapCacheMissResponse,
  HeatmapCorridorFeature,
  HeatmapCorridorFeatureCollection,
  HeatmapProgressPayload,
  HeatmapRouteBuiltPayload,
  HeatmapRouteFailedPayload,
  HeatmapRouteSkippedPayload,
  HeatmapStartPayload,
  HeatmapStreamPayload,
  HeatmapTerminalPayload,
} from "@/lib/types/heatmap";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLineStringFeatureCollection(
  payload: unknown,
): payload is HeatmapCorridorFeatureCollection {
  if (!isObject(payload) || payload.type !== "FeatureCollection") {
    return false;
  }

  if (!Array.isArray(payload.features)) {
    return false;
  }

  return payload.features.every((feature) => {
    return (
      isObject(feature) &&
      feature.type === "Feature" &&
      isObject(feature.geometry) &&
      feature.geometry.type === "LineString" &&
      Array.isArray(feature.geometry.coordinates)
    );
  });
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toCoordinates(value: unknown): LineString["coordinates"] | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const coordinates = value
    .map((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return null;
      }

      const lng = toFiniteNumber(coordinate[0]);
      const lat = toFiniteNumber(coordinate[1]);
      if (lng === null || lat === null) {
        return null;
      }

      return [lng, lat] as [number, number];
    })
    .filter((coordinate): coordinate is [number, number] => coordinate !== null);

  return coordinates.length >= 2 ? coordinates : null;
}

function toCorridorFeature(payload: HeatmapRouteBuiltPayload["corridor"]): HeatmapCorridorFeature | null {
  if (!payload || !payload.geometry || payload.geometry.type !== "LineString") {
    return null;
  }

  const coordinates = toCoordinates(payload.geometry.coordinates);
  if (!coordinates) {
    return null;
  }

  const corridorId =
    (typeof payload.id === "string" && payload.id.trim()
      ? payload.id.trim()
      : null) ??
    `${String(payload.from_checkpoint_id ?? "unknown")}-${String(payload.to_checkpoint_id ?? "unknown")}`;

  return {
    type: "Feature",
    properties: {
      id: corridorId,
      from_checkpoint_id: payload.from_checkpoint_id ?? null,
      to_checkpoint_id: payload.to_checkpoint_id ?? null,
      from_checkpoint_name: payload.from_checkpoint_name ?? null,
      to_checkpoint_name: payload.to_checkpoint_name ?? null,
      distance_m: toFiniteNumber(payload.distance_m) ?? null,
    },
    geometry: {
      type: "LineString",
      coordinates,
    },
  };
}

function getHeatmapErrorMessage(response: Response): Promise<string> {
  return response
    .json()
    .then((payload: { error?: string; detail?: string; message?: string }) => {
      return (
        payload.error ??
        payload.detail ??
        payload.message ??
        `Heatmap request failed with status ${response.status}.`
      );
    })
    .catch(() => `Heatmap request failed with status ${response.status}.`);
}

export function createEmptyHeatmapBuildProgress(): HeatmapBuildProgress {
  return {
    completed: 0,
    total: 0,
    percentage: 0,
    built: 0,
    skipped: 0,
    failed: 0,
    cached: false,
  };
}

export function mergeHeatmapProgress(
  current: HeatmapBuildProgress,
  payload:
    | HeatmapStartPayload
    | HeatmapProgressPayload
    | HeatmapTerminalPayload
    | HeatmapRouteBuiltPayload
    | HeatmapRouteSkippedPayload
    | HeatmapRouteFailedPayload,
): HeatmapBuildProgress {
  const completed = Math.max(
    0,
    Math.trunc(toFiniteNumber(payload.completed) ?? current.completed),
  );
  const total = Math.max(
    completed,
    Math.trunc(toFiniteNumber(payload.total) ?? current.total),
  );
  const built = Math.max(
    0,
    Math.trunc(
      toFiniteNumber((payload as HeatmapProgressPayload).built) ?? current.built,
    ),
  );
  const skipped = Math.max(
    0,
    Math.trunc(
      toFiniteNumber((payload as HeatmapProgressPayload).skipped) ?? current.skipped,
    ),
  );
  const failed = Math.max(
    0,
    Math.trunc(
      toFiniteNumber((payload as HeatmapProgressPayload).failed) ?? current.failed,
    ),
  );

  return {
    completed,
    total,
    built,
    skipped,
    failed,
    cached:
      "cached" in payload && typeof payload.cached === "boolean"
        ? payload.cached
        : current.cached,
    percentage:
      total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0,
  };
}

export async function fetchHeatmapCache(): Promise<
  HeatmapCorridorFeatureCollection | HeatmapCacheMissResponse
> {
  const response = await fetch(`${getGeoApiBaseUrl("the uncertainty network")}/heatmap`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await getHeatmapErrorMessage(response));
  }

  const payload: unknown = await response.json();
  if (isLineStringFeatureCollection(payload)) {
    return payload;
  }

  if (isObject(payload) && payload.cached === false) {
    return {
      cached: false,
      message:
        typeof payload.message === "string" ? payload.message : undefined,
    };
  }

  throw new Error("Invalid uncertainty network response.");
}

export function createHeatmapFeatureCollection(
  features: HeatmapCorridorFeature[],
): FeatureCollection<LineString, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features,
  };
}

export function streamHeatmapNetwork(handlers: {
  onStart?: (payload: HeatmapStartPayload) => void;
  onRouteBuilt?: (
    corridor: HeatmapCorridorFeature,
    payload: HeatmapRouteBuiltPayload,
  ) => void;
  onRouteSkipped?: (payload: HeatmapRouteSkippedPayload) => void;
  onRouteFailed?: (payload: HeatmapRouteFailedPayload) => void;
  onProgress?: (payload: HeatmapProgressPayload) => void;
  onDone?: (payload: HeatmapTerminalPayload) => void;
  onError?: (message: string, payload?: HeatmapTerminalPayload) => void;
}): EventSource {
  const eventSource = new EventSource(
    `${getGeoApiBaseUrl("the uncertainty network")}/heatmap/stream`,
  );

  eventSource.onmessage = (event) => {
    let payload: HeatmapStreamPayload;

    try {
      payload = JSON.parse(event.data) as HeatmapStreamPayload;
    } catch {
      handlers.onError?.("Received an invalid uncertainty stream payload.");
      return;
    }

    switch (payload.type) {
      case "start":
        handlers.onStart?.(payload);
        return;
      case "route_built": {
        const corridor = toCorridorFeature(payload.corridor);
        if (!corridor) {
          handlers.onError?.("Received a corridor without usable geometry.");
          return;
        }

        handlers.onRouteBuilt?.(corridor, payload);
        return;
      }
      case "route_skipped":
        handlers.onRouteSkipped?.(payload);
        return;
      case "route_failed":
        handlers.onRouteFailed?.(payload);
        return;
      case "progress":
        handlers.onProgress?.(payload);
        return;
      case "done":
        handlers.onDone?.(payload);
        return;
      case "error":
        handlers.onError?.(
          payload.message ?? payload.error ?? "تعذر تحميل شبكة عدم اليقين",
          payload,
        );
        return;
      default:
        handlers.onError?.("Received an unknown uncertainty stream event.");
    }
  };

  eventSource.onerror = () => {
    handlers.onError?.("تعذر تحميل شبكة عدم اليقين");
  };

  return eventSource;
}
