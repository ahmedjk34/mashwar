import { validateRoutePoint } from "@/lib/config/map";
import { logRoutingDebug } from "@/lib/utils/routing-debug";
import { formatDateTimeInPalestine } from "@/lib/utils/palestine-time";
import type {
  LngLatCoordinate,
  NormalizedRoutes,
  RoutePath,
  RoutingRequest,
  RoutingCheckpointDirection,
  RoutingCheckpointMatchConfidence,
  RoutingRiskLevel,
  RoutingRouteViability,
  RoutingStatusBucket,
  RoutingV2CheckpointDto,
  RoutingV2ResponseDataDto,
  RoutingV2RouteDto,
  RoutingTradeoffExplainerDto,
  RoutingTradeoffExplainerRouteDto,
} from "@/lib/types/map";

function getGeoApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_GEO_API_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      "NEXT_PUBLIC_GEO_API_URL is required to fetch routing data.",
    );
  }

  return baseUrl.replace(/\/+$/, "");
}

function toFiniteNumber(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return 0;
}

function toOptionalFiniteNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return null;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return null;
}

function normalizeStringList(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeStringList(item));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, item]) => {
        if (typeof item === "string") {
          const trimmed = item.trim();
          return trimmed ? [trimmed] : [];
        }

        if (typeof item === "number" && Number.isFinite(item)) {
          return [`${key}: ${item}`];
        }

        if (Array.isArray(item) || (item && typeof item === "object")) {
          const nested = normalizeStringList(item);
          if (nested.length > 0) {
            return nested.map((entry) => `${key}: ${entry}`);
          }
        }

        if (item === null || item === undefined) {
          return [];
        }

        return [`${key}: ${String(item)}`];
      },
    );
  }

  return [];
}

function normalizeProbabilityMap(value: unknown): Record<string, number> {
  const probabilities: Record<string, number> = {};

  const setProbability = (key: string, rawValue: unknown) => {
    const numeric = toOptionalFiniteNumber(
      typeof rawValue === "number" || typeof rawValue === "string"
        ? rawValue
        : null,
    );

    if (key && numeric !== null) {
      probabilities[key] = numeric;
    }
  };

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (Array.isArray(item) && item.length >= 2) {
        const key = toStringOrNull(item[0]);
        if (key) {
          setProbability(key, item[1]);
        }
        return;
      }

      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const key =
          toStringOrNull(record.key) ??
          toStringOrNull(record.label) ??
          toStringOrNull(record.status) ??
          toStringOrNull(record.name) ??
          toStringOrNull(record.type) ??
          `item_${index + 1}`;
        const numeric =
          toOptionalFiniteNumber(
            record.probability as number | string | null | undefined,
          ) ??
          toOptionalFiniteNumber(
            record.value as number | string | null | undefined,
          ) ??
          toOptionalFiniteNumber(
            record.score as number | string | null | undefined,
          );

        if (key && numeric !== null) {
          probabilities[key] = numeric;
        }
      }
    });

    return probabilities;
  }

  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, rawValue]) => {
      setProbability(key, rawValue);
    });
  }

  return probabilities;
}

function normalizeCoordinates(value: unknown): LngLatCoordinate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      return [];
    }

    const lng = Number(coordinate[0]);
    const lat = Number(coordinate[1]);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return [];
    }

    return [[lng, lat] as LngLatCoordinate];
  });
}

function normalizeCoordinatePair(value: unknown): LngLatCoordinate | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const lng = Number(value[0]);
  const lat = Number(value[1]);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  return [lng, lat];
}

function normalizeRoutingStatusBucket(value: unknown): RoutingStatusBucket {
  if (typeof value !== "string") {
    return "unknown";
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "green" ||
    normalized === "yellow" ||
    normalized === "red" ||
    normalized === "unknown"
  ) {
    return normalized;
  }

  return "unknown";
}

function normalizeRiskLevel(value: unknown): RoutingRiskLevel {
  if (typeof value !== "string") {
    return "unknown";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }

  if (normalized === "good" || normalized === "green") {
    return "low";
  }

  if (normalized === "risky" || normalized === "yellow") {
    return "medium";
  }

  if (normalized === "avoid" || normalized === "red") {
    return "high";
  }

  return "unknown";
}

function normalizeMatchConfidence(
  value: unknown,
): RoutingCheckpointMatchConfidence {
  if (typeof value !== "string") {
    return "unknown";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "strong" || normalized === "medium" || normalized === "weak") {
    return normalized;
  }

  return "unknown";
}

