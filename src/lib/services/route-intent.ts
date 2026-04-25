import { getWorstStatus } from "@/lib/config/map";
import { findCityMatchesInText, getCityDisplayLabel, resolveCityPoint, normalizePlaceLabel } from "@/lib/data/cities";
import { getCheckpoints } from "@/lib/services/checkpoints";
import { getCheckpointForecast, getCheckpointPrediction, getCheckpointTravelWindow } from "@/lib/services/forecast";
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

  if (normalized.includes("1 hour") || normalized.includes("an hour")) {
    return 60;
  }

  // Arabic ~1h offset — must NOT match "الساعة" (o'clock), which is almost always clock time.
  if (/(?<![ال])ساع[ةه]/.test(normalized)) {
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

function shouldUseTravelWindow(prompt: string): boolean {
  const normalized = normalizeText(prompt);

  return /(?:best time to travel|best time to cross|worst time to travel|worst time to cross|when should i cross|what'?s the safest time|travel window|travel-window|safest time|safest time to cross|time to cross|best time|worst time|احسن وقت|أفضل وقت|افضل وقت|اسوأ وقت|أسوأ وقت|شو احسن وقت|شو افضل وقت|امتى افضل وقت|متى افضل وقت|امتى اسوأ وقت|متى اسوأ وقت|متى احسن وقت|متى احسن وقت|وقت\s+(?:ال)?(?:مرور|عبور)|للعبور|للمرور|امر?ق|اعبر)/.test(
    normalized,
  );
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

async function resolveRouteEndpoints(
  prompt: string,
  parse: ParsedNaturalLanguageIntent,
  currentLocation: UserLocation | null,
): Promise<{
  origin: RoutePoint;
  destination: RoutePoint;
  originLabel: string;
  destinationLabel: string;
  originCityName: string | null;
  destinationCityName: string | null;
} | null> {
  type ResolvedEndpoint = {
    point: RoutePoint;
    label: string;
    cityName: string | null;
  };

  const toCheckpointEndpoint = (checkpoint: MapCheckpoint): ResolvedEndpoint | null => {
    if (
      checkpoint.latitude === null ||
      checkpoint.longitude === null ||
      !Number.isFinite(checkpoint.latitude) ||
      !Number.isFinite(checkpoint.longitude)
    ) {
      return null;
    }

    return {
      point: {
        lat: checkpoint.latitude,
        lng: checkpoint.longitude,
      },
      label: checkpoint.city
        ? `${checkpoint.name} · ${checkpoint.city}`
        : checkpoint.name,
      cityName: checkpoint.city ?? null,
    };
  };

  const toCityEndpoint = (city: NonNullable<ReturnType<typeof resolveCityPoint>>["city"]): ResolvedEndpoint => {
    return {
      point: {
        lat: city.latitude,
        lng: city.longitude,
      },
      label: getCityDisplayLabel(city),
      cityName: city.key,
    };
  };

  const resolveCheckpointByHint = (
    checkpoints: MapCheckpoint[],
    hint: string | null,
    options?: { allowCityLikeHint?: boolean },
  ): MapCheckpoint | null => {
    if (!hint) {
      return null;
    }
    const allowCityLikeHint = options?.allowCityLikeHint ?? false;
    const cityLike = Boolean(resolveCityPoint(hint) || findCityMatchesInText(hint).length > 0);
    if (cityLike && !allowCityLikeHint) {
      return null;
    }

    const fauxParse: ParsedNaturalLanguageIntent = {
      ...parse,
      entities: {
        ...parse.entities,
        checkpointId: hint,
        checkpointName: hint,
        sourceHint: hint,
      },
    };
    return findBestCheckpointMatch(checkpoints, hint, fauxParse);
  };
  const toCurrentLocationEndpoint = (
    location: UserLocation,
  ): ResolvedEndpoint => ({
    point: { lat: location.lat, lng: location.lng },
    label: `Current location · ${formatCurrentLocationLabel(location)}`,
    cityName: null,
  });

  const makeResult = (
    origin: ResolvedEndpoint,
    destination: ResolvedEndpoint,
  ) => ({
    origin: origin.point,
    destination: destination.point,
    originLabel: origin.label,
    destinationLabel: destination.label,
    originCityName: origin.cityName,
    destinationCityName: destination.cityName,
  });

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
  const originSectionMatch = normalizedPrompt.match(
    /(?:^|\s)(?:from|من)\s+(.+?)(?=\s+(?:to|toward|towards|الى|إلى)\s+|$)/i,
  );
  const destinationSectionMatch = normalizedPrompt.match(
    /(?:^|\s)(?:to|toward|towards|الى|إلى)\s+(.+)$/i,
  );

  const originCity =
    parsedOrigin?.city ?? (promptCities.length > 1 ? promptCities[0]?.city : null);
  const destinationCity =
    parsedDestination?.city ??
    (promptCities.length > 1 ? promptCities[1]?.city : null) ??
    null;
  const checkpoints = await getCachedCheckpoints();
  const originCheckpoint = resolveCheckpointByHint(
    checkpoints,
    originSectionMatch?.[1]?.trim() ??
      (hasOriginCue ? parse.entities.sourceHint : null),
    { allowCityLikeHint: false },
  );
  const destinationCheckpoint = resolveCheckpointByHint(
    checkpoints,
    destinationSectionMatch?.[1]?.trim() ??
      parse.entities.checkpointName ??
      parse.entities.checkpointId,
    { allowCityLikeHint: false },
  );
  const promptLevelCheckpoint = resolveCheckpointByHint(checkpoints, prompt, {
    allowCityLikeHint: true,
  });
  const hasSingleCity = promptCities.length === 1;
  const originCheckpointEndpoint = originCheckpoint
    ? toCheckpointEndpoint(originCheckpoint)
    : null;
  const destinationCheckpointEndpoint = destinationCheckpoint
    ? toCheckpointEndpoint(destinationCheckpoint)
    : null;
  const originCityEndpoint = originCity ? toCityEndpoint(originCity) : null;
  const destinationCityEndpoint = destinationCity ? toCityEndpoint(destinationCity) : null;

  // Endpoint priority: checkpoint coordinates first; if missing, fall back to city.
  if (originCheckpointEndpoint && destinationCheckpointEndpoint) {
    return makeResult(originCheckpointEndpoint, destinationCheckpointEndpoint);
  }

  if (originCheckpointEndpoint && destinationCityEndpoint) {
    return makeResult(originCheckpointEndpoint, destinationCityEndpoint);
  }

  if (originCityEndpoint && destinationCheckpointEndpoint) {
    return makeResult(originCityEndpoint, destinationCheckpointEndpoint);
  }

  if (originCityEndpoint && destinationCityEndpoint) {
    return makeResult(originCityEndpoint, destinationCityEndpoint);
  }

  if (promptCities.length === 1 && currentLocation) {
    const onlyCity = promptCities[0].city;
    const cityEndpoint = toCityEndpoint(onlyCity);
    const currentEndpoint = toCurrentLocationEndpoint(currentLocation);

    if (hasOriginCue && !hasDestinationCue) {
      return makeResult(cityEndpoint, currentEndpoint);
    }

    if (promptLevelCheckpoint) {
      const checkpointEndpoint = toCheckpointEndpoint(promptLevelCheckpoint);
      if (checkpointEndpoint) {
        return hasDestinationCue
          ? makeResult(checkpointEndpoint, cityEndpoint)
          : makeResult(cityEndpoint, checkpointEndpoint);
      }
    }

    return makeResult(currentEndpoint, cityEndpoint);
  }

  if (!originCity && destinationCity && currentLocation) {
    return makeResult(
      toCurrentLocationEndpoint(currentLocation),
      toCityEndpoint(destinationCity),
    );
  }

  if (originCity && !destinationCity && currentLocation) {
    return makeResult(
      toCityEndpoint(originCity),
      toCurrentLocationEndpoint(currentLocation),
    );
  }

  if (hasSingleCity && promptLevelCheckpoint) {
    const onlyCity = promptCities[0]?.city;
    const checkpointEndpoint = toCheckpointEndpoint(promptLevelCheckpoint);
    if (onlyCity && checkpointEndpoint) {
      return hasDestinationCue
        ? makeResult(checkpointEndpoint, toCityEndpoint(onlyCity))
        : makeResult(toCityEndpoint(onlyCity), checkpointEndpoint);
    }
  }

  if (currentLocation && destinationCheckpoint) {
    const destinationEndpoint = toCheckpointEndpoint(destinationCheckpoint);
    if (destinationEndpoint) {
      return makeResult(toCurrentLocationEndpoint(currentLocation), destinationEndpoint);
    }
  }

  if (currentLocation && originCheckpoint) {
    const originEndpoint = toCheckpointEndpoint(originCheckpoint);
    if (originEndpoint) {
      return makeResult(originEndpoint, toCurrentLocationEndpoint(currentLocation));
    }
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

function getSimulationScenarioRole(index: number): "earlier" | "base" | "later" {
  if (index === 0) {
    return "earlier";
  }
  if (index === 1) {
    return "base";
  }
  return "later";
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
  const endpoints = await resolveRouteEndpoints(prompt, parse, currentLocation);
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
          origin_city: endpoints.originCityName ?? parse.entities.originCity ?? undefined,
          destination_city:
            endpoints.destinationCityName ??
            parse.entities.destinationCity ??
            undefined,
          profile: "car",
        }).then((routes) => ({
          scenarioRole: getSimulationScenarioRole(index),
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
          scenarioRole: entry.scenarioRole,
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
          scenarioRole: entry.scenarioRole,
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
    origin_city: endpoints.originCityName ?? parse.entities.originCity ?? undefined,
    destination_city:
      endpoints.destinationCityName ??
      parse.entities.destinationCity ??
      undefined,
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
  const useTravelWindow = shouldUseTravelWindow(prompt);

  if (useTravelWindow) {
    const asOf = targetDateTime;
    const travelWindow = await getCheckpointTravelWindow(checkpoint.id, asOf ?? undefined);
    logRoutingDebug("checkpoint travel-window resolution", {
      prompt,
      parse,
      resolution: {
        checkpointId: checkpoint.id,
        mode: "travel-window",
        asOf: travelWindow.request.asOf,
        travelWindow: {
          checkpointId: travelWindow.request.checkpointId,
          referenceTime: travelWindow.travelWindow.referenceTime,
          scope: travelWindow.travelWindow.scope,
          best: travelWindow.travelWindow.best
            ? {
                dayOfWeek: travelWindow.travelWindow.best.dayOfWeek,
                hour: travelWindow.travelWindow.best.hour,
                windowLabel: travelWindow.travelWindow.best.windowLabel,
                targetDateTime: travelWindow.travelWindow.best.targetDateTime,
              }
            : null,
          worst: travelWindow.travelWindow.worst
            ? {
                dayOfWeek: travelWindow.travelWindow.worst.dayOfWeek,
                hour: travelWindow.travelWindow.worst.hour,
                windowLabel: travelWindow.travelWindow.worst.windowLabel,
                targetDateTime: travelWindow.travelWindow.worst.targetDateTime,
              }
            : null,
        },
      },
    });

    return {
      kind: "checkpoint",
      prompt,
      parse,
      resolution: {
        checkpoint: travelWindow.checkpoint,
        mode: "travel-window",
        targetDateTime: null,
        referenceTime: travelWindow.travelWindow.referenceTime,
        currentStatusLabel: checkpointStatusLabel,
        predictions: [],
        forecast: null,
        travelWindow: travelWindow.travelWindow,
      },
    };
  }

  if (!targetDateTime) {
    const forecast = await getCheckpointForecast(checkpoint.id, "both");
    logRoutingDebug("checkpoint forecast resolution", {
      prompt,
      parse,
      resolution: {
        checkpointId: checkpoint.id,
        mode: "forecast",
        targetDateTime: null,
        referenceTime: forecast.travelWindow?.referenceTime ?? null,
        currentStatusLabel: checkpointStatusLabel,
        forecast: {
          checkpointId: forecast.request.checkpointId,
          statusType: forecast.request.statusType,
          asOf: forecast.request.asOf,
          enteringCount: forecast.predictions.entering.length,
          leavingCount: forecast.predictions.leaving.length,
        },
        travelWindow: {
          referenceTime: forecast.travelWindow?.referenceTime ?? null,
          scope: forecast.travelWindow?.scope ?? null,
          best: forecast.travelWindow?.best
            ? {
                dayOfWeek: forecast.travelWindow.best.dayOfWeek,
                hour: forecast.travelWindow.best.hour,
                windowLabel: forecast.travelWindow.best.windowLabel,
                targetDateTime: forecast.travelWindow.best.targetDateTime,
              }
            : null,
          worst: forecast.travelWindow?.worst
            ? {
                dayOfWeek: forecast.travelWindow.worst.dayOfWeek,
                hour: forecast.travelWindow.worst.hour,
                windowLabel: forecast.travelWindow.worst.windowLabel,
                targetDateTime: forecast.travelWindow.worst.targetDateTime,
              }
            : null,
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
        referenceTime: forecast.travelWindow?.referenceTime ?? null,
        currentStatusLabel: checkpointStatusLabel,
        predictions: [],
        forecast,
        travelWindow: forecast.travelWindow,
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
      referenceTime: targetDateTime,
      currentStatusLabel: checkpointStatusLabel,
      predictions,
      forecast: null,
      travelWindow: null,
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
