import {
  hasValidCoordinates,
  normalizeCheckpointStatus,
} from "@/lib/config/map";
import type {
  CheckpointApiRecord,
  MapCheckpoint,
  MapCheckpointStatus,
} from "@/lib/types/map";

const DEV_FALLBACK_STATUS_SEQUENCE: MapCheckpointStatus[] = [
  "سالك",
  "أزمة متوسطة",
  "أزمة خانقة",
  "مغلق",
];

function getGeoApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_GEO_API_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      "NEXT_PUBLIC_GEO_API_URL is required to fetch checkpoint coordinates.",
    );
  }

  return baseUrl.replace(/\/+$/, "");
}

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

function getStableFallbackStatus(seed: string): MapCheckpointStatus {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }

  return DEV_FALLBACK_STATUS_SEQUENCE[
    Math.abs(hash) % DEV_FALLBACK_STATUS_SEQUENCE.length
  ];
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

function normalizeCheckpointRecord(
  record: CheckpointApiRecord,
  index: number,
): MapCheckpoint | null {
  const latitude = toNumber(record.lat ?? record.latitude);
  const longitude = toNumber(record.lng ?? record.longitude);

  if (!hasValidCoordinates(latitude, longitude)) {
    return null;
  }

  const normalizedLatitude = latitude as number;
  const normalizedLongitude = longitude as number;

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
  const hasDirectionalStatuses =
    Boolean(record.entering_status) || Boolean(record.leaving_status);
  const hasCurrentStatus = Boolean(currentStatus);

  if (!hasDirectionalStatuses && !hasCurrentStatus) {
    const fallbackStatus = getStableFallbackStatus(`${id}:${name}`);

    return {
      id,
      name,
      latitude: normalizedLatitude,
      longitude: normalizedLongitude,
      enteringStatus: fallbackStatus,
      leavingStatus: fallbackStatus,
      usesFallbackStatus: true,
      rawStatus: null,
    };
  }

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
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
    enteringStatus: hasDirectionalStatuses ? enteringStatus : normalizedCurrentStatus,
    leavingStatus: hasDirectionalStatuses ? leavingStatus : normalizedCurrentStatus,
    usesFallbackStatus: false,
    rawStatus: currentStatus,
  };
}

export async function getCheckpoints(): Promise<MapCheckpoint[]> {
  const endpoint = `${getGeoApiBaseUrl()}/api/checkpoints/coordinates`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Checkpoint request failed with status ${response.status}.`,
      );
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("Checkpoint API must return an array.");
    }

    return payload
      .map((record, index) =>
        normalizeCheckpointRecord(record as CheckpointApiRecord, index),
      )
      .filter((checkpoint): checkpoint is MapCheckpoint => checkpoint !== null);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      "Unable to load checkpoint data from the configured Geo API.",
    );
  }
}