function normalizeRouteDirection(value: unknown): RoutingCheckpointDirection {
  if (typeof value !== "string") {
    return "unknown";
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "entering" ||
    normalized === "leaving" ||
    normalized === "transit" ||
    normalized === "unknown"
  ) {
    return normalized;
  }

  return "unknown";
}

function normalizeRouteViability(value: unknown): RoutingRouteViability {
  if (value === "good" || value === "risky" || value === "avoid") {
    return value;
  }

  return "risky";
}

function normalizeCheckpoint(
  value: RoutingV2CheckpointDto,
  index: number,
): RoutePath["checkpoints"][number] {
  const etaMs = toFiniteNumber(value.eta_ms);
  const baseEtaMs = toOptionalFiniteNumber(value.base_eta_ms);
  const effectiveEtaMs = toOptionalFiniteNumber(value.effective_eta_ms);
  const expectedDelayMs = toOptionalFiniteNumber(value.expected_delay_ms);
  const expectedDelayMinutes =
    toOptionalFiniteNumber(value.expected_delay_minutes) ??
    (expectedDelayMs !== null ? expectedDelayMs / 60000 : null);
  const normalizedEffectiveEtaMs =
    effectiveEtaMs ??
    (baseEtaMs !== null && expectedDelayMs !== null
      ? baseEtaMs + expectedDelayMs
      : null) ??
    etaMs;
  const normalizedBaseEtaMs =
    baseEtaMs ??
    (normalizedEffectiveEtaMs !== null && expectedDelayMs !== null
      ? normalizedEffectiveEtaMs - expectedDelayMs
      : null) ??
    etaMs;
  const projectedPointOnRoute = Array.isArray(value.projected_point_on_route)
    ? (normalizeCoordinatePair(value.projected_point_on_route) ??
      normalizeCoordinates(value.projected_point_on_route)[0] ??
      null)
    : null;
  const crossingDateTime = toStringOrNull(value.crossing_datetime);

  return {
    checkpointId:
      toStringOrNull(value.checkpoint_id) ?? `checkpoint_${index + 1}`,
    name: toStringOrNull(value.name) ?? `Checkpoint ${index + 1}`,
    city: toStringOrNull(value.city),
    checkpointCityGroup: toStringOrNull(value.checkpoint_city_group),
    lat: toFiniteNumber(value.lat),
    lng: toFiniteNumber(value.lng),
    routeDirection: normalizeRouteDirection(value.route_direction),
    matchConfidence: normalizeMatchConfidence(value.match_confidence),
    projectionT: toOptionalFiniteNumber(value.projection_t),
    distanceFromRouteM: toFiniteNumber(value.distance_from_route_m),
    nearestSegmentIndex: Math.max(
      0,
      Math.trunc(toFiniteNumber(value.nearest_segment_index)),
    ),
    projectedPointOnRoute,
    chainageM: toFiniteNumber(value.chainage_m),
    etaMs,
    etaSeconds: Math.max(0, Math.trunc(toFiniteNumber(value.eta_seconds) || etaMs / 1000)),
    etaMinutes:
      typeof value.eta_minutes === "number" || typeof value.eta_minutes === "string"
        ? toFiniteNumber(value.eta_minutes)
        : etaMs / 60000,
    crossingDateTime,
    crossingDateTimePalestine: formatDateTimeInPalestine(crossingDateTime),
    currentStatus: normalizeRoutingStatusBucket(value.current_status),
    currentStatusRaw:
      value.current_status_raw && typeof value.current_status_raw === "object"
        ? value.current_status_raw
        : null,
    predictedStatusAtEta: normalizeRoutingStatusBucket(
      value.predicted_status_at_eta,
    ),
    forecastConfidence:
      value.forecast_confidence === undefined || value.forecast_confidence === null
        ? null
        : toFiniteNumber(value.forecast_confidence),
    forecastSource: toStringOrNull(value.forecast_source),
    forecastModelVersion:
      value.forecast_model_version === undefined ||
      value.forecast_model_version === null
        ? null
        : Math.trunc(toFiniteNumber(value.forecast_model_version)),
    forecastReason: toStringOrNull(value.forecast_reason),
    baseEtaMs: normalizedBaseEtaMs,
    effectiveEtaMs: normalizedEffectiveEtaMs,
    cumulativeDelayMsBeforeCheckpoint: toOptionalFiniteNumber(
      value.cumulative_delay_ms_before_checkpoint,
    ),
    expectedDelayMs,
    expectedDelayMinutes,
    forecastProbabilities: normalizeProbabilityMap(
      value.forecast_probabilities,
    ),
    severityRatio: toOptionalFiniteNumber(value.severity_ratio),
    selectedStatusType: toStringOrNull(value.selected_status_type),
  };
}

