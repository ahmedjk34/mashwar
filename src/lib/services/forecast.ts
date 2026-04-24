import { normalizeCheckpointStatus } from "@/lib/config/map";
import { normalizeCheckpointRecord } from "@/lib/services/checkpoints";
import { logRoutingDebug } from "@/lib/utils/routing-debug";
import { formatDateTimeInPalestine } from "@/lib/utils/palestine-time";
import type {
  CheckpointForecastApiEnvelope,
  CheckpointForecastPredictionItemDto,
  CheckpointForecastPredictionsDto,
  CheckpointForecastResponseDataDto,
  CheckpointForecastStatusType,
  CheckpointPredictionApiEnvelope,
  CheckpointPredictionResponseDataDto,
  CheckpointTravelWindowDto,
  CheckpointTravelWindowPredictionItemDto,
  NormalizedCheckpointTravelWindow,
  NormalizedCheckpointTravelWindowItem,
  NormalizedCheckpointForecast,
  NormalizedCheckpointForecastTimelineItem,
  NormalizedCheckpointPrediction,
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

function isPredictionGroup(
  value: unknown,
): value is CheckpointForecastPredictionsDto {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      ("entering" in value || "leaving" in value),
  );
}

function getPredictionLike(
  item: CheckpointTravelWindowPredictionItemDto | null | undefined,
  direction: "entering" | "leaving",
): CheckpointForecastPredictionItemDto | null {
  if (!item) {
    return null;
  }

  const prediction =
    direction === "entering"
      ? item.entering_prediction ?? item.enteringPrediction ?? item.entering
      : item.leaving_prediction ?? item.leavingPrediction ?? item.leaving;

  if (!prediction) {
    return null;
  }

  return {
    horizon: "travel_window",
    target_datetime: firstNonEmptyString(item.target_datetime),
    prediction,
  };
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
    "predictions" in envelope ||
    "travel_window" in envelope ||
    "travelWindow" in envelope
  ) {
    return envelope;
  }

  throw new Error("Invalid forecast response.");
}

function extractPredictionData(
  payload: unknown,
): CheckpointPredictionResponseDataDto {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid prediction response.");
  }

  const envelope = payload as CheckpointPredictionApiEnvelope &
    CheckpointPredictionResponseDataDto;

  if (envelope.success === true && envelope.data) {
    return envelope.data;
  }

  if ("checkpoint" in envelope || "request" in envelope || "prediction" in envelope) {
    return envelope;
  }

  throw new Error("Invalid prediction response.");
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

function normalizeTravelWindowItem(
  item: CheckpointTravelWindowPredictionItemDto | null | undefined,
): NormalizedCheckpointTravelWindowItem | null {
  if (!item) {
    return null;
  }

  const enteringPrediction = normalizePredictionItem(
    getPredictionLike(item, "entering") ?? {
      horizon: "travel_window",
      target_datetime: firstNonEmptyString(item.target_datetime),
      prediction: null,
    },
    0,
    "entering",
  )?.prediction ?? null;
  const leavingPrediction = normalizePredictionItem(
    getPredictionLike(item, "leaving") ?? {
      horizon: "travel_window",
      target_datetime: firstNonEmptyString(item.target_datetime),
      prediction: null,
    },
    0,
    "leaving",
  )?.prediction ?? null;

  return {
    dayOfWeek: firstNonEmptyString(item.day_of_week),
    hour: toFiniteNumber(item.hour),
    windowLabel: firstNonEmptyString(item.window_label),
    targetDateTime: firstNonEmptyString(item.target_datetime),
    metrics:
      item.metrics && typeof item.metrics === "object" && !Array.isArray(item.metrics)
        ? (item.metrics as Record<string, unknown>)
        : {},
    enteringPrediction,
    leavingPrediction,
  };
}

function normalizeTravelWindow(
  travelWindow: CheckpointTravelWindowDto | null | undefined,
  fallbackReferenceTime: string | null,
  fallbackScope: string | null,
): NormalizedCheckpointTravelWindow | null {
  if (!travelWindow) {
    return null;
  }

  return {
    best: normalizeTravelWindowItem(travelWindow.best),
    worst: normalizeTravelWindowItem(travelWindow.worst),
    referenceTime: firstNonEmptyString(
      travelWindow.reference_time,
      travelWindow.referenceTime,
      fallbackReferenceTime,
    ),
    scope: firstNonEmptyString(travelWindow.scope, fallbackScope),
  };
}

