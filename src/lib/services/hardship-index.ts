import { getGeoApiBaseUrl } from "@/lib/services/geo-api";
import type { HardshipIndexPayload, HardshipIndexWindowParam } from "@/lib/types/hardship-index";

function buildQuery(range: HardshipIndexWindowParam): string {
  if (range === "all") {
    return "all_time=true";
  }
  const days = range === "7d" ? 7 : range === "14d" ? 14 : 30;
  return `window_days=${days}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asConfidence(
  value: unknown,
): HardshipIndexPayload["cities"][number]["confidence"] {
  const raw = asString(value)?.toLowerCase();
  if (raw === "low" || raw === "medium" || raw === "high") {
    return raw;
  }
  return "low";
}

function asSeverity(value: unknown): HardshipIndexPayload["cities"][number]["severity"] {
  const raw = asString(value)?.toLowerCase();
  if (raw === "low" || raw === "moderate" || raw === "high" || raw === "severe") {
    return raw;
  }
  return null;
}

function parseDriver(raw: unknown): HardshipIndexPayload["cities"][number]["top_drivers"][number] | null {
  if (!isRecord(raw)) {
    return null;
  }
  const checkpoint_id = asNumber(raw.checkpoint_id) ?? -1;
  const checkpoint_name = asString(raw.checkpoint_name) ?? "";
  const score = asNumber(raw.score) ?? 0;
  const sample_count = asNumber(raw.sample_count) ?? 0;
  const closure_rate = asNumber(raw.closure_rate) ?? 0;
  const congestion_rate = asNumber(raw.congestion_rate) ?? 0;
  const volatility_score = asNumber(raw.volatility_score) ?? 0;
  const impact_score = asNumber(raw.impact_score) ?? 0;
  return {
    checkpoint_id,
    checkpoint_name,
    score,
    sample_count,
    closure_rate,
    congestion_rate,
    volatility_score,
    impact_score,
  };
}

function parseCity(raw: unknown): HardshipIndexPayload["cities"][number] | null {
  if (!isRecord(raw)) {
    return null;
  }
  const city = asString(raw.city);
  if (!city) {
    return null;
  }
  const driversRaw = Array.isArray(raw.top_drivers) ? raw.top_drivers : [];
  const top_drivers = driversRaw.map(parseDriver).filter(Boolean) as HardshipIndexPayload["cities"][number]["top_drivers"];
  const scoreComponentsRaw = isRecord(raw.score_components) ? raw.score_components : {};

  return {
    city,
    population: asNumber(raw.population),
    score: asNumber(raw.score),
    severity: asSeverity(raw.severity),
    trend: asNumber(raw.trend),
    confidence: asConfidence(raw.confidence),
    sample_count: asNumber(raw.sample_count) ?? 0,
    active_checkpoint_count: asNumber(raw.active_checkpoint_count) ?? 0,
    total_checkpoint_count: asNumber(raw.total_checkpoint_count) ?? 0,
    coverage_ratio: Math.min(1, Math.max(0, asNumber(raw.coverage_ratio) ?? 0)),
    score_components: {
      sample_weighted_checkpoint_score: asNumber(scoreComponentsRaw.sample_weighted_checkpoint_score),
      top_driver_mean_score: asNumber(scoreComponentsRaw.top_driver_mean_score),
      peak_checkpoint_score: asNumber(scoreComponentsRaw.peak_checkpoint_score),
      distressed_checkpoint_ratio: asNumber(scoreComponentsRaw.distressed_checkpoint_ratio),
      active_checkpoint_count: asNumber(scoreComponentsRaw.active_checkpoint_count),
      top_driver_count: asNumber(scoreComponentsRaw.top_driver_count),
    },
    top_drivers,
    experimental_relative_burden: asNumber(raw.experimental_relative_burden),
  };
}

function parseRegion(raw: unknown): HardshipIndexPayload["regions"][number] | null {
  if (!isRecord(raw)) {
    return null;
  }
  const region = asString(raw.region);
  if (!region) {
    return null;
  }
  const scoreComponentsRaw = isRecord(raw.score_components) ? raw.score_components : {};
  return {
    region,
    score: asNumber(raw.score),
    population_weighted_score: asNumber(raw.population_weighted_score),
    severity: asSeverity(raw.severity),
    worst_city: asString(raw.worst_city),
    city_count: asNumber(raw.city_count) ?? 0,
    active_city_count: asNumber(raw.active_city_count) ?? 0,
    score_components: {
      city_average_score: asNumber(scoreComponentsRaw.city_average_score),
      population_weighted_score: asNumber(scoreComponentsRaw.population_weighted_score),
      peak_city_score: asNumber(scoreComponentsRaw.peak_city_score),
    },
  };
}

function parseSummary(raw: unknown): HardshipIndexPayload["summary"] | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    worst_city: asString(raw.worst_city),
    most_volatile_checkpoint: asString(raw.most_volatile_checkpoint),
    highest_closure_checkpoint: asString(raw.highest_closure_checkpoint),
    total_experimental_relative_burden:
      asNumber(raw.total_experimental_relative_burden) ?? 0,
  };
}

export function parseHardshipIndexPayload(payload: unknown): HardshipIndexPayload {
  if (!isRecord(payload)) {
    throw new Error("Invalid hardship index response.");
  }

  const generated_at = asString(payload.generated_at);
  const window = asString(payload.window);
  if (!generated_at || !window) {
    throw new Error("Invalid hardship index response.");
  }

  const citiesRaw = Array.isArray(payload.cities) ? payload.cities : [];
  const regionsRaw = Array.isArray(payload.regions) ? payload.regions : [];
  const cities = citiesRaw.map(parseCity).filter(Boolean) as HardshipIndexPayload["cities"];
  const regions = regionsRaw.map(parseRegion).filter(Boolean) as HardshipIndexPayload["regions"];
  const summary = parseSummary(payload.summary);
  if (!summary) {
    throw new Error("Invalid hardship index response.");
  }

  return {
    generated_at,
    window,
    window_days: asNumber(payload.window_days),
    cities,
    regions,
    summary,
  };
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    const message = payload.error ?? payload.detail ?? payload.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  } catch {
    return `Hardship index request failed with status ${response.status}.`;
  }
  return `Hardship index request failed with status ${response.status}.`;
}

export async function fetchHardshipIndex(
  range: HardshipIndexWindowParam,
): Promise<HardshipIndexPayload> {
  const endpoint = `${getGeoApiBaseUrl("hardship index")}/hardship-index?${buildQuery(range)}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    const payload: unknown = await response.json();
    return parseHardshipIndexPayload(payload);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "TypeError") {
        throw new Error("Unable to reach the hardship index service.");
      }
      throw error;
    }
    throw new Error("Unable to load hardship index data.");
  }
}