function normalizeRoutePath(
  path: RoutingV2RouteDto,
  index: number,
  departAt: string | null,
): RoutePath | null {
  const coordinates = normalizeCoordinates(path.geometry?.coordinates);
  if (coordinates.length < 2) {
    return null;
  }

  const durationMs = toFiniteNumber(path.duration_ms);
  const expectedDelayMs = toOptionalFiniteNumber(path.expected_delay_ms);
  const smartEtaMs =
    toOptionalFiniteNumber(path.smart_eta_ms) ??
    (expectedDelayMs !== null ? durationMs + expectedDelayMs : durationMs);
  const smartEtaMinutes =
    toOptionalFiniteNumber(path.smart_eta_minutes) ??
    (smartEtaMs !== null ? smartEtaMs / 60000 : null);
  const expectedDelayMinutes =
    toOptionalFiniteNumber(path.expected_delay_minutes) ??
    (expectedDelayMs !== null ? expectedDelayMs / 60000 : null);
  const checkpoints = Array.isArray(path.checkpoints)
    ? path.checkpoints.map((checkpoint, checkpointIndex) =>
        normalizeCheckpoint(checkpoint, checkpointIndex),
      )
    : [];
  const smartEtaDateTime =
    toStringOrNull(path.smart_eta_datetime) ??
    (() => {
      if (!departAt || smartEtaMs === null) {
        return null;
      }

      const departDate = new Date(departAt);
      if (Number.isNaN(departDate.getTime())) {
        return null;
      }

      return new Date(departDate.getTime() + smartEtaMs).toISOString();
    })();
  const departAtPalestine = formatDateTimeInPalestine(departAt);
  const smartEtaDateTimePalestine = formatDateTimeInPalestine(smartEtaDateTime);
  const riskLevel = normalizeRiskLevel(path.risk_level ?? path.route_viability);
  const riskScore = toOptionalFiniteNumber(path.risk_score);
  const riskConfidence = toOptionalFiniteNumber(path.risk_confidence);
  const historicalVolatility = toOptionalFiniteNumber(path.historical_volatility);
  const routeRiskComponents = normalizeStringList(path.risk_components);

  return {
    routeId: toStringOrNull(path.route_id) ?? `route_${index + 1}`,
    rank: Math.max(1, Math.trunc(toFiniteNumber(path.rank) || index + 1)),
    originalIndex: Math.max(
      0,
      Math.trunc(toFiniteNumber(path.original_index) || index),
    ),
    distanceM: toFiniteNumber(path.distance_m),
    durationMs,
    durationMinutes:
      typeof path.duration_minutes === "number" ||
      typeof path.duration_minutes === "string"
        ? toFiniteNumber(path.duration_minutes)
        : durationMs / 60000,
    geometry: {
      type: "LineString",
      coordinates,
    },
    snappedWaypoints:
      path.snapped_waypoints === undefined ? null : path.snapped_waypoints,
    bbox: path.bbox === undefined ? null : path.bbox,
    ascend:
      path.ascend === undefined || path.ascend === null
        ? null
        : toFiniteNumber(path.ascend),
    descend:
      path.descend === undefined || path.descend === null
        ? null
        : toFiniteNumber(path.descend),
    checkpointCount: Math.max(
      0,
      Math.trunc(
        typeof path.checkpoint_count === "number" ||
        typeof path.checkpoint_count === "string"
          ? toFiniteNumber(path.checkpoint_count)
          : checkpoints.length,
      ),
    ),
    routeScore: toFiniteNumber(path.route_score),
    estimatedDelayMinutes: expectedDelayMinutes,
    routeViability: normalizeRouteViability(path.route_viability),
    worstPredictedStatus: normalizeRoutingStatusBucket(
      path.worst_predicted_status,
    ),
    reasonSummary: toStringOrNull(path.reason_summary) ?? "",
    checkpoints,
    smartEtaMs,
    smartEtaMinutes,
    smartEtaDateTime,
    smartEtaDateTimePalestine,
    expectedDelayMs,
    expectedDelayMinutes,
    riskScore,
    riskLevel,
    riskConfidence,
    riskComponents: routeRiskComponents,
    historicalVolatility,
    graphhopper: {
      details:
        path.graphhopper?.details && typeof path.graphhopper.details === "object"
          ? (path.graphhopper.details as Record<string, unknown>)
          : {},
      instructions: Array.isArray(path.graphhopper?.instructions)
        ? path.graphhopper.instructions
        : [],
    },
  };
}

