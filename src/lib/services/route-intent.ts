import { getWorstStatus } from "@/lib/config/map";
import { findCityMatchesInText, getCityDisplayLabel, resolveCityPoint, normalizePlaceLabel } from "@/lib/data/cities";
import { getCheckpoints } from "@/lib/services/checkpoints";
import { getCheckpointForecast, getCheckpointPrediction } from "@/lib/services/forecast";
import { getRoute } from "@/lib/services/routing";
import { logRoutingDebug } from "@/lib/utils/routing-debug";
import { parseDateTimeExpressionInPalestine } from "@/lib/utils/palestine-time";
import type {
  MapCheckpoint,
  MapCheckpointStatus,
  NormalizedRoutes,
  RoutePoint,
  UserLocation,
} from "@/lib/types/map";
import type {
  NaturalLanguageCheckpointExecution,
  NaturalLanguageCheckpointPrediction,
  NaturalLanguageExecution,
  NaturalLanguageRequestInput,
  NaturalLanguageRouteExecution,
  ParsedNaturalLanguageIntent,
  RouteSimulationWindow,
} from "@/lib/types/route-intent";

let checkpointListPromise: Promise<MapCheckpoint[]> | null = null;

function getRouteIntentEndpoint(): string {
  return "/api/route-intent";
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s:@/-]+/gu, " ")
    .replace(/\s+/g, " ");
}

function parseApiErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const candidate = payload as {
      error?: unknown;
      message?: unknown;
      detail?: unknown;
    };

    const message = candidate.error ?? candidate.message ?? candidate.detail;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return `Route intent request failed with status ${status}.`;
}

async function requestRouteIntent(
  text: string,
): Promise<ParsedNaturalLanguageIntent> {
  logRoutingDebug("natural-language intent request", {
    endpoint: getRouteIntentEndpoint(),
    text,
  });

  const response = await fetch(getRouteIntentEndpoint(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    throw new Error(parseApiErrorMessage(payload, response.status));
  }

  const payload = (await response.json()) as ParsedNaturalLanguageIntent;
  logRoutingDebug("natural-language intent response", payload);
  return payload;
}

function getCachedCheckpoints(): Promise<MapCheckpoint[]> {
  if (!checkpointListPromise) {
    checkpointListPromise = getCheckpoints().catch((error) => {
      checkpointListPromise = null;
      throw error;
    });
  }

  return checkpointListPromise;
}

function getCurrentStatusLabel(checkpoint: MapCheckpoint): MapCheckpointStatus {
  return getWorstStatus(
    checkpoint.enteringStatus,
    checkpoint.leavingStatus,
  );
}

function formatCurrentLocationLabel(currentLocation: UserLocation): string {
  return `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}`;
}

function parseOffsetMinutes(prompt: string): number {
  const normalized = normalizeText(prompt);
  const match = normalized.match(
    /(\d{1,3})\s*(?:minutes?|mins?|m|دقيقة|دقائق|دقايق|دقائق?)/,
  );

  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) {
      return Math.min(180, value);
    }
  }

  if (normalized.includes("1 hour") || normalized.includes("an hour") || normalized.includes("ساعة")) {
    return 60;
  }

  return 30;
}

function shouldSimulateRoute(prompt: string, parse: ParsedNaturalLanguageIntent): boolean {
  if (parse.entities.wantsSimulation) {
    return true;
  }

  const normalized = normalizeText(prompt);
  return /(?:what if|simulate|compare|earlier|later|قبل|بعد|لو بدي|لو\s+).*?/.test(normalized);
}

function resolveDateTimeFromExpression(
  expression: string | null,
  reference = new Date(),
): string | null {
  if (!expression) {
    return null;
  }

  return parseDateTimeExpressionInPalestine(expression, reference);
}

function resolvePromptTime(
  prompt: string,
  parse: ParsedNaturalLanguageIntent,
): string | null {
  return (
    resolveDateTimeFromExpression(parse.time, new Date()) ??
    resolveDateTimeFromExpression(prompt, new Date())
  );
}

