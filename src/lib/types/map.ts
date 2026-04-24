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
  uncertainty_score?: number | string | null;
  uncertaintyScore?: number | string | null;
  uncertainty?: {
    score?: number | string | null;
  } | null;
  prediction?: {
    uncertainty_score?: number | string | null;
    uncertaintyScore?: number | string | null;
  } | null;
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
  rawStatus?: string | null;
  currentStatusLabel?: string | null;
  uncertaintyScore?: number | string | null;
  uncertainty?: {
    score?: number | string | null;
  } | null;
  prediction?: {
    uncertainty_score?: number | string | null;
    uncertaintyScore?: number | string | null;
  } | null;
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

export interface CheckpointTravelWindowPredictionItemDto {
  day_of_week?: string | null;
  hour?: number | string | null;
  window_label?: string | null;
  target_datetime?: string | null;
  metrics?: Record<string, unknown> | null;
  entering_prediction?: CheckpointForecastPredictionDto | null;
  leaving_prediction?: CheckpointForecastPredictionDto | null;
  enteringPrediction?: CheckpointForecastPredictionDto | null;
  leavingPrediction?: CheckpointForecastPredictionDto | null;
  entering?: CheckpointForecastPredictionDto | null;
  leaving?: CheckpointForecastPredictionDto | null;
}

