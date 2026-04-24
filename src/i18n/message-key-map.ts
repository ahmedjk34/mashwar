import type {
  MapCheckpointStatus,
  RoutingRiskLevel,
  RoutingStatusBucket,
} from "@/lib/types/map";

/** Normalized checkpoint status (Arabic enum) → next-intl message key (under `checkpoint.flow`). */
export const CHECKPOINT_STATUS_MESSAGE_KEY: Record<MapCheckpointStatus, string> = {
  سالك: "checkpoint.flow.smooth",
  "أزمة متوسطة": "checkpoint.flow.moderate",
  "أزمة خانقة": "checkpoint.flow.severe",
  مغلق: "checkpoint.flow.closed",
  "غير معروف": "checkpoint.flow.unknown",
};

/** Raw API / DB tokens (ASCII aliases) → same keys as `checkpoint.flow` (use with `t(...)`). */
export const CHECKPOINT_STATUS_ALIAS_MESSAGE_KEY: Record<string, string> = {
  open: "checkpoint.flow.smooth",
  normal: "checkpoint.flow.smooth",
  clear: "checkpoint.flow.smooth",
  moderate: "checkpoint.flow.moderate",
  medium: "checkpoint.flow.moderate",
  warning: "checkpoint.flow.moderate",
  severe: "checkpoint.flow.severe",
  jammed: "checkpoint.flow.severe",
  closed: "checkpoint.flow.closed",
  blocked: "checkpoint.flow.closed",
  unknown: "checkpoint.flow.unknown",
  unavailable: "checkpoint.flow.unknown",
};

export const ROUTING_RISK_MESSAGE_KEY: Record<RoutingRiskLevel, string> = {
  low: "routing.risk.low",
  medium: "routing.risk.medium",
  high: "routing.risk.high",
  unknown: "routing.risk.unknown",
};

export const ROUTING_BUCKET_MESSAGE_KEY: Record<RoutingStatusBucket, string> = {
  green: "routing.bucket.green",
  yellow: "routing.bucket.yellow",
  red: "routing.bucket.red",
  unknown: "routing.bucket.unknown",
};

export const FORECAST_HORIZON_MESSAGE_KEY: Record<string, string> = {
  plus_30m: "forecast.horizon.plus30m",
  plus_1h: "forecast.horizon.plus1h",
  plus_2h: "forecast.horizon.plus2h",
  next_day_8am: "forecast.horizon.nextDay8am",
};

/** `useTranslations('forecast.horizon')` sub-key for a horizon code from the API. */
export function forecastHorizonSubkey(horizon: string): string {
  const full = FORECAST_HORIZON_MESSAGE_KEY[horizon];
  if (full) {
    return full.replace("forecast.horizon.", "");
  }
  return "unknown";
}

/** `useTranslations('checkpoint.flow')` sub-key for a normalized Arabic status. */
export function checkpointFlowSubkey(status: MapCheckpointStatus): string {
  return CHECKPOINT_STATUS_MESSAGE_KEY[status].replace("checkpoint.flow.", "");
}

const MAP_CHECKPOINT_STATUS_KEYS = new Set<string>(Object.keys(CHECKPOINT_STATUS_MESSAGE_KEY));

/** Translate a DB/API Arabic status when it matches the map contract; otherwise return raw. */
export function safeCheckpointFlowLabel(
  status: string,
  tFlow: (key: string) => string,
): string {
  if (MAP_CHECKPOINT_STATUS_KEYS.has(status)) {
    return tFlow(checkpointFlowSubkey(status as MapCheckpointStatus));
  }
  return status;
}

/** Short mono badge under flow status (OPEN / SLOW / …). */
export const CHECKPOINT_BADGE_MESSAGE_KEY: Record<MapCheckpointStatus, string> = {
  سالك: "checkpoint.badge.open",
  "أزمة متوسطة": "checkpoint.badge.slow",
  "أزمة خانقة": "checkpoint.badge.heavy",
  مغلق: "checkpoint.badge.closed",
  "غير معروف": "checkpoint.badge.unknown",
};

export function checkpointBadgeSubkey(status: MapCheckpointStatus): string {
  return CHECKPOINT_BADGE_MESSAGE_KEY[status].replace("checkpoint.badge.", "");
}

export const SERVICE_ERROR_MESSAGE_KEY: Record<string, string> = {
  "Unable to load checkpoint data.": "errors.checkpointsLoad",
  "Invalid checkpoints response.": "errors.checkpointsInvalid",
  "Checkpoint service is currently unavailable.": "errors.checkpointsUnavailable",
  "Unable to fetch current checkpoints right now.": "errors.checkpointsFetch",
  "Unable to reach the checkpoint service.": "errors.checkpointsUnreachable",
  "Unable to load checkpoint data from the configured Geo API.": "errors.checkpointsConfigured",
  "Unable to load checkpoint forecast.": "errors.forecastLoad",
  "Unable to load checkpoint forecast data.": "errors.forecastData",
  "Unable to reach the forecast service.": "errors.forecastUnreachable",
  "Unable to load route data.": "errors.routeLoad",
  "تعذر تحميل الخريطة الحرارية": "errors.heatmapLoad",
  "Received an invalid uncertainty stream payload.": "errors.heatmapStreamInvalid",
  "Received a corridor without usable geometry.": "errors.heatmapCorridorInvalid",
  "Received an unknown uncertainty stream event.": "errors.heatmapUnknownEvent",
  "Unable to generate route intelligence right now.": "errors.nlIntelligence",
};