function resolveRouteEndpoints(
  prompt: string,
  parse: ParsedNaturalLanguageIntent,
  currentLocation: UserLocation | null,
): {
  origin: RoutePoint;
  destination: RoutePoint;
  originLabel: string;
  destinationLabel: string;
} | null {
  const promptCities = findCityMatchesInText(prompt);
  const parsedOrigin = resolveCityPoint(parse.entities.originCity);
  const parsedDestination = resolveCityPoint(parse.entities.destinationCity);
  const normalizedPrompt = normalizeText(prompt);
  const hasDestinationCue =
    normalizedPrompt.includes(" to ") ||
    normalizedPrompt.startsWith("to ") ||
    normalizedPrompt.includes(" toward ") ||
    normalizedPrompt.includes(" towards ") ||
    normalizedPrompt.includes(" destination ") ||
    normalizedPrompt.includes(" heading to ") ||
    normalizedPrompt.includes(" الى ") ||
    normalizedPrompt.startsWith("الى ") ||
    normalizedPrompt.includes(" إلى ") ||
    normalizedPrompt.startsWith("إلى ");
  const hasOriginCue =
    normalizedPrompt.includes(" from ") ||
    normalizedPrompt.startsWith("from ") ||
    normalizedPrompt.includes(" origin ") ||
    normalizedPrompt.includes(" starting ") ||
    normalizedPrompt.includes(" من ") ||
    normalizedPrompt.startsWith("من ");

  const originCity =
    parsedOrigin?.city ?? (promptCities.length > 1 ? promptCities[0]?.city : null);
  const destinationCity =
    parsedDestination?.city ??
    (promptCities.length > 1 ? promptCities[1]?.city : null) ??
    null;

  if (originCity && destinationCity) {
    return {
      origin: {
        lat: originCity.latitude,
        lng: originCity.longitude,
      },
      destination: {
        lat: destinationCity.latitude,
        lng: destinationCity.longitude,
      },
      originLabel: getCityDisplayLabel(originCity),
      destinationLabel: getCityDisplayLabel(destinationCity),
    };
  }

  if (promptCities.length === 1 && currentLocation) {
    const onlyCity = promptCities[0].city;

    if (hasOriginCue && !hasDestinationCue) {
      return {
        origin: {
          lat: onlyCity.latitude,
          lng: onlyCity.longitude,
        },
        destination: {
          lat: currentLocation.lat,
          lng: currentLocation.lng,
        },
        originLabel: getCityDisplayLabel(onlyCity),
        destinationLabel: `Current location · ${formatCurrentLocationLabel(currentLocation)}`,
      };
    }

    return {
      origin: {
        lat: currentLocation.lat,
        lng: currentLocation.lng,
      },
      destination: {
        lat: onlyCity.latitude,
        lng: onlyCity.longitude,
      },
      originLabel: `Current location · ${formatCurrentLocationLabel(currentLocation)}`,
      destinationLabel: getCityDisplayLabel(onlyCity),
    };
  }

  if (!originCity && destinationCity && currentLocation) {
    return {
      origin: {
        lat: currentLocation.lat,
        lng: currentLocation.lng,
      },
      destination: {
        lat: destinationCity.latitude,
        lng: destinationCity.longitude,
      },
      originLabel: `Current location · ${formatCurrentLocationLabel(currentLocation)}`,
      destinationLabel: getCityDisplayLabel(destinationCity),
    };
  }

  if (originCity && !destinationCity && currentLocation) {
    return {
      origin: {
        lat: originCity.latitude,
        lng: originCity.longitude,
      },
      destination: {
        lat: currentLocation.lat,
        lng: currentLocation.lng,
      },
      originLabel: getCityDisplayLabel(originCity),
      destinationLabel: `Current location · ${formatCurrentLocationLabel(currentLocation)}`,
    };
  }

  return null;
}

function buildSimulationWindows(departAt: string | null, prompt: string): string[] {
  const baseDate = departAt ? new Date(departAt) : new Date();
  const baseTime = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
  const offsetMinutes = parseOffsetMinutes(prompt);

  const earlier = new Date(baseTime.getTime() - offsetMinutes * 60000).toISOString();
  const base = baseTime.toISOString();
  const later = new Date(baseTime.getTime() + offsetMinutes * 60000).toISOString();
  return [earlier, base, later];
}

function getSimulationLabel(index: number, offsetMinutes: number): string {
  if (index === 0) {
    return `Leave ${offsetMinutes} min earlier`;
  }

  if (index === 1) {
    return "Base departure";
  }

  return `Leave ${offsetMinutes} min later`;
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);
  let currentRow = new Array<number>(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    currentRow[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const insertion = currentRow[j - 1] + 1;
      const deletion = previousRow[j] + 1;
      const substitution =
        previousRow[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      currentRow[j] = Math.min(insertion, deletion, substitution);
    }

    for (let j = 0; j <= right.length; j += 1) {
      previousRow[j] = currentRow[j];
    }
  }

  return previousRow[right.length] ?? 0;
}

