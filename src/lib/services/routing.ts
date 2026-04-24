import { validateRoutePoint } from "@/lib/config/map";
import type {
  LngLatCoordinate,
  NormalizedRoutes,
  RoutePath,
  RoutingRequest,
  RoutingRiskLevel,
  RoutingRouteViability,
  RoutingStatusBucket,
  RoutingV2CheckpointDto,
  RoutingV2ResponseDataDto,
  RoutingV2RouteDto,
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
  const projectedPointOnRoute = normalizeCoordinates(value.projected_point_on_route);

  return {
    checkpointId:
      toStringOrNull(value.checkpoint_id) ?? `checkpoint_${index + 1}`,
    name: toStringOrNull(value.name) ?? `Checkpoint ${index + 1}`,
    lat: toFiniteNumber(value.lat),
    lng: toFiniteNumber(value.lng),
    distanceFromRouteM: toFiniteNumber(value.distance_from_route_m),
    nearestSegmentIndex: Math.max(
      0,
      Math.trunc(toFiniteNumber(value.nearest_segment_index)),
    ),
    projectedPointOnRoute:
      projectedPointOnRoute.length > 0 ? projectedPointOnRoute : null,
    chainageM: toFiniteNumber(value.chainage_m),
    etaMs,
    etaSeconds: Math.max(0, Math.trunc(toFiniteNumber(value.eta_seconds) || etaMs / 1000)),
    etaMinutes:
      typeof value.eta_minutes === "number" || typeof value.eta_minutes === "string"
        ? toFiniteNumber(value.eta_minutes)
        : etaMs / 60000,
    crossingDateTime: toStringOrNull(value.crossing_datetime),
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

  const endpoint = `${getGeoApiBaseUrl()}/api/routing/v4`;
  const body: RoutingRequest = {
    origin: request.origin,
    destination: request.destination,
    profile: "car",
    ...(request.depart_at ? { depart_at: request.depart_at } : {}),
  };

  try {
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
    const data = extractRoutingData(payload);

    const departAt =
      typeof data.depart_at === "string" && data.depart_at.trim()
        ? data.depart_at.trim()
        : request.depart_at ?? null;

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

    return {
      generatedAt:
        typeof data.generated_at === "string" && data.generated_at.trim()
          ? data.generated_at.trim()
          : null,
      version:
        typeof data.version === "string" && data.version.trim()
          ? data.version.trim()
          : null,
      origin: data.origin ?? request.origin,
      destination: data.destination ?? request.destination,
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
      graphhopperInfo:
        data.graphhopper_info && typeof data.graphhopper_info === "object"
          ? data.graphhopper_info
          : null,
      routes: routesWithDelay,
      selectedRouteId: routesWithDelay[0]?.routeId ?? null,
      mainRoute: routesWithDelay[0] ?? null,
      alternativeRoutes: routesWithDelay.slice(1, 3),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Unable to load route data from the configured Geo API.");
  }
}