function extractRoutingData(payload: unknown): RoutingV2ResponseDataDto {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid routing response.");
  }

  const envelope = payload as {
    success?: boolean;
    data?: RoutingV2ResponseDataDto | null;
  } & RoutingV2ResponseDataDto;

  if (envelope.success === true && envelope.data) {
    return envelope.data;
  }

  if ("routes" in envelope || "generated_at" in envelope) {
    return envelope;
  }

  throw new Error("Invalid routing response.");
}

function normalizeCheckpointMatching(
  value: RoutingV2ResponseDataDto["checkpoint_matching"],
): NormalizedRoutes["checkpointMatching"] {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    mode: toStringOrNull(value.mode),
    outerThresholdM: toOptionalFiniteNumber(value.outer_threshold_m),
    strongMatchDistanceM: toOptionalFiniteNumber(value.strong_match_distance_m),
    mediumMatchDistanceM: toOptionalFiniteNumber(value.medium_match_distance_m),
    weakMatchDistanceM: toOptionalFiniteNumber(value.weak_match_distance_m),
    staticCheckpointSource: toStringOrNull(value.static_checkpoint_source),
    citySource: toStringOrNull(value.city_source),
    cityInference: toStringOrNull(value.city_inference),
    directionMode: toStringOrNull(value.direction_mode),
  };
}

