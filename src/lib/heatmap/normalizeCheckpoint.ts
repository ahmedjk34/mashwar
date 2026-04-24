import { normalizeCheckpointStatus } from "@/lib/config/map";
import type { MapCheckpoint } from "@/lib/types/map";

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

const STATUS_SCORE_MAP = new Map<string, number>([
  ["open", 15],
  ["clear", 15],
  ["normal", 15],
  ["green", 15],
  ["سالك", 15],
  ["moderate", 55],
  ["slow", 55],
  ["busy", 55],
  ["yellow", 55],
  ["أزمة", 55],
  ["ازمة", 55],
  ["أزمة متوسطة", 55],
  ["closed", 90],
  ["blocked", 90],
  ["red", 90],
  ["مغلق", 90],
  ["أزمة خانقة", 90],
  ["unknown", 50],
  ["missing", 50],
  ["غير معروف", 50],
]);

function getFallbackStatusScore(checkpoint: MapCheckpoint): number {
  const checkpointRecord = checkpoint as MapCheckpoint & Record<string, unknown>;
  const candidates = [
    checkpointRecord.currentStatusLabel,
    checkpointRecord.rawStatus,
    checkpointRecord.current_status,
    checkpointRecord.currentStatus,
    checkpoint.enteringStatus,
    checkpoint.leavingStatus,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) {
      continue;
    }

    const direct = STATUS_SCORE_MAP.get(candidate);
    if (typeof direct === "number") {
      return direct;
    }

    const normalized = normalizeKey(candidate);
    const mapped = STATUS_SCORE_MAP.get(normalized);
    if (typeof mapped === "number") {
      return mapped;
    }

    const appStatus = normalizeCheckpointStatus(candidate);
    const appMapped = STATUS_SCORE_MAP.get(appStatus);
    if (typeof appMapped === "number") {
      return appMapped;
    }
  }

  return 50;
}

export function normalizeCheckpointId(
  value: string | number | null | undefined,
): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return null;
}

export function getCheckpointUncertaintyScore(checkpoint: MapCheckpoint | null | undefined): number {
  if (!checkpoint) {
    return 50;
  }

  const checkpointRecord = checkpoint as MapCheckpoint & Record<string, unknown>;
  const nestedUncertainty = checkpointRecord.uncertainty as
    | { score?: unknown }
    | null
    | undefined;
  const prediction = checkpointRecord.prediction as
    | { uncertainty_score?: unknown; uncertaintyScore?: unknown }
    | null
    | undefined;

  const directScore =
    toFiniteNumber(nestedUncertainty?.score) ??
    toFiniteNumber(checkpointRecord.uncertainty_score) ??
    toFiniteNumber(checkpointRecord.uncertaintyScore) ??
    toFiniteNumber(prediction?.uncertainty_score) ??
    toFiniteNumber(prediction?.uncertaintyScore);

  if (directScore !== null) {
    return clampScore(directScore);
  }

  return clampScore(getFallbackStatusScore(checkpoint));
}
