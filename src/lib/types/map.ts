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

export type CheckpointForecastStatusType = "entering" | "leaving" | "both";

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

export interface CheckpointForecastPredictionsDto {
  entering?: CheckpointForecastPredictionItemDto[] | null;
  leaving?: CheckpointForecastPredictionItemDto[] | null;
}

export interface CheckpointForecastRequestDto {
  checkpoint_id?: number | string | null;
  status_type?: string | null;
  as_of?: string | null;
}

export interface CheckpointForecastResponseDataDto {
  checkpoint?: CheckpointApiRecord | null;
  request?: CheckpointForecastRequestDto | null;
  predictions?: CheckpointForecastPredictionItemDto[] | CheckpointForecastPredictionsDto | null;
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
    asOfPalestine?: string | null;
  };
  predictions: {
    entering: NormalizedCheckpointForecastTimelineItem[];
    leaving: NormalizedCheckpointForecastTimelineItem[];
  };
}

export interface CheckpointPredictionRequestDto {
  checkpoint_id?: number | string | null;
  target_datetime?: string | null;
  status_type?: string | null;
}

export interface CheckpointPredictionResponseDataDto {
  checkpoint?: CheckpointApiRecord | null;
  request?: CheckpointPredictionRequestDto | null;
  prediction?: CheckpointForecastPredictionDto | null;
}

export interface CheckpointPredictionApiEnvelope {
  success?: boolean;
  data?: CheckpointPredictionResponseDataDto | null;
}

export interface NormalizedCheckpointPrediction {
  checkpoint: MapCheckpoint;
  request: {
    checkpointId: string;
    targetDateTime: string | null;
    targetDateTimePalestine?: string | null;
    statusType: CheckpointForecastStatusType | string;
  };
  prediction: NormalizedCheckpointForecastPrediction;
}

export interface RoutePoint {
  lat: number;
  lng: number;
}

export type RoutingRouteViability = "good" | "risky" | "avoid";

export type RoutingStatusBucket = "green" | "yellow" | "red" | "unknown";

export type RoutingRiskLevel = "low" | "medium" | "high" | "unknown";

export interface RoutingV2Request {
  origin: RoutePoint;
  destination: RoutePoint;
  depart_at?: string;
  origin_city?: string | null;
  destination_city?: string | null;
  originCity?: string | null;
  destinationCity?: string | null;
  profile: "car";
}

export interface RoutingV2CheckpointMatchingDto {
  mode?: string | null;
  outer_threshold_m?: number | string | null;
  strong_match_distance_m?: number | string | null;
  medium_match_distance_m?: number | string | null;
  weak_match_distance_m?: number | string | null;
  static_checkpoint_source?: string | null;
  city_source?: string | null;
  city_inference?: string | null;
  direction_mode?: string | null;
}

export type RoutingCheckpointMatchConfidence =
  | "strong"
  | "medium"
  | "weak"
  | "unknown";

export type RoutingCheckpointDirection =
  | "entering"
  | "leaving"
  | "transit"
  | "unknown";

export type RoutingCheckpointSelectedStatusType =
  | "entering"
  | "leaving"
  | "worst";