function normalizeTradeoffRoute(
  route: RoutingTradeoffExplainerRouteDto,
  index: number,
): NonNullable<NormalizedRoutes["tradeoffExplainer"]>["routes"][number] {
  return {
    uiKey: `${toStringOrNull(route.route_id) ?? `tradeoff_route_${index + 1}`}:${Math.max(1, Math.trunc(toFiniteNumber(route.rank) || index + 1))}:${index}`,
    routeId: toStringOrNull(route.route_id) ?? `tradeoff_route_${index + 1}`,
    rank: Math.max(1, Math.trunc(toFiniteNumber(route.rank) || index + 1)),
    labelEn: toStringOrNull(route.label_en),
    labelAr: toStringOrNull(route.label_ar),
    isRecommended: route.is_recommended === true,
    isFastest: route.is_fastest === true,
    isSafest: route.is_safest === true,
    isLowestDelay: route.is_lowest_delay === true,
    isHighestRisk: route.is_highest_risk === true,
    durationMinutes: toOptionalFiniteNumber(route.duration_minutes),
    smartEtaMinutes: toOptionalFiniteNumber(route.smart_eta_minutes),
    expectedDelayMinutes: toOptionalFiniteNumber(route.expected_delay_minutes),
    distanceM: toOptionalFiniteNumber(route.distance_m),
    routeScore: toOptionalFiniteNumber(route.route_score),
    checkpointCount: toOptionalFiniteNumber(route.checkpoint_count),
    riskScore: toOptionalFiniteNumber(route.risk_score),
    riskLevel:
      route.risk_level === "low" ||
      route.risk_level === "medium" ||
      route.risk_level === "high"
        ? route.risk_level
        : "unknown",
    riskConfidence: toOptionalFiniteNumber(route.risk_confidence),
    historicalVolatility: toOptionalFiniteNumber(route.historical_volatility),
    routeViability:
      route.route_viability === "good" ||
      route.route_viability === "risky" ||
      route.route_viability === "avoid"
        ? route.route_viability
        : "risky",
    worstPredictedStatus:
      route.worst_predicted_status === "green" ||
      route.worst_predicted_status === "yellow" ||
      route.worst_predicted_status === "red" ||
      route.worst_predicted_status === "unknown"
        ? route.worst_predicted_status
        : "unknown",
    routeDirectionCounts: {
      entering: Math.max(
        0,
        Math.trunc(
          toOptionalFiniteNumber(route.route_direction_counts?.entering) ?? 0,
        ),
      ),
      leaving: Math.max(
        0,
        Math.trunc(
          toOptionalFiniteNumber(route.route_direction_counts?.leaving) ?? 0,
        ),
      ),
      transit: Math.max(
        0,
        Math.trunc(
          toOptionalFiniteNumber(route.route_direction_counts?.transit) ?? 0,
        ),
      ),
      unknown: Math.max(
        0,
        Math.trunc(
          toOptionalFiniteNumber(route.route_direction_counts?.unknown) ?? 0,
        ),
      ),
    },
    statusCounts: {
      green: Math.max(
        0,
        Math.trunc(toOptionalFiniteNumber(route.status_counts?.green) ?? 0),
      ),
      yellow: Math.max(
        0,
        Math.trunc(toOptionalFiniteNumber(route.status_counts?.yellow) ?? 0),
      ),
      red: Math.max(
        0,
        Math.trunc(toOptionalFiniteNumber(route.status_counts?.red) ?? 0),
      ),
      unknown: Math.max(
        0,
        Math.trunc(toOptionalFiniteNumber(route.status_counts?.unknown) ?? 0),
      ),
    },
    riskyCheckpointCount: Math.max(
      0,
      Math.trunc(toOptionalFiniteNumber(route.risky_checkpoint_count) ?? 0),
    ),
    riskyCheckpoints: Array.isArray(route.risky_checkpoints)
      ? route.risky_checkpoints.map((checkpoint, checkpointIndex) => ({
          checkpointId:
            checkpoint.checkpoint_id ?? `tradeoff_checkpoint_${index + 1}_${checkpointIndex + 1}`,
          name: toStringOrNull(checkpoint.name) ?? `Checkpoint ${checkpointIndex + 1}`,
          city: toStringOrNull(checkpoint.city),
          routeDirection: toStringOrNull(checkpoint.route_direction),
          predictedStatusAtEta:
            checkpoint.predicted_status_at_eta === "green" ||
            checkpoint.predicted_status_at_eta === "yellow" ||
            checkpoint.predicted_status_at_eta === "red" ||
            checkpoint.predicted_status_at_eta === "unknown"
              ? checkpoint.predicted_status_at_eta
              : "unknown",
          currentStatus:
            checkpoint.current_status === "green" ||
            checkpoint.current_status === "yellow" ||
            checkpoint.current_status === "red" ||
            checkpoint.current_status === "unknown"
              ? checkpoint.current_status
              : "unknown",
          forecastConfidence: toOptionalFiniteNumber(checkpoint.forecast_confidence),
          expectedDelayMs: toOptionalFiniteNumber(checkpoint.expected_delay_ms),
          expectedDelayMinutes: toOptionalFiniteNumber(
            checkpoint.expected_delay_minutes,
          ),
          etaMs: toOptionalFiniteNumber(checkpoint.eta_ms),
          etaMinutes: toOptionalFiniteNumber(checkpoint.eta_minutes),
          severityRatio: toOptionalFiniteNumber(checkpoint.severity_ratio),
          historicalVolatility: toOptionalFiniteNumber(
            checkpoint.historical_volatility,
          ),
          distanceFromRouteM: toOptionalFiniteNumber(
            checkpoint.distance_from_route_m,
          ),
        }))
      : [],
    routeCorridorCities: Array.isArray(route.route_corridor_cities)
      ? route.route_corridor_cities
          .map((city) => toStringOrNull(city))
          .filter((city): city is string => Boolean(city))
      : [],
    cityContextStrength: toStringOrNull(route.city_context_strength),
    sameCityTrip:
      typeof route.same_city_trip === "boolean" ? route.same_city_trip : null,
    durationDeltaVsRecommendedMinutes: toOptionalFiniteNumber(
      route.duration_delta_vs_recommended_minutes,
    ),
    smartEtaDeltaVsRecommendedMinutes: toOptionalFiniteNumber(
      route.smart_eta_delta_vs_recommended_minutes,
    ),
    expectedDelayDeltaVsRecommendedMinutes: toOptionalFiniteNumber(
      route.expected_delay_delta_vs_recommended_minutes,
    ),
    riskDeltaVsRecommended: toOptionalFiniteNumber(
      route.risk_delta_vs_recommended,
    ),
    distanceDeltaVsRecommendedM: toOptionalFiniteNumber(
      route.distance_delta_vs_recommended_m,
    ),
    checkpointDeltaVsRecommended: toOptionalFiniteNumber(
      route.checkpoint_delta_vs_recommended,
    ),
    confidenceDeltaVsRecommended: toOptionalFiniteNumber(
      route.confidence_delta_vs_recommended,
    ),
    volatilityDeltaVsRecommended: toOptionalFiniteNumber(
      route.volatility_delta_vs_recommended,
    ),
    comparisonFacts: {
      english: Array.isArray(route.comparison_facts?.english)
        ? route.comparison_facts.english
            .map((fact) => toStringOrNull(fact))
            .filter((fact): fact is string => Boolean(fact))
        : [],
      arabic: Array.isArray(route.comparison_facts?.arabic)
        ? route.comparison_facts.arabic
            .map((fact) => toStringOrNull(fact))
            .filter((fact): fact is string => Boolean(fact))
        : [],
    },
  };
}

