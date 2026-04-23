import { normalizeCheckpointStatus } from "@/lib/config/map";
import { normalizeCheckpointRecord } from "@/lib/services/checkpoints";
import type {
  CheckpointForecastApiEnvelope,
  CheckpointForecastPredictionItemDto,
  CheckpointForecastResponseDataDto,
  CheckpointForecastStatusType,
  NormalizedCheckpointForecast,
  NormalizedCheckpointForecastTimelineItem,
} from "@/lib/types/map";

function getGeoApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_GEO_API_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      "NEXT_PUBLIC_GEO_API_URL is required to fetch checkpoint forecasts.",
    );
  }

  return baseUrl.replace(/\/+$/, "");
}

function firstNonEmptyString(
  ...values: Array<string | number | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

function normalizeClassProbabilities(
  value: unknown,
): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, number | string | null | undefined>).reduce<
    Record<string, number>
  >((accumulator, [key, rawValue]) => {
    const numericValue = toFiniteNumber(rawValue);
    if (numericValue !== null) {
      accumulator[key] = numericValue;
    }

    return accumulator;
  }, {});
}

function extractForecastData(payload: unknown): CheckpointForecastResponseDataDto {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid forecast response.");
  }

  const envelope = payload as CheckpointForecastApiEnvelope &
    CheckpointForecastResponseDataDto;

  if (envelope.success === true && envelope.data) {
    return envelope.data;
  }

  if (
    "checkpoint" in envelope ||
    "request" in envelope ||
    "predictions" in envelope
  ) {
    return envelope;
  }

  throw new Error("Invalid forecast response.");
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: string;
      detail?: string;
      message?: string;
    };
    const message = payload.error ?? payload.detail ?? payload.message;

    if (typeof message === "string" && message.trim()) {
      if (response.status === 503) {
        return "Checkpoint forecast service is currently unavailable.";
      }

      if (response.status === 502) {
        return "Unable to fetch checkpoint forecast right now.";
      }

      return message;
    }
  } catch {
    return `Forecast request failed with status ${response.status}.`;
  }

  return `Forecast request failed with status ${response.status}.`;
}

function normalizePredictionItem(
  item: CheckpointForecastPredictionItemDto,
  index: number,
  fallbackStatusType: CheckpointForecastStatusType,
): NormalizedCheckpointForecastTimelineItem | null {
  const prediction = item.prediction;
  if (!prediction) {
    return null;
  }

  const rawPredictedStatus = firstNonEmptyString(prediction.predicted_status);
  const targetDateTime = firstNonEmptyString(
    item.target_datetime,
    prediction.target_datetime,
  );
  const statusType = firstNonEmptyString(
    prediction.status_type,
    fallbackStatusType,
  );

  return {
    horizon: firstNonEmptyString(item.horizon) ?? `prediction-${index + 1}`,
    targetDateTime,
    prediction: {
      horizon: firstNonEmptyString(item.horizon) ?? `prediction-${index + 1}`,
      targetDateTime,
      statusType: statusType ?? fallbackStatusType,
      predictedStatus: normalizeCheckpointStatus(rawPredictedStatus),
      rawPredictedStatus,
      confidence: toFiniteNumber(prediction.confidence),
      classProbabilities: normalizeClassProbabilities(
        prediction.class_probabilities,
      ),
    },
  };
}

export async function getCheckpointForecast(
  checkpointId: string | number,
  statusType: CheckpointForecastStatusType,
  asOf?: string,
): Promise<NormalizedCheckpointForecast> {
  const numericCheckpointId = Number(checkpointId);
  if (!Number.isFinite(numericCheckpointId)) {
    throw new Error("Forecast requests require a numeric checkpoint id.");
  }

  if (statusType !== "entering" && statusType !== "leaving") {
    throw new Error("Forecast status_type must be entering or leaving.");
  }

  const endpoint = new URL(
    `${getGeoApiBaseUrl()}/checkpoints/${numericCheckpointId}/forecast`,
  );
  endpoint.searchParams.set("status_type", statusType);
  if (typeof asOf === "string" && asOf.trim()) {
    endpoint.searchParams.set("as_of", asOf.trim());
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    const payload: unknown = await response.json();
    const data = extractForecastData(payload);

    if (!data.checkpoint) {
      throw new Error("Forecast response did not include a checkpoint.");
    }

    const checkpoint = normalizeCheckpointRecord(data.checkpoint, 0);
    const requestStatusType = (
      firstNonEmptyString(data.request?.status_type, statusType) ?? statusType
    ) as CheckpointForecastStatusType | string;
    const predictions = Array.isArray(data.predictions)
      ? data.predictions
          .map((item, index) =>
            normalizePredictionItem(
              item,
              index,
              requestStatusType === "leaving" ? "leaving" : "entering",
            ),
          )
          .filter(
            (
              item,
            ): item is NormalizedCheckpointForecastTimelineItem => item !== null,
          )
      : [];

    return {
      checkpoint,
      request: {
        checkpointId: firstNonEmptyString(
          data.request?.checkpoint_id,
          numericCheckpointId,
        ) ?? String(numericCheckpointId),
        statusType: requestStatusType,
        asOf: firstNonEmptyString(data.request?.as_of, asOf),
      },
      predictions,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "TypeError") {
        throw new Error("Unable to reach the forecast service.");
      }

      throw error;
    }

    throw new Error("Unable to load checkpoint forecast data.");
  }
}