function similarityScore(left: string, right: string): number {
  if (!left && !right) {
    return 1;
  }

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return 0.97;
  }

  const distance = levenshteinDistance(left, right);
  const longest = Math.max(left.length, right.length);
  if (longest <= 0) {
    return 0;
  }

  return Math.max(0, 1 - distance / longest);
}

function getCheckpointMatchScore(
  checkpoint: MapCheckpoint,
  prompt: string,
  parse: ParsedNaturalLanguageIntent,
): number {
  const promptLabel = normalizePlaceLabel(prompt);
  const checkpointLabel = normalizePlaceLabel(
    [checkpoint.id, checkpoint.name, checkpoint.city].filter(Boolean).join(" "),
  );
  const checkpointNameLabel = normalizePlaceLabel(checkpoint.name);
  const checkpointCityLabel = normalizePlaceLabel(checkpoint.city ?? "");
  const parsedHintLabel = normalizePlaceLabel(
    [
      parse.entities.checkpointId ?? "",
      parse.entities.checkpointName ?? "",
      parse.entities.sourceHint ?? "",
    ]
      .filter(Boolean)
      .join(" "),
  );

  const promptScore = Math.max(
    similarityScore(promptLabel, checkpointLabel),
    similarityScore(promptLabel, checkpointNameLabel),
  );
  const parseScore = Math.max(
    similarityScore(parsedHintLabel, checkpointLabel),
    similarityScore(parsedHintLabel, checkpointNameLabel),
    similarityScore(parsedHintLabel, checkpointCityLabel),
  );

  const exactIdMatch =
    parse.entities.checkpointId &&
    normalizePlaceLabel(parse.entities.checkpointId) ===
      normalizePlaceLabel(checkpoint.id)
      ? 1
      : 0;

  const exactNameMatch =
    parse.entities.checkpointName &&
    normalizePlaceLabel(parse.entities.checkpointName) === checkpointNameLabel
      ? 0.98
      : 0;

  const cityMatch =
    parse.entities.checkpointName &&
    checkpointCityLabel &&
    normalizePlaceLabel(parse.entities.checkpointName) === checkpointCityLabel
      ? 0.92
      : 0;

  return Math.max(
    promptScore,
    parseScore,
    exactIdMatch,
    exactNameMatch,
    cityMatch,
  );
}

function findBestCheckpointMatch(
  checkpoints: MapCheckpoint[],
  prompt: string,
  parse: ParsedNaturalLanguageIntent,
): MapCheckpoint | null {
  if (parse.entities.checkpointId) {
    const exactById = checkpoints.filter(
      (checkpoint) =>
        normalizePlaceLabel(checkpoint.id) ===
        normalizePlaceLabel(parse.entities.checkpointId ?? ""),
    );

    if (exactById.length > 0) {
      return exactById[0] ?? null;
    }
  }

  const scoredMatches = checkpoints
    .map((checkpoint) => ({
      checkpoint,
      score: getCheckpointMatchScore(checkpoint, prompt, parse),
    }))
    .sort((left, right) => right.score - left.score);

  const best = scoredMatches[0];
  if (!best || best.score < 0.35) {
    return null;
  }

  return best.checkpoint;
}

function buildClarificationMessage(parse: ParsedNaturalLanguageIntent): string {
  if (parse.kind === "route") {
    if (!parse.entities.originCity && !parse.entities.destinationCity) {
      return "I could not identify a route origin or destination. Please name a city or say 'to Jenin' / 'from Ramallah to Jenin'.";
    }

    if (!parse.entities.destinationCity) {
      return "I found the origin, but I still need the destination city.";
    }

    if (!parse.entities.originCity) {
      return "I found the destination, but I need your current location or a source city to build the route.";
    }
  }

  return "I need a clearer checkpoint name or timestamp before I can run the forecast.";
}

