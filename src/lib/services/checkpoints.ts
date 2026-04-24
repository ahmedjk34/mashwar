import {
  hasValidCoordinates,
  normalizeCheckpointStatus,
} from "@/lib/config/map";
import { getGeoApiBaseUrl } from "@/lib/services/geo-api";
import type {
  CheckpointApiEnvelope,
  CheckpointApiRecord,
  MapCheckpoint,
} from "@/lib/types/map";

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
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

export function normalizeCheckpointRecord(
  record: CheckpointApiRecord,
  index: number,
): MapCheckpoint {
  const latitude = toNumber(record.lat ?? record.latitude);
  const longitude = toNumber(record.lng ?? record.longitude);

  const name =
    firstNonEmptyString(record.nameAr, record.name, record.checkpoint) ??
    `Checkpoint ${index + 1}`;
  const id =
    firstNonEmptyString(record.id, record.nameAr, record.name, record.checkpoint) ??
    `checkpoint-${index + 1}`;

  const currentStatus = firstNonEmptyString(
    record.current_status,
    record.currentStatus,
    record.status,
  );
  const normalizedCurrentStatus = normalizeCheckpointStatus(currentStatus);
  const enteringStatus = normalizeCheckpointStatus(
    record.entering_status ?? record.enteringStatus ?? currentStatus,
  );
  const leavingStatus = normalizeCheckpointStatus(
    record.leaving_status ?? record.leavingStatus ?? currentStatus,
  );

  return {
    id,
    name,
    city: firstNonEmptyString(record.city),
    latitude: hasValidCoordinates(latitude, longitude) ? latitude : null,
    longitude: hasValidCoordinates(latitude, longitude) ? longitude : null,
    enteringStatus: enteringStatus ?? normalizedCurrentStatus,
    leavingStatus: leavingStatus ?? normalizedCurrentStatus,
    enteringStatusLastUpdated: firstNonEmptyString(
      record.entering_status_last_updated,
      record.enteringStatusLastUpdated,
    ),
    leavingStatusLastUpdated: firstNonEmptyString(
      record.leaving_status_last_updated,
      record.leavingStatusLastUpdated,
    ),
    alertText: firstNonEmptyString(record.alert_text),
    rawStatus: currentStatus,
    currentStatusLabel: currentStatus,
    uncertaintyScore: record.uncertainty_score ?? record.uncertaintyScore ?? null,
    uncertainty: record.uncertainty ?? null,
    prediction: record.prediction ?? null,
  };
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
        return "Checkpoint service is currently unavailable.";
      }

      if (response.status === 502) {
        return "Unable to fetch current checkpoints right now.";
      }

      return message;
    }
  } catch {
    return `Checkpoint request failed with status ${response.status}.`;
  }

  return `Checkpoint request failed with status ${response.status}.`;
}

function extractCheckpointRecords(payload: unknown): CheckpointApiRecord[] {
  if (Array.isArray(payload)) {
    return payload as CheckpointApiRecord[];
  }

  const envelope = payload as CheckpointApiEnvelope | null;
  if (envelope?.success === true && Array.isArray(envelope.data)) {
    return envelope.data;
  }

  throw new Error("Invalid checkpoints response.");
}

export async function getCheckpoints(): Promise<MapCheckpoint[]> {
  const endpoint = `${getGeoApiBaseUrl("current checkpoints")}/checkpoints/current-status`;

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
    const records = extractCheckpointRecords(payload);

    return records
      .map((record, index) =>
        normalizeCheckpointRecord(record as CheckpointApiRecord, index),
      );
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "TypeError") {
        throw new Error("Unable to reach the checkpoint service.");
      }

      throw error;
    }

    throw new Error(
      "Unable to load checkpoint data from the configured Geo API.",
    );
  }
}
