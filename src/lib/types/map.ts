import type { LineString } from "geojson";

export type LngLatCoordinate = [number, number];

export type MapCheckpointStatus =
  | "سالك"
  | "أزمة متوسطة"
  | "أزمة خانقة"
  | "مغلق"
  | "غير معروف";

export interface CheckpointFeatureProperties {
  checkpointId: string;
  checkpointName: string;
  markerColor: string;
  markerBorderColor: string;
  worstStatus: MapCheckpointStatus;
}

export interface CheckpointApiRecord {
  id?: string | number | null;
  name?: string | null;
  nameAr?: string | null;
  checkpoint?: string | null;
  city?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  alert_text?: string | null;
  status?: string | null;
  current_status?: string | null;
  currentStatus?: string | null;
  entering_status?: string | null;
  enteringStatus?: string | null;
  leaving_status?: string | null;
  leavingStatus?: string | null;
  entering_status_last_updated?: string | null;
  enteringStatusLastUpdated?: string | null;
  leaving_status_last_updated?: string | null;
  leavingStatusLastUpdated?: string | null;
}

export interface CheckpointApiEnvelope {
  success?: boolean;
  data?: CheckpointApiRecord[] | null;
}

export type CheckpointForecastStatusType = "entering" | "leaving";

export type CheckpointForecastHorizon =
  | "plus_30m"
  | "plus_1h"
  | "plus_2h"
  | "next_day_8am";

export interface MapCheckpoint {
  id: string;
  name: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  enteringStatus: MapCheckpointStatus;
  leavingStatus: MapCheckpointStatus;
  enteringStatusLastUpdated: string | null;
  leavingStatusLastUpdated: string | null;
  alertText: string | null;
}

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number | null;
}

export interface CheckpointForecastPredictionDto {
  target_datetime?: string | null;
  status_type?: string | null;
  predicted_status?: string | null;
  confidence?: number | string | null;
  class_probabilities?: Record<string, number | string> | null;
}

export interface CheckpointForecastPredictionItemDto {
  horizon?: string | null;
  target_datetime?: string | null;
  prediction?: CheckpointForecastPredictionDto | null;
}

export interface CheckpointForecastRequestDto {
  checkpoint_id?: number | string | null;
  status_type?: string | null;
  as_of?: string | null;
}

export interface CheckpointForecastResponseDataDto {
  checkpoint?: CheckpointApiRecord | null;
  request?: CheckpointForecastRequestDto | null;
  predictions?: CheckpointForecastPredictionItemDto[] | null;
}

export interface CheckpointForecastApiEnvelope {
  success?: boolean;
  data?: CheckpointForecastResponseDataDto | null;
}

export interface NormalizedCheckpointForecastPrediction {
  horizon: CheckpointForecastHorizon | string;
  targetDateTime: string | null;
  statusType: CheckpointForecastStatusType | string;
  predictedStatus: MapCheckpointStatus;
  rawPredictedStatus: string | null;
  confidence: number | null;
  classProbabilities: Record<string, number>;
}

export interface NormalizedCheckpointForecastTimelineItem {
  horizon: CheckpointForecastHorizon | string;
  targetDateTime: string | null;
  prediction: NormalizedCheckpointForecastPrediction;
}

export interface NormalizedCheckpointForecast {
  checkpoint: MapCheckpoint;
  request: {
    checkpointId: string;
    statusType: CheckpointForecastStatusType | string;
    asOf: string | null;
  };
  predictions: NormalizedCheckpointForecastTimelineItem[];
}

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RoutePathDto {
  distance?: number | string | null;
  time?: number | string | null;
  points?: {
    type?: string | null;
    coordinates?: unknown;
  } | null;
  instructions?: unknown;
  ascend?: number | string | null;
  descend?: number | string | null;
  snapped_waypoints?: unknown;
}

export interface RoutingResponseDto {
  paths?: RoutePathDto[] | null;
  info?: {
    copyrights?: string[];
    took?: number;
  } | null;
}

export interface RoutingApiEnvelope {
  success?: boolean;
  data?: RoutingResponseDto | null;
}

export interface RoutePath {
  distance: number;
  time: number;
  points: LineString & {
    coordinates: LngLatCoordinate[];
  };
  instructions?: unknown[];
  ascend?: number;
  descend?: number;
}

export interface RoutingRequest {
  startPoint: RoutePoint;
  endPoint: RoutePoint;
}

export interface NormalizedRoutes {
  mainRoute: RoutePath | null;
  alternativeRoutes: RoutePath[];
}