function normalizeTradeoffExplainer(
  value: RoutingTradeoffExplainerDto | null | undefined,
): NormalizedRoutes["tradeoffExplainer"] {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    mode: toStringOrNull(value.mode),
    language: toStringOrNull(value.language),
    comparedRouteCount: toOptionalFiniteNumber(value.compared_route_count),
    winnerRouteId: toStringOrNull(value.winner_route_id),
    winnerRank: toOptionalFiniteNumber(value.winner_rank),
    fastestRouteId: toStringOrNull(value.fastest_route_id),
    safestRouteId: toStringOrNull(value.safest_route_id),
    lowestDelayRouteId: toStringOrNull(value.lowest_delay_route_id),
    highestRiskRouteId: toStringOrNull(value.highest_risk_route_id),
    setSummary: {
      timeSpreadMinutes: toOptionalFiniteNumber(
        value.set_summary?.time_spread_minutes,
      ),
      riskSpread: toOptionalFiniteNumber(value.set_summary?.risk_spread),
      delaySpreadMinutes: toOptionalFiniteNumber(
        value.set_summary?.delay_spread_minutes,
      ),
      checkpointSpread: toOptionalFiniteNumber(
        value.set_summary?.checkpoint_spread,
      ),
      confidenceSpread: toOptionalFiniteNumber(
        value.set_summary?.confidence_spread,
      ),
      volatilitySpread: toOptionalFiniteNumber(
        value.set_summary?.volatility_spread,
      ),
      corridorNote: toStringOrNull(value.set_summary?.corridor_note),
      decisionDriverEn: toStringOrNull(value.set_summary?.decision_driver_en),
      decisionDriverAr: toStringOrNull(value.set_summary?.decision_driver_ar),
    },
    routes: Array.isArray(value.routes)
      ? value.routes
          .map((route, index) => normalizeTradeoffRoute(route, index))
          .sort((left, right) => left.rank - right.rank)
      : [],
    englishText: toStringOrNull(value.english_text),
    arabicText: toStringOrNull(value.arabic_text),
    fullText: toStringOrNull(value.full_text),
  };
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: string;
      message?: string;
      detail?: string;
    };
    const message = payload.error ?? payload.message ?? payload.detail;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  } catch {
    return `Routing request failed with status ${response.status}.`;
  }

  return `Routing request failed with status ${response.status}.`;
}

