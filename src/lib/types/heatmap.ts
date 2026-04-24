import type { Feature, FeatureCollection, LineString } from "geojson";

export interface HeatmapCorridorProperties {
  id: string;
  from_checkpoint_id: number | string | null;
  to_checkpoint_id: number | string | null;
  from_checkpoint_name?: string | null;
  to_checkpoint_name?: string | null;
  distance_m?: number | null;
}

export type HeatmapCorridorFeature = Feature<
  LineString,
  HeatmapCorridorProperties
>;

export type HeatmapCorridorFeatureCollection = FeatureCollection<
  LineString,
  HeatmapCorridorProperties
>;

export type HeatmapSeverity = "low" | "medium" | "high" | "critical";

export interface HeatmapSegmentProperties extends HeatmapCorridorProperties {
  corridor_id: string;
  from_score: number;
  to_score: number;
  score: number;
  severity: HeatmapSeverity;
}

export type HeatmapSegmentFeature = Feature<
  LineString,
  HeatmapSegmentProperties
>;

export type HeatmapSegmentFeatureCollection = FeatureCollection<
  LineString,
  HeatmapSegmentProperties
>;

export interface HeatmapRouteBuiltPayload {
  type: "route_built";
  completed?: number;
  total?: number;
  corridor?: {
    id?: string | null;
    from_checkpoint_id?: number | string | null;
    to_checkpoint_id?: number | string | null;
    from_checkpoint_name?: string | null;
    to_checkpoint_name?: string | null;
    distance_m?: number | null;
    geometry?: {
      type?: string | null;
      coordinates?: unknown;
    } | null;
  } | null;
}

export interface HeatmapProgressPayload {
  type: "progress";
  completed?: number;
  total?: number;
  built?: number;
  skipped?: number;
  failed?: number;
  cached?: boolean;
}

export interface HeatmapTerminalPayload {
  type: "done" | "error";
  completed?: number;
  total?: number;
  built?: number;
  skipped?: number;
  failed?: number;
  cached?: boolean;
  message?: string | null;
  error?: string | null;
}

export interface HeatmapStartPayload {
  type: "start";
  completed?: number;
  total?: number;
  built?: number;
  skipped?: number;
  failed?: number;
  cached?: boolean;
  message?: string | null;
}

export interface HeatmapRouteSkippedPayload {
  type: "route_skipped";
  completed?: number;
  total?: number;
  built?: number;
  skipped?: number;
  failed?: number;
  corridor_id?: string | null;
  reason?: string | null;
}

export interface HeatmapRouteFailedPayload {
  type: "route_failed";
  completed?: number;
  total?: number;
  built?: number;
  skipped?: number;
  failed?: number;
  corridor_id?: string | null;
  reason?: string | null;
  message?: string | null;
}

export type HeatmapStreamPayload =
  | HeatmapStartPayload
  | HeatmapRouteBuiltPayload
  | HeatmapRouteSkippedPayload
  | HeatmapRouteFailedPayload
  | HeatmapProgressPayload
  | HeatmapTerminalPayload;

export interface HeatmapBuildProgress {
  completed: number;
  total: number;
  percentage: number;
  built: number;
  skipped: number;
  failed: number;
  cached: boolean;
}

export interface HeatmapCacheMissResponse {
  cached: false;
  message?: string;
}