export interface RoutingV2CheckpointRawStatusDto {
  entering_status?: string | null;
  leaving_status?: string | null;
  entering_status_last_updated?: string | null;
  leaving_status_last_updated?: string | null;
  alert_text?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

export interface RoutingV2CheckpointDto {
  checkpoint_id?: number | string | null;
  name?: string | null;
  city?: string | null;
  checkpoint_city_group?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  distance_from_route_m?: number | string | null;
  match_confidence?: string | null;
  route_direction?: string | null;
  projection_t?: number | string | null;
  nearest_segment_index?: number | string | null;
  projected_point_on_route?: unknown;
  chainage_m?: number | string | null;
  eta_ms?: number | string | null;
  eta_seconds?: number | string | null;
  eta_minutes?: number | string | null;
  crossing_datetime?: string | null;
  current_status?: string | null;
  current_status_raw?: RoutingV2CheckpointRawStatusDto | null;
  predicted_status_at_eta?: string | null;
  forecast_confidence?: number | string | null;
  forecast_source?: string | null;
  forecast_model_version?: number | string | null;
  forecast_reason?: string | null;
  base_eta_ms?: number | string | null;
  effective_eta_ms?: number | string | null;
  cumulative_delay_ms_before_checkpoint?: number | string | null;
  expected_delay_ms?: number | string | null;
  expected_delay_minutes?: number | string | null;
  forecast_probabilities?: Record<string, number | string> | null;
  severity_ratio?: number | string | null;
  selected_status_type?: string | null;
}

export interface RoutingV2RouteDto {
  route_id?: string | null;
  rank?: number | string | null;
  original_index?: number | string | null;
  distance_m?: number | string | null;
  duration_ms?: number | string | null;
  duration_minutes?: number | string | null;
  geometry?: {
    type?: string | null;
    coordinates?: unknown;
  } | null;
  snapped_waypoints?: unknown;
  bbox?: unknown;
  ascend?: number | string | null;
  descend?: number | string | null;
  checkpoint_count?: number | string | null;
  route_score?: number | string | null;
  route_viability?: string | null;
  worst_predicted_status?: string | null;
  reason_summary?: string | null;
  checkpoints?: RoutingV2CheckpointDto[] | null;
  smart_eta_ms?: number | string | null;
  smart_eta_minutes?: number | string | null;
  smart_eta_datetime?: string | null;
  expected_delay_ms?: number | string | null;
  expected_delay_minutes?: number | string | null;
  risk_score?: number | string | null;
  risk_level?: string | null;
  risk_confidence?: number | string | null;
  risk_components?: unknown;
  historical_volatility?: number | string | null;
  graphhopper?: {
    details?: Record<string, unknown> | null;
    instructions?: unknown[] | null;
  } | null;
}

export interface RoutingV2ResponseDataDto {
  generated_at?: string | null;
  version?: string | null;
  checkpoint_matching?: RoutingV2CheckpointMatchingDto | null;
  origin?: RoutePoint | null;
  destination?: RoutePoint | null;
  depart_at?: string | null;
  warnings?: unknown;
  graphhopper_info?: Record<string, unknown> | null;
  routes?: RoutingV2RouteDto[] | null;
}

export interface RoutingApiEnvelope {
  success?: boolean;
  data?: RoutingV2ResponseDataDto | null;
}

export interface RoutingCheckpoint {
  checkpointId: string;
  name: string;
  city: string | null;
  checkpointCityGroup: string | null;
  lat: number;
  lng: number;
  routeDirection: RoutingCheckpointDirection;
  matchConfidence: RoutingCheckpointMatchConfidence;
  projectionT: number | null;
  distanceFromRouteM: number;
  nearestSegmentIndex: number;
  projectedPointOnRoute: LngLatCoordinate | null;
  chainageM: number;
  etaMs: number;
  etaSeconds: number;
  etaMinutes: number;
  crossingDateTime: string | null;
  currentStatus: RoutingStatusBucket;
  currentStatusRaw: RoutingV2CheckpointRawStatusDto | null;
  predictedStatusAtEta: RoutingStatusBucket;
  forecastConfidence: number | null;
  forecastSource: string | null;
  forecastModelVersion: number | null;
  forecastReason: string | null;
  baseEtaMs: number | null;
  effectiveEtaMs: number | null;
  cumulativeDelayMsBeforeCheckpoint: number | null;
  expectedDelayMs: number | null;
  expectedDelayMinutes: number | null;
  forecastProbabilities: Record<string, number>;
  severityRatio: number | null;
  selectedStatusType: RoutingCheckpointSelectedStatusType | string | null;
  crossingDateTimePalestine?: string | null;
}

export interface RoutePath {
  routeId: string;
  rank: number;
  originalIndex: number;
  distanceM: number;
  durationMs: number;
  durationMinutes: number;
  estimatedDelayMinutes: number | null;
  geometry: LineString & {
    coordinates: LngLatCoordinate[];
  };
  snappedWaypoints: unknown | null;
  bbox: unknown | null;
  ascend: number | null;
  descend: number | null;
  checkpointCount: number;
  routeScore: number;
  routeViability: RoutingRouteViability;
  worstPredictedStatus: RoutingStatusBucket;
  reasonSummary: string;
  checkpoints: RoutingCheckpoint[];
  smartEtaMs: number | null;
  smartEtaMinutes: number | null;
  smartEtaDateTime: string | null;
  smartEtaDateTimePalestine?: string | null;
  expectedDelayMs: number | null;
  expectedDelayMinutes: number | null;
  riskScore: number | null;
  riskLevel: RoutingRiskLevel;
  riskConfidence: number | null;
  riskComponents: string[];
  historicalVolatility: number | null;
  graphhopper: {
    details: Record<string, unknown>;
    instructions: unknown[];
  };
}

export type RoutingRequest = RoutingV2Request;

export interface NormalizedRoutes {
  generatedAt: string | null;
  generatedAtPalestine?: string | null;
  version: string | null;
  checkpointMatching: {
    mode: string | null;
    outerThresholdM: number | null;
    strongMatchDistanceM: number | null;
    mediumMatchDistanceM: number | null;
    weakMatchDistanceM: number | null;
    staticCheckpointSource: string | null;
    citySource: string | null;
    cityInference: string | null;
    directionMode: string | null;
  } | null;
  origin: RoutePoint | null;
  destination: RoutePoint | null;
  departAt: string | null;
  departAtPalestine?: string | null;
  warnings: string[];
  graphhopperInfo: Record<string, unknown> | null;
  routes: RoutePath[];
  selectedRouteId: string | null;
  mainRoute: RoutePath | null;
  alternativeRoutes: RoutePath[];
}