export async function getRoute(
  request: RoutingRequest,
): Promise<NormalizedRoutes> {
  validateRoutePoint(request.origin);
  validateRoutePoint(request.destination);

  const endpoint = `${getGeoApiBaseUrl()}/api/routing/v2`;
  const body: RoutingRequest = {
    origin: request.origin,
    destination: request.destination,
    profile: "car",
    ...(request.depart_at ? { depart_at: request.depart_at } : {}),
    ...(request.origin_city ? { origin_city: request.origin_city } : {}),
    ...(request.destination_city ? { destination_city: request.destination_city } : {}),
    ...(request.originCity ? { originCity: request.originCity } : {}),
    ...(request.destinationCity ? { destinationCity: request.destinationCity } : {}),
  };

  try {
    logRoutingDebug("routing request payload", {
      endpoint,
      body,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    const payload: unknown = await response.json();
    logRoutingDebug("routing raw response payload", {
      endpoint,
      status: response.status,
      payload,
    });

    const data = extractRoutingData(payload);

    const departAt =
      typeof data.depart_at === "string" && data.depart_at.trim()
        ? data.depart_at.trim()
        : request.depart_at ?? null;
    const departAtPalestine = formatDateTimeInPalestine(departAt);

    const routes = Array.isArray(data.routes)
      ? data.routes
          .map((route, index) => normalizeRoutePath(route, index, departAt))
          .filter((route): route is RoutePath => route !== null)
          .sort((left, right) => left.rank - right.rank)
      : [];
    const fastestDurationMs =
      routes.length > 0
        ? Math.min(...routes.map((route) => route.durationMs))
        : null;
    const routesWithDelay = routes.map((route) => ({
      ...route,
      estimatedDelayMinutes:
        route.expectedDelayMinutes ??
        (fastestDurationMs !== null && route.durationMs > fastestDurationMs
          ? Math.max(
              1,
              Math.round((route.durationMs - fastestDurationMs) / 60000),
            )
          : null),
    }));

    logRoutingDebug("routing normalized response", {
      endpoint,
      request: body,
      response: {
        generatedAt:
          typeof data.generated_at === "string" && data.generated_at.trim()
            ? data.generated_at.trim()
            : null,
        version:
          typeof data.version === "string" && data.version.trim()
            ? data.version.trim()
            : null,
        departAt:
          typeof data.depart_at === "string" && data.depart_at.trim()
            ? data.depart_at.trim()
            : null,
        warnings: Array.isArray(data.warnings)
          ? data.warnings.filter(
              (warning): warning is string =>
                typeof warning === "string" && warning.trim().length > 0,
            )
          : [],
        checkpointMatching: normalizeCheckpointMatching(
          data.checkpoint_matching,
        ),
        routeCount: routesWithDelay.length,
        routes: routesWithDelay.map((route) => ({
          routeId: route.routeId,
          rank: route.rank,
          checkpointCount: route.checkpointCount,
          routeViability: route.routeViability,
          worstPredictedStatus: route.worstPredictedStatus,
          riskScore: route.riskScore,
          riskLevel: route.riskLevel,
          riskConfidence: route.riskConfidence,
          historicalVolatility: route.historicalVolatility,
          expectedDelayMinutes: route.expectedDelayMinutes,
          smartEtaDateTime: route.smartEtaDateTime,
          smartEtaDateTimePalestine: formatDateTimeInPalestine(
            route.smartEtaDateTime,
          ),
          reasonSummary: route.reasonSummary,
          checkpoints: route.checkpoints.map((checkpoint) => ({
            checkpointId: checkpoint.checkpointId,
            name: checkpoint.name,
            city: checkpoint.city,
            currentStatus: checkpoint.currentStatus,
            predictedStatusAtEta: checkpoint.predictedStatusAtEta,
            routeDirection: checkpoint.routeDirection,
            matchConfidence: checkpoint.matchConfidence,
            etaMinutes: checkpoint.etaMinutes,
            expectedDelayMinutes: checkpoint.expectedDelayMinutes,
            crossingDateTime: checkpoint.crossingDateTime,
            crossingDateTimePalestine: formatDateTimeInPalestine(
              checkpoint.crossingDateTime,
            ),
          })),
        })),
      },
    });

    return {
      generatedAt:
        typeof data.generated_at === "string" && data.generated_at.trim()
          ? data.generated_at.trim()
          : null,
      generatedAtPalestine: formatDateTimeInPalestine(
        typeof data.generated_at === "string" && data.generated_at.trim()
          ? data.generated_at.trim()
          : null,
      ),
      version:
        typeof data.version === "string" && data.version.trim()
          ? data.version.trim()
          : null,
      checkpointMatching: normalizeCheckpointMatching(data.checkpoint_matching),
      origin: data.origin ?? request.origin,
      destination: data.destination ?? request.destination,
      departAt:
        typeof data.depart_at === "string" && data.depart_at.trim()
          ? data.depart_at.trim()
          : null,
      departAtPalestine,
      warnings: Array.isArray(data.warnings)
        ? data.warnings.filter(
            (warning): warning is string =>
              typeof warning === "string" && warning.trim().length > 0,
          )
        : [],
      graphhopperInfo:
        data.graphhopper_info && typeof data.graphhopper_info === "object"
          ? data.graphhopper_info
          : null,
      routes: routesWithDelay,
      selectedRouteId: routesWithDelay[0]?.routeId ?? null,
      mainRoute: routesWithDelay[0] ?? null,
      alternativeRoutes: routesWithDelay.slice(1, 3),
      tradeoffExplainer: normalizeTradeoffExplainer(data.tradeoff_explainer),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Unable to load route data from the configured Geo API.");
  }
}
