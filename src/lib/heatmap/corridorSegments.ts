import type { FeatureCollection, LineString } from "geojson";

import { getCheckpointUncertaintyScore, normalizeCheckpointId } from "@/lib/heatmap/normalizeCheckpoint";
import type {
  HeatmapCorridorFeature,
  HeatmapSegmentFeature,
  HeatmapSeverity,
} from "@/lib/types/heatmap";
import type { MapCheckpoint } from "@/lib/types/map";

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function getSeverity(score: number): HeatmapSeverity {
  if (score < 30) {
    return "low";
  }

  if (score < 60) {
    return "medium";
  }

  if (score < 80) {
    return "high";
  }

  return "critical";
}

export function computeCorridorScore(
  fromCheckpoint: MapCheckpoint | null | undefined,
  toCheckpoint: MapCheckpoint | null | undefined,
): {
  fromScore: number;
  toScore: number;
  corridorScore: number;
} {
  const fromScore = getCheckpointUncertaintyScore(fromCheckpoint);
  const toScore = getCheckpointUncertaintyScore(toCheckpoint);
  const average = (fromScore + toScore) / 2;
  const worst = Math.max(fromScore, toScore);

  return {
    fromScore,
    toScore,
    corridorScore: clampScore(0.7 * worst + 0.3 * average),
  };
}

export function corridorToSegments(
  corridorFeature: HeatmapCorridorFeature,
  fromScore: number,
  toScore: number,
  corridorScore: number,
): HeatmapSegmentFeature[] {
  const coordinates = corridorFeature.geometry.coordinates;
  if (coordinates.length < 2) {
    return [];
  }

  const segmentCount = coordinates.length - 1;

  return coordinates.slice(0, -1).map((startCoordinate, index) => {
    const endCoordinate = coordinates[index + 1];
    const t = segmentCount > 1 ? index / (segmentCount - 1) : 0;
    const gradientScore = fromScore + (toScore - fromScore) * t;
    const finalSegmentScore = clampScore(
      0.65 * corridorScore + 0.35 * gradientScore,
    );

    return {
      type: "Feature",
      properties: {
        id: `${corridorFeature.properties.id}:${index}`,
        corridor_id: corridorFeature.properties.id,
        from_checkpoint_id: corridorFeature.properties.from_checkpoint_id,
        to_checkpoint_id: corridorFeature.properties.to_checkpoint_id,
        from_checkpoint_name: corridorFeature.properties.from_checkpoint_name ?? null,
        to_checkpoint_name: corridorFeature.properties.to_checkpoint_name ?? null,
        distance_m: corridorFeature.properties.distance_m ?? null,
        from_score: fromScore,
        to_score: toScore,
        score: finalSegmentScore,
        severity: getSeverity(finalSegmentScore),
      },
      geometry: {
        type: "LineString",
        coordinates: [startCoordinate, endCoordinate],
      },
    };
  });
}

export function buildCorridorSegments(
  corridorsRaw: HeatmapCorridorFeature[],
  checkpointById: Map<string, MapCheckpoint>,
): FeatureCollection<LineString, HeatmapSegmentFeature["properties"]> {
  const features = corridorsRaw.flatMap((corridorFeature) => {
    if (
      corridorFeature.geometry.type !== "LineString" ||
      corridorFeature.geometry.coordinates.length < 2
    ) {
      return [];
    }

    const fromCheckpoint = checkpointById.get(
      normalizeCheckpointId(corridorFeature.properties.from_checkpoint_id) ?? "",
    );
    const toCheckpoint = checkpointById.get(
      normalizeCheckpointId(corridorFeature.properties.to_checkpoint_id) ?? "",
    );
    const { fromScore, toScore, corridorScore } = computeCorridorScore(
      fromCheckpoint,
      toCheckpoint,
    );

    return corridorToSegments(
      corridorFeature,
      fromScore,
      toScore,
      corridorScore,
    );
  });

  return {
    type: "FeatureCollection",
    features,
  };
}