async function resolveRouteExecution(
  prompt: string,
  parse: ParsedNaturalLanguageIntent,
  currentLocation: UserLocation | null,
): Promise<NaturalLanguageRouteExecution | NaturalLanguageExecution> {
  const endpoints = resolveRouteEndpoints(prompt, parse, currentLocation);
  if (!endpoints) {
    return {
      kind: "clarification",
      prompt,
      parse,
      message: buildClarificationMessage(parse),
    };
  }

  const departAt = resolvePromptTime(prompt, parse);
  const shouldSimulate = shouldSimulateRoute(prompt, parse);
  const offsetMinutes = parseOffsetMinutes(prompt);

  if (shouldSimulate) {
    const simulationDepartures = buildSimulationWindows(departAt, prompt);
    logRoutingDebug("route simulation windows", {
      prompt,
      endpoints,
      departAt,
      offsetMinutes,
      simulationDepartures,
    });

    const simulationRoutes = await Promise.all(
      simulationDepartures.map((simulationDepartAt, index) =>
        getRoute({
          origin: endpoints.origin,
          destination: endpoints.destination,
          depart_at: simulationDepartAt,
          origin_city: parse.entities.originCity ?? undefined,
          destination_city: parse.entities.destinationCity ?? undefined,
          profile: "car",
        }).then((routes) => ({
          label: getSimulationLabel(index, offsetMinutes),
          departAt: simulationDepartAt,
          offsetMinutes: index === 1 ? 0 : offsetMinutes * (index === 0 ? -1 : 1),
          routes,
        })),
      ),
    );

    logRoutingDebug("route simulation resolution", {
      prompt,
      parse,
      resolution: {
        originLabel: endpoints.originLabel,
        destinationLabel: endpoints.destinationLabel,
        departAt,
        route: simulationRoutes[1]?.routes ?? simulationRoutes[0].routes,
        simulations: simulationRoutes.map((entry) => ({
          label: entry.label,
          departAt: entry.departAt,
          offsetMinutes: entry.offsetMinutes,
          routeCount: entry.routes.routes.length,
          mainRoute: entry.routes.mainRoute
            ? {
                routeId: entry.routes.mainRoute.routeId,
                rank: entry.routes.mainRoute.rank,
                checkpointCount: entry.routes.mainRoute.checkpointCount,
                riskLevel: entry.routes.mainRoute.riskLevel,
                riskScore: entry.routes.mainRoute.riskScore,
                expectedDelayMinutes: entry.routes.mainRoute.expectedDelayMinutes,
                smartEtaDateTime: entry.routes.mainRoute.smartEtaDateTime,
              }
            : null,
        })),
      },
    });

    return {
      kind: "route",
      prompt,
      parse,
      resolution: {
        origin: endpoints.origin,
        destination: endpoints.destination,
        originLabel: endpoints.originLabel,
        destinationLabel: endpoints.destinationLabel,
        departAt,
        route: simulationRoutes[1]?.routes ?? simulationRoutes[0].routes,
        simulations: simulationRoutes.map((entry) => ({
          label: entry.label,
          departAt: entry.departAt,
          offsetMinutes: entry.offsetMinutes,
          routes: entry.routes,
        })),
      },
    };
  }

  const route = await getRoute({
    origin: endpoints.origin,
    destination: endpoints.destination,
    depart_at: departAt ?? undefined,
    origin_city: parse.entities.originCity ?? undefined,
    destination_city: parse.entities.destinationCity ?? undefined,
    profile: "car",
  });

  logRoutingDebug("route resolution", {
    prompt,
    parse,
    resolution: {
      originLabel: endpoints.originLabel,
      destinationLabel: endpoints.destinationLabel,
      departAt,
      route: {
        routeCount: route.routes.length,
        mainRoute: route.mainRoute
          ? {
              routeId: route.mainRoute.routeId,
              rank: route.mainRoute.rank,
              checkpointCount: route.mainRoute.checkpointCount,
              riskLevel: route.mainRoute.riskLevel,
              riskScore: route.mainRoute.riskScore,
              expectedDelayMinutes: route.mainRoute.expectedDelayMinutes,
              smartEtaDateTime: route.mainRoute.smartEtaDateTime,
            }
          : null,
      },
    },
  });

  return {
    kind: "route",
    prompt,
    parse,
    resolution: {
      origin: endpoints.origin,
      destination: endpoints.destination,
      originLabel: endpoints.originLabel,
      destinationLabel: endpoints.destinationLabel,
      departAt,
      route,
      simulations: [],
    },
  };
}