export interface CheckpointTravelWindowDto {
  best?: CheckpointTravelWindowPredictionItemDto | null;
  worst?: CheckpointTravelWindowPredictionItemDto | null;
  reference_time?: string | null;
  referenceTime?: string | null;
  scope?: string | null;
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
  travel_window?: CheckpointTravelWindowDto | null;
  travelWindow?: CheckpointTravelWindowDto | null;
  reference_time?: string | null;
  referenceTime?: string | null;
  scope?: string | null;
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

export interface NormalizedCheckpointTravelWindowItem {
  dayOfWeek: string | null;
  hour: number | null;
  windowLabel: string | null;
  targetDateTime: string | null;
  metrics: Record<string, unknown>;
  enteringPrediction: NormalizedCheckpointForecastPrediction | null;
  leavingPrediction: NormalizedCheckpointForecastPrediction | null;
}

export interface NormalizedCheckpointTravelWindow {
  best: NormalizedCheckpointTravelWindowItem | null;
  worst: NormalizedCheckpointTravelWindowItem | null;
  referenceTime: string | null;
  scope: string | null;
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
  travelWindow: NormalizedCheckpointTravelWindow | null;
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

export interface RoutingTradeoffExplainerCheckpointDto {
  checkpoint_id?: number | string | null;
  name?: string | null;
  city?: string | null;
  route_direction?: string | null;
  predicted_status_at_eta?: RoutingStatusBucket | string | null;
  current_status?: RoutingStatusBucket | string | null;
  forecast_confidence?: number | string | null;
  expected_delay_ms?: number | string | null;
  expected_delay_minutes?: number | string | null;
  eta_ms?: number | string | null;
  eta_minutes?: number | string | null;
  severity_ratio?: number | string | null;
  historical_volatility?: number | string | null;
  distance_from_route_m?: number | string | null;
}

export interface RoutingTradeoffExplainerRouteDto {
  route_id?: string | null;
  rank?: number | string | null;
  label_en?: string | null;
  label_ar?: string | null;
  is_recommended?: boolean | null;
  is_fastest?: boolean | null;
  is_safest?: boolean | null;
  is_lowest_delay?: boolean | null;
  is_highest_risk?: boolean | null;
  duration_minutes?: number | string | null;
  smart_eta_minutes?: number | string | null;
  expected_delay_minutes?: number | string | null;
  distance_m?: number | string | null;
  route_score?: number | string | null;
  checkpoint_count?: number | string | null;
  risk_score?: number | string | null;
  risk_level?: RoutingRiskLevel | string | null;
  risk_confidence?: number | string | null;
  historical_volatility?: number | string | null;
  route_viability?: RoutingRouteViability | string | null;
  worst_predicted_status?: RoutingStatusBucket | string | null;
  route_direction_counts?: {
    entering?: number | string | null;
    leaving?: number | string | null;
    transit?: number | string | null;
    unknown?: number | string | null;
  } | null;
  status_counts?: {
    green?: number | string | null;
    yellow?: number | string | null;
    red?: number | string | null;
    unknown?: number | string | null;
  } | null;
  risky_checkpoint_count?: number | string | null;
  risky_checkpoints?: RoutingTradeoffExplainerCheckpointDto[] | null;
  route_corridor_cities?: string[] | null;
  city_context_strength?: string | null;
  same_city_trip?: boolean | null;
  duration_delta_vs_recommended_minutes?: number | string | null;
  smart_eta_delta_vs_recommended_minutes?: number | string | null;
  expected_delay_delta_vs_recommended_minutes?: number | string | null;
  risk_delta_vs_recommended?: number | string | null;
  distance_delta_vs_recommended_m?: number | string | null;
  checkpoint_delta_vs_recommended?: number | string | null;
  confidence_delta_vs_recommended?: number | string | null;
  volatility_delta_vs_recommended?: number | string | null;
  comparison_facts?: {
    english?: string[] | null;
    arabic?: string[] | null;
  } | null;
}

export interface RoutingTradeoffExplainerSummaryDto {
  time_spread_minutes?: number | string | null;
  risk_spread?: number | string | null;
  delay_spread_minutes?: number | string | null;
  checkpoint_spread?: number | string | null;
  confidence_spread?: number | string | null;
  volatility_spread?: number | string | null;
  corridor_note?: string | null;
  decision_driver_en?: string | null;
  decision_driver_ar?: string | null;
}

export interface RoutingTradeoffExplainerDto {
  mode?: string | null;
  language?: string | null;
  compared_route_count?: number | string | null;
  winner_route_id?: string | null;
  winner_rank?: number | string | null;
  fastest_route_id?: string | null;
  safest_route_id?: string | null;
  lowest_delay_route_id?: string | null;
  highest_risk_route_id?: string | null;
  set_summary?: RoutingTradeoffExplainerSummaryDto | null;
  routes?: RoutingTradeoffExplainerRouteDto[] | null;
  english_text?: string | null;
  arabic_text?: string | null;
  full_text?: string | null;
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
  tradeoff_explainer?: RoutingTradeoffExplainerDto | null;
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
  tradeoffExplainer: {
    mode: string | null;
    language: string | null;
    comparedRouteCount: number | null;
    winnerRouteId: string | null;
    winnerRank: number | null;
    fastestRouteId: string | null;
    safestRouteId: string | null;
    lowestDelayRouteId: string | null;
    highestRiskRouteId: string | null;
    setSummary: {
      timeSpreadMinutes: number | null;
      riskSpread: number | null;
      delaySpreadMinutes: number | null;
      checkpointSpread: number | null;
      confidenceSpread: number | null;
      volatilitySpread: number | null;
      corridorNote: string | null;
      decisionDriverEn: string | null;
      decisionDriverAr: string | null;
    };
    routes: Array<{
      uiKey: string;
      routeId: string;
      rank: number;
      labelEn: string | null;
      labelAr: string | null;
      isRecommended: boolean;
      isFastest: boolean;
      isSafest: boolean;
      isLowestDelay: boolean;
      isHighestRisk: boolean;
      durationMinutes: number | null;
      smartEtaMinutes: number | null;
      expectedDelayMinutes: number | null;
      distanceM: number | null;
      routeScore: number | null;
      checkpointCount: number | null;
      riskScore: number | null;
      riskLevel: RoutingRiskLevel;
      riskConfidence: number | null;
      historicalVolatility: number | null;
      routeViability: RoutingRouteViability;
      worstPredictedStatus: RoutingStatusBucket;
      routeDirectionCounts: {
        entering: number;
        leaving: number;
        transit: number;
        unknown: number;
      };
      statusCounts: {
        green: number;
        yellow: number;
        red: number;
        unknown: number;
      };
      riskyCheckpointCount: number;
      riskyCheckpoints: Array<{
        checkpointId: number | string | null;
        name: string;
        city: string | null;
        routeDirection: string | null;
        predictedStatusAtEta: RoutingStatusBucket;
        currentStatus: RoutingStatusBucket;
        forecastConfidence: number | null;
        expectedDelayMs: number | null;
        expectedDelayMinutes: number | null;
        etaMs: number | null;
        etaMinutes: number | null;
        severityRatio: number | null;
        historicalVolatility: number | null;
        distanceFromRouteM: number | null;
      }>;
      routeCorridorCities: string[];
      cityContextStrength: string | null;
      sameCityTrip: boolean | null;
      durationDeltaVsRecommendedMinutes: number | null;
      smartEtaDeltaVsRecommendedMinutes: number | null;
      expectedDelayDeltaVsRecommendedMinutes: number | null;
      riskDeltaVsRecommended: number | null;
      distanceDeltaVsRecommendedM: number | null;
      checkpointDeltaVsRecommended: number | null;
      confidenceDeltaVsRecommended: number | null;
      volatilityDeltaVsRecommended: number | null;
      comparisonFacts: {
        english: string[];
        arabic: string[];
      };
    }>;
    englishText: string | null;
    arabicText: string | null;
    fullText: string | null;
  } | null;
}