function addTimelineItem(
  target: NormalizedCheckpointForecast["predictions"],
  item: NormalizedCheckpointForecastTimelineItem | null,
): void {
  if (!item) {
    return;
  }

  const direction =
    item.prediction.statusType === "leaving" ? "leaving" : "entering";
  target[direction].push(item);
}

function normalizePredictionGroup(
  items: CheckpointForecastPredictionItemDto[] | null | undefined,
  fallbackStatusType: CheckpointForecastStatusType,
): NormalizedCheckpointForecastTimelineItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item, index) => normalizePredictionItem(item, index, fallbackStatusType))
    .filter(
      (item): item is NormalizedCheckpointForecastTimelineItem => item !== null,
    );
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

  if (statusType !== "entering" && statusType !== "leaving" && statusType !== "both") {
    throw new Error("Forecast status_type must be entering, leaving, or both.");
  }

  const endpoint = new URL(
    `${getGeoApiBaseUrl()}/checkpoints/${numericCheckpointId}/forecast`,
  );
  endpoint.searchParams.set("status_type", statusType);
  if (typeof asOf === "string" && asOf.trim()) {
    endpoint.searchParams.set("as_of", asOf.trim());
  }

  try {
    logRoutingDebug("checkpoint forecast request payload", {
      endpoint: endpoint.toString(),
      checkpointId: numericCheckpointId,
      statusType,
      asOf: typeof asOf === "string" ? asOf.trim() : undefined,
    });

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
    logRoutingDebug("checkpoint forecast raw response payload", {
      endpoint: endpoint.toString(),
      status: response.status,
      payload,
    });

    const data = extractForecastData(payload);

  if (!data.checkpoint) {
    throw new Error("Forecast response did not include a checkpoint.");
  }

  const checkpoint = normalizeCheckpointRecord(data.checkpoint, 0);
    const requestStatusType = (
      firstNonEmptyString(data.request?.status_type, statusType) ?? statusType
    ) as CheckpointForecastStatusType | string;
    const predictions = {
      entering: [] as NormalizedCheckpointForecastTimelineItem[],
      leaving: [] as NormalizedCheckpointForecastTimelineItem[],
    };

    if (Array.isArray(data.predictions)) {
      const fallbackStatusType =
        requestStatusType === "leaving" ? "leaving" : "entering";
      const normalizedItems = normalizePredictionGroup(
        data.predictions,
        fallbackStatusType,
      );

      for (const item of normalizedItems) {
        addTimelineItem(predictions, item);
      }
    } else if (isPredictionGroup(data.predictions)) {
      const enteringItems = normalizePredictionGroup(
        data.predictions.entering,
        "entering",
      );
      const leavingItems = normalizePredictionGroup(
        data.predictions.leaving,
        "leaving",
      );

      for (const item of enteringItems) {
        addTimelineItem(predictions, item);
      }

      for (const item of leavingItems) {
        addTimelineItem(predictions, item);
      }
    }

    const travelWindow = normalizeTravelWindow(
      (data.travel_window ?? data.travelWindow) as CheckpointTravelWindowDto | null | undefined,
      firstNonEmptyString(data.reference_time, data.referenceTime, data.request?.as_of, asOf),
      firstNonEmptyString(data.scope),
    );

    return {
      checkpoint,
      request: {
        checkpointId: firstNonEmptyString(
          data.request?.checkpoint_id,
          numericCheckpointId,
        ) ?? String(numericCheckpointId),
        statusType: requestStatusType,
        asOf: firstNonEmptyString(data.request?.as_of, asOf),
        asOfPalestine: formatDateTimeInPalestine(
          firstNonEmptyString(data.request?.as_of, asOf),
        ),
      },
      predictions,
      travelWindow,
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

export async function getCheckpointTravelWindow(
  checkpointId: string | number,
  asOf?: string,
): Promise<{
  checkpoint: NormalizedCheckpointForecast["checkpoint"];
  request: {
    checkpointId: string;
    asOf: string | null;
    asOfPalestine?: string | null;
  };
  travelWindow: NormalizedCheckpointTravelWindow;
}> {
  const numericCheckpointId = Number(checkpointId);
  if (!Number.isFinite(numericCheckpointId)) {
    throw new Error("Travel window requests require a numeric checkpoint id.");
  }

  const endpoint = new URL(
    `${getGeoApiBaseUrl()}/checkpoints/${numericCheckpointId}/travel-window`,
  );
  if (typeof asOf === "string" && asOf.trim()) {
    endpoint.searchParams.set("as_of", asOf.trim());
  }

  try {
    logRoutingDebug("checkpoint travel-window request payload", {
      endpoint: endpoint.toString(),
      checkpointId: numericCheckpointId,
      asOf: typeof asOf === "string" ? asOf.trim() : undefined,
    });

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
    logRoutingDebug("checkpoint travel-window raw response payload", {
      endpoint: endpoint.toString(),
      status: response.status,
      payload,
    });

    const data = extractForecastData(payload);
    if (!data.checkpoint) {
      throw new Error("Travel window response did not include a checkpoint.");
    }

    const travelWindow = normalizeTravelWindow(
      (data.travel_window ?? data.travelWindow) as CheckpointTravelWindowDto | null | undefined,
      firstNonEmptyString(data.reference_time, data.referenceTime, data.request?.as_of, asOf),
      firstNonEmptyString(data.scope),
    );

    if (!travelWindow) {
      throw new Error("Travel window response did not include travel window data.");
    }

    return {
      checkpoint: normalizeCheckpointRecord(data.checkpoint, 0),
      request: {
        checkpointId: firstNonEmptyString(
          data.request?.checkpoint_id,
          numericCheckpointId,
        ) ?? String(numericCheckpointId),
        asOf: firstNonEmptyString(data.request?.as_of, asOf),
        asOfPalestine: formatDateTimeInPalestine(
          firstNonEmptyString(data.request?.as_of, asOf),
        ),
      },
      travelWindow,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "TypeError") {
        throw new Error("Unable to reach the travel window service.");
      }

      throw error;
    }

    throw new Error("Unable to load checkpoint travel window data.");
  }
}

export async function getCheckpointPrediction(
  checkpointId: string | number,
  targetDateTime: string,
  statusType: "entering" | "leaving",
): Promise<NormalizedCheckpointPrediction> {
  const numericCheckpointId = Number(checkpointId);
  if (!Number.isFinite(numericCheckpointId)) {
    throw new Error("Prediction requests require a numeric checkpoint id.");
  }

  if (statusType !== "entering" && statusType !== "leaving") {
    throw new Error("Prediction status_type must be entering or leaving.");
  }

  const trimmedTargetDateTime = targetDateTime.trim();
  if (!trimmedTargetDateTime) {
    throw new Error("Prediction requests require a target datetime.");
  }

  const endpoint = `${getGeoApiBaseUrl()}/checkpoints/${numericCheckpointId}/predict`;
  try {
    logRoutingDebug("checkpoint prediction request payload", {
      endpoint,
      checkpointId: numericCheckpointId,
      targetDateTime: trimmedTargetDateTime,
      targetDateTimePalestine: formatDateTimeInPalestine(trimmedTargetDateTime),
      statusType,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_datetime: trimmedTargetDateTime,
        status_type: statusType,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    const payload: unknown = await response.json();
    logRoutingDebug("checkpoint prediction raw response payload", {
      endpoint,
      status: response.status,
      payload,
    });

    const data = extractPredictionData(payload);

    if (!data.checkpoint || !data.prediction) {
      throw new Error("Prediction response did not include a checkpoint prediction.");
    }

    const checkpoint = normalizeCheckpointRecord(data.checkpoint, 0);
    const requestStatusType = (
      firstNonEmptyString(data.request?.status_type, statusType) ?? statusType
    ) as "entering" | "leaving" | string;
    const normalizedPredictionItem = normalizePredictionItem(
      {
        horizon: "exact_time",
        target_datetime: firstNonEmptyString(
          data.request?.target_datetime,
          trimmedTargetDateTime,
        ),
        prediction: data.prediction,
      },
      0,
      requestStatusType === "leaving" ? "leaving" : "entering",
    );

    if (!normalizedPredictionItem) {
      throw new Error("Prediction response could not be normalized.");
    }

    return {
      checkpoint,
      request: {
        checkpointId: firstNonEmptyString(
          data.request?.checkpoint_id,
          numericCheckpointId,
        ) ?? String(numericCheckpointId),
        targetDateTime: firstNonEmptyString(
          data.request?.target_datetime,
          trimmedTargetDateTime,
        ),
        targetDateTimePalestine: formatDateTimeInPalestine(
          firstNonEmptyString(data.request?.target_datetime, trimmedTargetDateTime),
        ),
        statusType: requestStatusType,
      },
      prediction: normalizedPredictionItem.prediction,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "TypeError") {
        throw new Error("Unable to reach the prediction service.");
      }

      throw error;
    }

    throw new Error("Unable to load checkpoint prediction data.");
  }
}