async function resolveCheckpointExecution(
  prompt: string,
  parse: ParsedNaturalLanguageIntent,
): Promise<NaturalLanguageCheckpointExecution | NaturalLanguageExecution> {
  const checkpoints = await getCachedCheckpoints();
  const match = findBestCheckpointMatch(checkpoints, prompt, parse);

  logRoutingDebug("checkpoint resolver matches", {
    prompt,
    parse,
    checkpointCount: checkpoints.length,
    match: match
      ? {
          id: match.id,
          name: match.name,
          city: match.city,
        }
      : null,
  });

  if (!match) {
    return {
      kind: "clarification",
      prompt,
      parse,
      message:
        "I could not match that checkpoint name to the live checkpoint list.",
    };
  }

  const checkpoint = match;
  const targetDateTime = resolvePromptTime(prompt, parse);
  const checkpointStatusLabel = getCurrentStatusLabel(checkpoint);

  if (!targetDateTime) {
    const forecast = await getCheckpointForecast(checkpoint.id, "both");
    logRoutingDebug("checkpoint forecast resolution", {
      prompt,
      parse,
      resolution: {
        checkpointId: checkpoint.id,
        mode: "forecast",
        targetDateTime: null,
        currentStatusLabel: checkpointStatusLabel,
        forecast: {
          checkpointId: forecast.request.checkpointId,
          statusType: forecast.request.statusType,
          asOf: forecast.request.asOf,
          enteringCount: forecast.predictions.entering.length,
          leavingCount: forecast.predictions.leaving.length,
        },
      },
    });

    return {
      kind: "checkpoint",
      prompt,
      parse,
      resolution: {
        checkpoint,
        mode: "forecast",
        targetDateTime: null,
        currentStatusLabel: checkpointStatusLabel,
        predictions: [],
        forecast,
      },
    };
  }

  const direction = parse.entities.checkpointDirection;
  const directions: Array<"entering" | "leaving"> =
    direction === "entering" || direction === "leaving"
      ? [direction]
      : ["entering", "leaving"];

  const predictions = await Promise.all(
    directions.map(async (statusType) => {
      const prediction = await getCheckpointPrediction(
        checkpoint.id,
        targetDateTime,
        statusType,
      );

      return {
        checkpoint: prediction.checkpoint,
        request: {
          checkpointId: prediction.request.checkpointId,
          targetDateTime: prediction.request.targetDateTime,
          statusType,
        },
        prediction: prediction.prediction,
      } satisfies NaturalLanguageCheckpointPrediction;
    }),
  );

  logRoutingDebug("checkpoint prediction resolution", {
    prompt,
    parse,
    resolution: {
      checkpointId: checkpoint.id,
      mode: "predict",
      targetDateTime,
      currentStatusLabel: checkpointStatusLabel,
      predictions: predictions.map((item) => ({
        checkpointId: item.request.checkpointId,
        targetDateTime: item.request.targetDateTime,
        statusType: item.request.statusType,
        predictedStatus: item.prediction.predictedStatus,
        confidence: item.prediction.confidence,
      })),
    },
  });

  return {
    kind: "checkpoint",
    prompt,
    parse,
    resolution: {
      checkpoint,
      mode: "predict",
      targetDateTime,
      currentStatusLabel: checkpointStatusLabel,
      predictions,
      forecast: null,
    },
  };
}

export async function resolveNaturalLanguageRequest(
  input: NaturalLanguageRequestInput,
): Promise<NaturalLanguageExecution> {
  const prompt = input.text.trim();
  if (!prompt) {
    return {
      kind: "error",
      prompt: "",
      message: "Prompt text is required.",
    };
  }

  logRoutingDebug("natural-language request input", {
    prompt,
    currentLocation: input.currentLocation,
  });

  const parse = await requestRouteIntent(prompt);
  logRoutingDebug("natural-language parsed intent", parse);

  if (parse.kind === "route") {
    const execution = await resolveRouteExecution(
      prompt,
      parse,
      input.currentLocation,
    );
    logRoutingDebug("natural-language final execution", execution);
    return execution;
  }

  const execution = await resolveCheckpointExecution(prompt, parse);
  logRoutingDebug("natural-language final execution", execution);
  return execution;
}

export function isRouteExecution(
  value: NaturalLanguageExecution,
): value is NaturalLanguageRouteExecution {
  return value.kind === "route";
}
