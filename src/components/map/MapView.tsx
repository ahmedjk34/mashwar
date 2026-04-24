"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

import {
  buildCheckpointFeatureCollection,
  calculateRouteBounds,
  CHECKPOINT_CLUSTER_COUNT_LAYER_ID,
  CHECKPOINT_CLUSTER_LAYER_ID,
  CHECKPOINT_INTERACTIVE_LAYER_IDS,
  CHECKPOINT_SOURCE_ID,
  CHECKPOINT_UNCLUSTERED_LAYER_ID,
  CLUSTER_COLOR_EXPRESSION,
  CLUSTER_RADIUS_EXPRESSION,
  DEFAULT_ZOOM,
  DEFAULT_MAP_GLYPHS_URL,
  getMapTileUrlTemplate,
  getRenderableRoutes,
  MAX_ZOOM,
  MIN_ZOOM,
  PALESTINE_BOUNDS,
  PALESTINE_CENTER,
  ROUTE_STYLE,
  USER_LOCATION_ACCURACY_LAYER_ID,
  USER_LOCATION_LAYER_ID,
  USER_LOCATION_SOURCE_ID,
  USER_LOCATION_STYLE,
  TILE_LAYER_ID,
  TILE_SOURCE_ID,
  transformRouteToGeoJSON,
  UNCLUSTERED_RADIUS_EXPRESSION,
} from "@/lib/config/map";
import { formatDateTimeInPalestine } from "@/lib/utils/palestine-time";
import type {
  MapCheckpoint,
  NormalizedRoutes,
  RoutePath,
  RoutePoint,
  RoutingRiskLevel,
  UserLocation,
} from "@/lib/types/map";

interface MapViewProps {
  checkpoints: MapCheckpoint[];
  routes: NormalizedRoutes;
  departAt?: string | null;
  userLocation?: UserLocation | null;
  routeEndpoints?: {
    from: RoutePoint | null;
    to: RoutePoint | null;
  };
  placementMode?: "from" | "to" | null;
  onMapPlacement?: (point: RoutePoint) => void;
  onCheckpointSelect?: (checkpoint: MapCheckpoint | null) => void;
  onRouteSelect?: (routeId: string) => void;
  onRouteOpen?: (routeId: string) => void;
}

type MapLibreModule = typeof import("maplibre-gl");

const ROUTE_LAYER_IDS = [
  "route-v2-slot-1",
  "route-v2-slot-2",
  "route-v2-slot-3",
] as const;
const ROUTE_LAYER_OUTLINE_IDS = [
  "route-v2-slot-1-outline",
  "route-v2-slot-2-outline",
  "route-v2-slot-3-outline",
] as const;

interface RouteLabelItem {
  routeId: string;
  rank: number;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  normalX: number;
  normalY: number;
  accentColor: string;
  scale: number;
  opacity: number;
  width: number;
  height: number;
  durationLabel: string;
  arrivalLabel: string;
  delayLabel: string | null;
  riskLabel: string;
  riskTone: "good" | "warning" | "danger";
  scoreLabel: string;
  checkpointLabel: string;
  summaryLabel: string | null;
  isSelected: boolean;
}

function getRouteLayerStyle(routeIndex: number, isSelected: boolean) {
  const color =
    ROUTE_STYLE.PALETTE[routeIndex] ??
    ROUTE_STYLE.PALETTE[ROUTE_STYLE.PALETTE.length - 1];

  return {
    color,
    width: isSelected ? ROUTE_STYLE.MAIN_WIDTH : ROUTE_STYLE.ALT_WIDTH,
    opacity: isSelected ? ROUTE_STYLE.MAIN_OPACITY : ROUTE_STYLE.ALT_OPACITY,
    outlineColor: ROUTE_STYLE.OUTLINE_COLOR,
    outlineWidth: ROUTE_STYLE.OUTLINE_WIDTH,
  };
}

function getRouteRiskLabel(route: RoutePath): {
  label: string;
  tone: "good" | "warning" | "danger";
} {
  const riskLevel: RoutingRiskLevel =
    route.riskLevel !== "unknown"
      ? route.riskLevel
      : route.routeViability === "good"
        ? "low"
        : route.routeViability === "avoid"
          ? "high"
          : "medium";

  switch (riskLevel) {
    case "low":
      return { label: "LOW RISK", tone: "good" };
    case "high":
      return { label: "HIGH RISK", tone: "danger" };
    case "medium":
      return { label: "MEDIUM RISK", tone: "warning" };
    default:
      return { label: "RISK UNKNOWN", tone: "warning" };
  }
}

function getRouteToneStyles(tone: "good" | "warning" | "danger") {
  switch (tone) {
    case "good":
      return {
        text: "#166534",
        border: "rgba(34, 197, 94, 0.22)",
        background: "rgba(34, 197, 94, 0.12)",
      };
    case "danger":
      return {
        text: "#b91c1c",
        border: "rgba(239, 68, 68, 0.22)",
        background: "rgba(239, 68, 68, 0.12)",
      };
    default:
      return {
        text: "#b45309",
        border: "rgba(245, 158, 11, 0.22)",
        background: "rgba(245, 158, 11, 0.12)",
      };
  }
}

function formatDelayLabel(delayMinutes: number | null): string | null {
  if (delayMinutes === null || !Number.isFinite(delayMinutes) || delayMinutes <= 0) {
    return null;
  }

  return `+${Math.round(delayMinutes)} min delay`;
}

function formatRouteArrivalLabel(value: string | null): string {
  if (!value) {
    return "Arrival n/a";
  }

  return formatDateTimeInPalestine(value);
}

function getRouteNoteLabel(route: RoutePath): string | null {
  if (route.expectedDelayMinutes !== null && route.expectedDelayMinutes > 0) {
    return "Base ETA + upstream delay";
  }

  if (route.riskComponents.length > 0) {
    return route.riskComponents[0];
  }

  return null;
}

function getRouteScoreLabel(route: RoutePath): string {
  if (route.riskScore !== null && Number.isFinite(route.riskScore)) {
    return `Risk ${route.riskScore.toFixed(1)}`;
  }

  if (Number.isFinite(route.routeScore)) {
    return `Route ${route.routeScore.toFixed(1)}`;
  }

  return "Risk n/a";
}

function formatDurationLabel(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) {
    return "n/a";
  }

  const totalMinutes = Math.round(durationMs / 60000);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${totalMinutes} min`;
}

function formatRouteDistance(distanceM: number): string {
  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    return "0 km";
  }

  if (distanceM >= 1000) {
    return `${(distanceM / 1000).toFixed(distanceM >= 10000 ? 0 : 1)} km`;
  }

  return `${Math.round(distanceM)} m`;
}

function formatConfidence(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${Math.round(value * 100)}%`;
}

function getRouteSummary(route: RoutePath): string | null {
  if (route.riskComponents.length > 0) {
    return route.riskComponents.slice(0, 2).join(" · ");
  }

  return route.reasonSummary || null;
}

function truncateLabel(value: string | null, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function intersects(
  left: number,
  top: number,
  right: number,
  bottom: number,
  other: { left: number; top: number; right: number; bottom: number },
): boolean {
  return !(
    right <= other.left ||
    left >= other.right ||
    bottom <= other.top ||
    top >= other.bottom
  );
}

function resolveRouteLabelLayout(
  items: RouteLabelItem[],
  viewportWidth: number,
  viewportHeight: number,
): RouteLabelItem[] {
  const placed: Array<
    RouteLabelItem & {
      left: number;
      top: number;
      right: number;
      bottom: number;
    }
  > = [];
  const sortedItems = [...items].sort((left, right) => {
    if (left.isSelected !== right.isSelected) {
      return left.isSelected ? -1 : 1;
    }

    return left.rank - right.rank;
  });

  sortedItems.forEach((item) => {
    const scaleOptions = [
      item.scale,
      clamp(item.scale * 0.9, 0.62, 1.2),
      clamp(item.scale * 0.82, 0.58, 1.08),
      clamp(item.scale * 0.74, 0.54, 0.98),
    ];
    const laneOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4];
    const tangentX = -item.normalY;
    const tangentY = item.normalX;
    let chosen:
      | (RouteLabelItem & {
          left: number;
          top: number;
          right: number;
          bottom: number;
        })
      | null = null;
    let fallbackCandidate:
      | (RouteLabelItem & {
          left: number;
          top: number;
          right: number;
          bottom: number;
          overlapCount: number;
        })
      | null = null;

    scaleOptions.forEach((candidateScale) => {
      if (chosen) {
        return;
      }

      const width = Math.round(item.width * (candidateScale / item.scale));
      const height = Math.round(item.height * (candidateScale / item.scale));
      const verticalLift = 14 + candidateScale * 12;
      const laneSpacing = 24 + candidateScale * 24;

      laneOffsets.forEach((laneOffset) => {
        if (chosen) {
          return;
        }

        const laneShift = laneOffset * laneSpacing;
        const x = item.anchorX + item.normalX * laneShift + tangentX * laneOffset * 8;
        const y =
          item.anchorY + item.normalY * laneShift + tangentY * laneOffset * 6 - verticalLift;
        const left = x - width / 2;
        const top = y - height;
        const right = x + width / 2;
        const bottom = y;

        if (
          left < 8 ||
          top < 8 ||
          right > viewportWidth - 8 ||
          bottom > viewportHeight - 8
        ) {
          return;
        }

        const overlapCount = placed.filter((other) =>
          intersects(left, top, right, bottom, other),
        ).length;
        const candidate = {
          ...item,
          x,
          y,
          width,
          height,
          scale: candidateScale,
          left,
          top,
          right,
          bottom,
        };

        if (overlapCount === 0) {
          chosen = candidate;
          return;
        }

        if (
          !fallbackCandidate ||
          overlapCount < fallbackCandidate.overlapCount ||
          (overlapCount === fallbackCandidate.overlapCount &&
            candidateScale < fallbackCandidate.scale)
        ) {
          fallbackCandidate = { ...candidate, overlapCount };
        }
      });
    });

    const finalCandidate = chosen ?? (item.isSelected ? fallbackCandidate : null);
    if (!finalCandidate) {
      return;
    }

    placed.push(finalCandidate);
  });

  return placed.map(
    ({ left: _left, top: _top, right: _right, bottom: _bottom, ...item }) => item,
  );
}

export default function MapView({
  checkpoints,
  routes,
  departAt,
  userLocation,
  routeEndpoints,
  placementMode,
  onMapPlacement,
  onCheckpointSelect,
  onRouteSelect,
  onRouteOpen,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const routePopupRef = useRef<InstanceType<MapLibreModule["Popup"]> | null>(null);
  const routeEndpointMarkerRefs = useRef<{
    from: InstanceType<MapLibreModule["Marker"]> | null;
    to: InstanceType<MapLibreModule["Marker"]> | null;
  }>({
    from: null,
    to: null,
  });
  const departAtRef = useRef<string | null | undefined>(departAt);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [routeLabelItems, setRouteLabelItems] = useState<RouteLabelItem[]>([]);

  useEffect(() => {
    departAtRef.current = departAt;
  }, [departAt]);

  const checkpointsById = useMemo(() => {
    return new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  }, [checkpoints]);

  const checkpointFeatureCollection = useMemo(() => {
    return buildCheckpointFeatureCollection(checkpoints);
  }, [checkpoints]);

  const routePaths = useMemo(() => getRenderableRoutes(routes), [routes]);

  const routeLayerBindings = useMemo(
    () =>
      routePaths.slice(0, ROUTE_LAYER_IDS.length).map((route, index) => ({
        layerId: ROUTE_LAYER_IDS[index],
        route,
      })),
    [routePaths],
  );

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || routePaths.length === 0) {
      setRouteLabelItems([]);
      return;
    }

    const map = mapRef.current;
    let animationFrame = 0;

    const updateRouteLabels = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        if (!mapRef.current) {
          return;
        }

        const canvas = map.getCanvas();
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const zoom = map.getZoom();
        const selectedRouteId =
          routes.selectedRouteId ?? routePaths[0]?.routeId ?? null;
        const viewportFactor = clamp((Math.min(width, height) - 360) / 880, 0, 1);
        const zoomFactor = clamp((zoom - 7) / 8, 0, 1);
        const scale = clamp(0.64 + viewportFactor * 0.1 + zoomFactor * 0.18, 0.64, 0.92);
        const offsetDistance = 12 + scale * 8;
        const opacity = clamp(0.58 + zoomFactor * 0.3, 0.58, 0.88);
        const proposedLabels = routePaths
          .slice(0, ROUTE_LAYER_IDS.length)
          .flatMap((route, index) => {
            const projectedCoordinates = route.geometry.coordinates.map(([lng, lat]) =>
              map.project([lng, lat]),
            );
            const isSelectedRoute = route.routeId === selectedRouteId;
            const risk = getRouteRiskLabel(route);
            const arrivalLabel = formatRouteArrivalLabel(
              resolveRouteArrivalDateTime(route),
            );
            const routeScale = isSelectedRoute ? scale : scale * 0.86;
            const labelWidth = isSelectedRoute
              ? Math.round(176 + routeScale * 28)
              : Math.round(138 + routeScale * 18);
            const labelHeight = isSelectedRoute
              ? Math.round(88 + routeScale * 14)
              : Math.round(40 + routeScale * 8);
            const summaryLabel = isSelectedRoute
              ? truncateLabel(getRouteSummary(route), 48)
              : null;
            const checkpointLabel = isSelectedRoute
              ? `${route.checkpointCount} checkpoints · ${formatRouteDistance(route.distanceM)}`
              : formatRouteDistance(route.distanceM);

            if (projectedCoordinates.length === 0) {
              return [];
            }

            if (projectedCoordinates.length === 1) {
              const singlePoint = projectedCoordinates[0];
              return [
                {
                  routeId: route.routeId,
                  rank: route.rank,
                  x: singlePoint.x,
                  y: singlePoint.y,
                  anchorX: singlePoint.x,
                  anchorY: singlePoint.y,
                  normalX: 0,
                  normalY: -1,
                  accentColor:
                    ROUTE_STYLE.PALETTE[index] ??
                    ROUTE_STYLE.PALETTE[ROUTE_STYLE.PALETTE.length - 1],
                  scale: routeScale,
                  opacity,
                  width: labelWidth,
                  height: labelHeight,
                  durationLabel: formatDurationLabel(route.smartEtaMs ?? route.durationMs),
                  arrivalLabel,
                  delayLabel: formatDelayLabel(
                    route.expectedDelayMinutes ?? route.estimatedDelayMinutes,
                  ),
                  riskLabel: risk.label,
                  riskTone: risk.tone,
                  scoreLabel: `${getRouteScoreLabel(route)} · ${formatConfidence(route.riskConfidence)}`,
                  checkpointLabel,
                  summaryLabel,
                  isSelected: isSelectedRoute,
                },
              ];
            }

            const segmentLengths: number[] = [];
            let totalLength = 0;

            for (let pointIndex = 1; pointIndex < projectedCoordinates.length; pointIndex += 1) {
              const previousPoint = projectedCoordinates[pointIndex - 1];
              const point = projectedCoordinates[pointIndex];
              const segmentLength = Math.hypot(
                point.x - previousPoint.x,
                point.y - previousPoint.y,
              );

              segmentLengths.push(segmentLength);
              totalLength += segmentLength;
            }

            if (totalLength <= 0) {
              return [];
            }

            const midpointDistance = totalLength / 2;
            let traversedLength = 0;
            let anchorX = projectedCoordinates[0].x;
            let anchorY = projectedCoordinates[0].y;
            let normalX = 0;
            let normalY = -1;

            for (
              let segmentIndex = 0;
              segmentIndex < segmentLengths.length;
              segmentIndex += 1
            ) {
              const segmentLength = segmentLengths[segmentIndex];
              if (segmentLength <= 0) {
                continue;
              }

              if (traversedLength + segmentLength >= midpointDistance) {
                const startPoint = projectedCoordinates[segmentIndex];
                const endPoint = projectedCoordinates[segmentIndex + 1];
                const segmentProgress =
                  (midpointDistance - traversedLength) / segmentLength;
                const dx = endPoint.x - startPoint.x;
                const dy = endPoint.y - startPoint.y;

                anchorX = startPoint.x + dx * segmentProgress;
                anchorY = startPoint.y + dy * segmentProgress;

                normalX = -dy / segmentLength;
                normalY = dx / segmentLength;
                break;
              }

              traversedLength += segmentLength;
            }

            const centeredIndex = index - (Math.min(routePaths.length, ROUTE_LAYER_IDS.length) - 1) / 2;
            const signedOffset = centeredIndex * offsetDistance;
            const x = anchorX + normalX * signedOffset;
            const y = anchorY + normalY * signedOffset;

            if (x < -220 || y < -220 || x > width + 220 || y > height + 220) {
              return [];
            }

            return [
              {
                routeId: route.routeId,
                rank: route.rank,
                x,
                y,
                anchorX,
                anchorY,
                normalX,
                normalY,
                accentColor:
                  ROUTE_STYLE.PALETTE[index] ??
                  ROUTE_STYLE.PALETTE[ROUTE_STYLE.PALETTE.length - 1],
                scale: routeScale,
                opacity,
                width: labelWidth,
                height: labelHeight,
                durationLabel: formatDurationLabel(route.smartEtaMs ?? route.durationMs),
                arrivalLabel,
                delayLabel: formatDelayLabel(
                  route.expectedDelayMinutes ?? route.estimatedDelayMinutes,
                ),
                riskLabel: risk.label,
                riskTone: risk.tone,
                scoreLabel: `${getRouteScoreLabel(route)} · ${formatConfidence(route.riskConfidence)}`,
                checkpointLabel,
                summaryLabel,
                isSelected: isSelectedRoute,
              },
            ];
          });

        setRouteLabelItems(resolveRouteLabelLayout(proposedLabels, width, height));
      });
    };

    updateRouteLabels();

    map.on("move", updateRouteLabels);
    map.on("zoom", updateRouteLabels);
    map.on("resize", updateRouteLabels);
    map.on("rotate", updateRouteLabels);

    return () => {
      cancelAnimationFrame(animationFrame);
      map.off("move", updateRouteLabels);
      map.off("zoom", updateRouteLabels);
      map.off("resize", updateRouteLabels);
      map.off("rotate", updateRouteLabels);
    };
  }, [mapLoaded, routePaths]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !maplibreRef.current) {
      return;
    }

    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    const markers = routeEndpointMarkerRefs.current;

    markers.from?.remove();
    markers.to?.remove();
    markers.from = null;
    markers.to = null;

    if (!routeEndpoints?.from && !routeEndpoints?.to) {
      return;
    }

    const buildEndpointElement = (role: "from" | "to") => {
      const root = document.createElement("div");
      root.style.display = "flex";
      root.style.flexDirection = "column";
      root.style.alignItems = "center";
      root.style.gap = "4px";
      root.style.pointerEvents = "none";
      root.style.transform = "translateY(-2px)";

      const dot = document.createElement("div");
      dot.style.width = "18px";
      dot.style.height = "18px";
      dot.style.borderRadius = "9999px";
      dot.style.border = "3px solid #ffffff";
      dot.style.boxShadow = "0 8px 20px rgba(15, 23, 42, 0.28)";
      dot.style.backgroundColor = role === "from" ? "#2563eb" : "#f59e0b";

      const label = document.createElement("div");
      label.textContent = role === "from" ? "START" : "FINISH";
      label.style.padding = "3px 8px";
      label.style.borderRadius = "9999px";
      label.style.backgroundColor = "#ffffff";
      label.style.border = `1px solid ${role === "from" ? "#bfdbfe" : "#fde68a"}`;
      label.style.color = role === "from" ? "#1d4ed8" : "#b45309";
      label.style.fontSize = "10px";
      label.style.fontWeight = "800";
      label.style.letterSpacing = "0.22em";
      label.style.lineHeight = "1";
      label.style.textTransform = "uppercase";
      label.style.boxShadow = "0 10px 24px rgba(15, 23, 42, 0.14)";

      root.appendChild(dot);
      root.appendChild(label);
      return root;
    };

    if (routeEndpoints.from) {
      markers.from = new maplibregl.Marker({
        element: buildEndpointElement("from"),
        anchor: "bottom",
      })
        .setLngLat([routeEndpoints.from.lng, routeEndpoints.from.lat])
        .addTo(map);
    }

    if (routeEndpoints.to) {
      markers.to = new maplibregl.Marker({
        element: buildEndpointElement("to"),
        anchor: "bottom",
      })
        .setLngLat([routeEndpoints.to.lng, routeEndpoints.to.lat])
        .addTo(map);
    }

    return () => {
      markers.from?.remove();
      markers.to?.remove();
      markers.from = null;
      markers.to = null;
    };
  }, [mapLoaded, routeEndpoints]);

  function closeRoutePopup(): void {
    routePopupRef.current?.remove();
    routePopupRef.current = null;
  }

  function resolveRouteArrivalDateTime(route: RoutePath): string | null {
    if (route.smartEtaDateTime) {
      return route.smartEtaDateTime;
    }

    const currentDepartAt = departAtRef.current;
    if (!currentDepartAt) {
      return null;
    }

    const departDate = new Date(currentDepartAt);
    if (Number.isNaN(departDate.getTime())) {
      return null;
    }

    const smartEtaMs = route.smartEtaMs ?? route.durationMs;
    if (!Number.isFinite(smartEtaMs) || smartEtaMs <= 0) {
      return null;
    }

    return new Date(departDate.getTime() + smartEtaMs).toISOString();
  }

  function getRouteHoverMarkup(route: RoutePath): string {
    const risk = getRouteRiskLabel(route);
    const smartEtaLabel = formatRouteArrivalLabel(resolveRouteArrivalDateTime(route));
    const expectedDelay = formatDelayLabel(
      route.expectedDelayMinutes ?? route.estimatedDelayMinutes,
    );
    const note = getRouteNoteLabel(route);
    const riskScoreLabel = getRouteScoreLabel(route);

    return `
      <div style="min-width: 160px; color: #f8fafc;">
        <div style="font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: #94a3b8;">Route #${route.rank}</div>
        <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 4px; font-size: 12px;">
          <div><span style="color: #94a3b8;">Smart ETA</span> <span style="font-weight: 600;">${smartEtaLabel}</span></div>
          <div><span style="color: #94a3b8;">Expected delay</span> <span style="font-weight: 600;">${expectedDelay ?? "n/a"}</span></div>
          <div><span style="color: #94a3b8;">Journey risk</span> <span style="font-weight: 600;">${risk.label} (${riskScoreLabel})</span></div>
          ${note ? `<div style="color: #cbd5e1;">${note}</div>` : ""}
        </div>
      </div>
    `;
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    let cancelled = false;

    async function initializeMap(): Promise<void> {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) {
        return;
      }

      maplibreRef.current = maplibregl;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          glyphs: DEFAULT_MAP_GLYPHS_URL,
          sources: {
            [TILE_SOURCE_ID]: {
              type: "raster",
              tiles: [getMapTileUrlTemplate()],
              tileSize: 256,
            },
          },
          layers: [
            {
              id: TILE_LAYER_ID,
              type: "raster",
              source: TILE_SOURCE_ID,
            },
          ],
        } as const,
        center: PALESTINE_CENTER,
        zoom: DEFAULT_ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        maxBounds: PALESTINE_BOUNDS,
        attributionControl: false,
      });

      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-left",
      );

      map.on("load", () => {
        if (!cancelled) {
          setMapLoaded(true);
        }
      });

      mapRef.current = map;
    }

    void initializeMap();

    return () => {
      cancelled = true;
      setMapLoaded(false);
      closeRoutePopup();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) {
      return;
    }

    const map = mapRef.current;
    const existingSource = map.getSource(
      CHECKPOINT_SOURCE_ID,
    ) as GeoJSONSource | undefined;

    if (!existingSource) {
      map.addSource(CHECKPOINT_SOURCE_ID, {
        type: "geojson",
        data: checkpointFeatureCollection,
        cluster: true,
        clusterRadius: 60,
        clusterMaxZoom: 13,
      });

      map.addLayer({
        id: CHECKPOINT_CLUSTER_LAYER_ID,
        type: "circle",
        source: CHECKPOINT_SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": CLUSTER_COLOR_EXPRESSION as any,
          "circle-radius": CLUSTER_RADIUS_EXPRESSION as any,
          "circle-opacity": 0.9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: CHECKPOINT_CLUSTER_COUNT_LAYER_ID,
        type: "symbol",
        source: CHECKPOINT_SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"] as any,
          "text-size": 12,
          "text-font": ["Open Sans Bold"],
        },
        paint: {
          "text-color": "#ffffff",
        },
      });

      map.addLayer({
        id: CHECKPOINT_UNCLUSTERED_LAYER_ID,
        type: "circle",
        source: CHECKPOINT_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "markerColor"] as any,
          "circle-radius": UNCLUSTERED_RADIUS_EXPRESSION as any,
          "circle-opacity": 0.95,
          "circle-stroke-width": 2,
          "circle-stroke-color": ["get", "markerBorderColor"] as any,
        },
      });

      return;
    }

    existingSource.setData(checkpointFeatureCollection);
  }, [checkpointFeatureCollection, mapLoaded]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) {
      return;
    }

    const map = mapRef.current;
    const existingSource = map.getSource(
      USER_LOCATION_SOURCE_ID,
    ) as GeoJSONSource | undefined;

    if (!userLocation) {
      if (existingSource) {
        existingSource.setData({
          type: "FeatureCollection",
          features: [],
        });
      }
      return;
    }

    const userLocationFeatureCollection = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [userLocation.lng, userLocation.lat],
          },
          properties: {
            accuracy: userLocation.accuracy ?? null,
          },
        },
      ],
    };

    if (!existingSource) {
      map.addSource(USER_LOCATION_SOURCE_ID, {
        type: "geojson",
        data: userLocationFeatureCollection,
      });

      map.addLayer({
        id: USER_LOCATION_ACCURACY_LAYER_ID,
        type: "circle",
        source: USER_LOCATION_SOURCE_ID,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "accuracy"], 0],
            0,
            28,
            50,
            40,
            150,
            55,
          ] as any,
          "circle-color": USER_LOCATION_STYLE.ACCURACY_FILL,
          "circle-stroke-color": USER_LOCATION_STYLE.ACCURACY_BORDER,
          "circle-stroke-width": 1,
        },
      });

      map.addLayer({
        id: USER_LOCATION_LAYER_ID,
        type: "circle",
        source: USER_LOCATION_SOURCE_ID,
        paint: {
          "circle-radius": 7,
          "circle-color": USER_LOCATION_STYLE.DOT_COLOR,
          "circle-stroke-color": USER_LOCATION_STYLE.DOT_BORDER_COLOR,
          "circle-stroke-width": 3,
        },
      });
      return;
    }

    existingSource.setData(userLocationFeatureCollection);
  }, [mapLoaded, userLocation]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !userLocation) {
      return;
    }

    mapRef.current.easeTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 14,
      duration: 900,
    });
  }, [mapLoaded, userLocation]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) {
      return;
    }

    const map = mapRef.current;
    map.getCanvas().style.cursor = placementMode ? "crosshair" : "";

    const handleClusterClick = async (event: any) => {
      if (placementMode && onMapPlacement) {
        onMapPlacement({
          lat: event.lngLat.lat,
          lng: event.lngLat.lng,
        });
        return;
      }

      const clusterFeature = event.features?.[0];
      const clusterId = Number(clusterFeature?.properties?.cluster_id);

      if (!Number.isFinite(clusterId)) {
        return;
      }

      const source = map.getSource(CHECKPOINT_SOURCE_ID) as
        | GeoJSONSource
        | undefined;
      if (!source?.getClusterExpansionZoom) {
        return;
      }

      const zoom = await source.getClusterExpansionZoom(clusterId);
      const [lng, lat] = clusterFeature.geometry.coordinates;

      map.easeTo({
        center: [lng, lat],
        zoom: Math.min(zoom, MAX_ZOOM),
        duration: 500,
      });
    };

    const handleCheckpointClick = (event: any) => {
      if (placementMode && onMapPlacement) {
        onMapPlacement({
          lat: event.lngLat.lat,
          lng: event.lngLat.lng,
        });
        return;
      }

      const checkpointId = String(
        event.features?.[0]?.properties?.checkpointId ?? "",
      );
      if (!checkpointId) {
        return;
      }

      onCheckpointSelect?.(checkpointsById.get(checkpointId) ?? null);
    };

    const handlePointerEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handlePointerLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", CHECKPOINT_CLUSTER_LAYER_ID, handleClusterClick);
    map.on("click", CHECKPOINT_CLUSTER_COUNT_LAYER_ID, handleClusterClick);
    map.on("click", CHECKPOINT_UNCLUSTERED_LAYER_ID, handleCheckpointClick);

    CHECKPOINT_INTERACTIVE_LAYER_IDS.forEach((layerId) => {
      map.on("mouseenter", layerId, handlePointerEnter);
      map.on("mouseleave", layerId, handlePointerLeave);
    });

    return () => {
      map.off("click", CHECKPOINT_CLUSTER_LAYER_ID, handleClusterClick);
      map.off("click", CHECKPOINT_CLUSTER_COUNT_LAYER_ID, handleClusterClick);
      map.off("click", CHECKPOINT_UNCLUSTERED_LAYER_ID, handleCheckpointClick);

      CHECKPOINT_INTERACTIVE_LAYER_IDS.forEach((layerId) => {
        map.off("mouseenter", layerId, handlePointerEnter);
        map.off("mouseleave", layerId, handlePointerLeave);
      });
    };
  }, [checkpointsById, mapLoaded, onCheckpointSelect, onMapPlacement, placementMode]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !onCheckpointSelect) {
      return;
    }

    const map = mapRef.current;

    const handleBackgroundClick = (event: any) => {
      if (placementMode && onMapPlacement) {
        onMapPlacement({
          lat: event.lngLat.lat,
          lng: event.lngLat.lng,
        });
        return;
      }

      const interactiveFeatures = map.queryRenderedFeatures(event.point, {
        layers: [...CHECKPOINT_INTERACTIVE_LAYER_IDS],
      });

      if (interactiveFeatures.length > 0) {
        return;
      }

      onCheckpointSelect(null);
    };

    map.on("click", handleBackgroundClick);

    return () => {
      map.off("click", handleBackgroundClick);
    };
  }, [mapLoaded, onCheckpointSelect, onMapPlacement, placementMode]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) {
      return;
    }

    const map = mapRef.current;
    const layerIds = [
      ...ROUTE_LAYER_IDS,
      ...ROUTE_LAYER_OUTLINE_IDS,
      USER_LOCATION_ACCURACY_LAYER_ID,
      USER_LOCATION_LAYER_ID,
    ];
    const sourceIds = [...ROUTE_LAYER_IDS, USER_LOCATION_SOURCE_ID];

    layerIds.forEach((id) => {
      if (map.getLayer(id)) {
        map.removeLayer(id);
      }
    });

    sourceIds.forEach((id) => {
      if (map.getSource(id)) {
        map.removeSource(id);
      }
    });

    if (routePaths.length === 0) {
      closeRoutePopup();
      return;
    }

    const selectedRouteId =
      routes.selectedRouteId ?? routePaths[0]?.routeId ?? null;
    const routeIndexById = new Map(
      routePaths.map((route, index) => [route.routeId, index] as const),
    );
    const orderedRoutes = [
      ...routePaths.filter((route) => route.routeId !== selectedRouteId),
      ...routePaths.filter((route) => route.routeId === selectedRouteId),
    ]
      .slice(0, ROUTE_LAYER_IDS.length)
      .map((route) => ({
        route,
        routeIndex: routeIndexById.get(route.routeId) ?? 0,
      }));

    orderedRoutes.forEach(({ route, routeIndex }, index) => {
      const sourceId = ROUTE_LAYER_IDS[index];
      const layerId = ROUTE_LAYER_IDS[index];
      const outlineLayerId = ROUTE_LAYER_OUTLINE_IDS[index];
      const style = getRouteLayerStyle(
        routeIndex,
        route.routeId === selectedRouteId,
      );

      map.addSource(sourceId, {
        type: "geojson",
        data: transformRouteToGeoJSON(route),
      });

      map.addLayer({
        id: outlineLayerId,
        type: "line",
        source: sourceId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": style.outlineColor,
          "line-width": style.outlineWidth,
          "line-opacity": 0.95,
        },
      });

      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": style.color,
          "line-width": style.width,
          "line-opacity": style.opacity,
        },
      });
    });

    const bounds = calculateRouteBounds(routes);
    if (!bounds) {
      return;
    }

    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        padding: { top: 50, right: 50, bottom: 50, left: 50 },
        duration: 1000,
      },
    );
  }, [mapLoaded, routePaths, routes]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) {
      return;
    }

    const map = mapRef.current;

    const routeByLayerId = new Map<string, RoutePath>(
      routeLayerBindings.map((binding) => [binding.layerId, binding.route]),
    );

    const getRouteFromEvent = (event: any): RoutePath | null => {
      const layerId = String(event.features?.[0]?.layer?.id ?? "");
      return routeByLayerId.get(layerId) ?? null;
    };

    const handleRouteMouseEnter = (event: any) => {
      const route = getRouteFromEvent(event);
      if (!route || placementMode) {
        return;
      }

      map.getCanvas().style.cursor = "pointer";

      const Popup = maplibreRef.current?.Popup;
      if (!Popup) {
        return;
      }

      closeRoutePopup();
      routePopupRef.current = new Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 16,
        className: "mashwar-route-hover-popup",
      })
        .setLngLat(event.lngLat)
        .setHTML(getRouteHoverMarkup(route))
        .addTo(map);
    };

    const handleRouteMouseMove = (event: any) => {
      if (!routePopupRef.current || placementMode) {
        return;
      }

      routePopupRef.current.setLngLat(event.lngLat);
    };

    const handleRouteMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      closeRoutePopup();
    };

    const handleRouteClick = (event: any) => {
      const route = getRouteFromEvent(event);
      if (!route) {
        return;
      }

      if (placementMode && onMapPlacement) {
        onMapPlacement({
          lat: event.lngLat.lat,
          lng: event.lngLat.lng,
        });
        return;
      }

      onRouteSelect?.(route.routeId);
      onRouteOpen?.(route.routeId);
    };

    routeLayerBindings.forEach(({ layerId }) => {
      if (!map.getLayer(layerId)) {
        return;
      }

      map.on("mouseenter", layerId, handleRouteMouseEnter);
      map.on("mousemove", layerId, handleRouteMouseMove);
      map.on("mouseleave", layerId, handleRouteMouseLeave);
      map.on("click", layerId, handleRouteClick);
    });

    return () => {
      closeRoutePopup();

      routeLayerBindings.forEach(({ layerId }) => {
        if (!map.getLayer(layerId)) {
          return;
        }

        map.off("mouseenter", layerId, handleRouteMouseEnter);
        map.off("mousemove", layerId, handleRouteMouseMove);
        map.off("mouseleave", layerId, handleRouteMouseLeave);
        map.off("click", layerId, handleRouteClick);
      });
    };
  }, [
    mapLoaded,
    onMapPlacement,
    onRouteOpen,
    onRouteSelect,
    placementMode,
    routeLayerBindings,
  ]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />

      {routeLabelItems.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-20">
          {routeLabelItems.map((item, index) => {
            const toneStyles = getRouteToneStyles(item.riskTone);
            const cardBackground = item.isSelected
              ? "linear-gradient(180deg, rgba(255,248,238,0.96), rgba(255,255,255,0.93))"
              : "linear-gradient(180deg, rgba(255,251,245,0.95), rgba(255,255,255,0.92))";
            const cardShadow = item.isSelected
              ? "0 14px 32px rgba(15,23,42,0.20)"
              : "0 10px 24px rgba(15,23,42,0.14)";
            const routeMetaColor = item.isSelected ? "#6b7280" : "#7c8798";

            return (
              <div
                key={`${item.routeId}-${index}`}
                className="absolute -translate-x-1/2 -translate-y-full"
                style={{
                  left: item.x,
                  top: item.y,
                  opacity: item.opacity,
                  zIndex: item.isSelected ? 3 : 2,
                }}
              >
                <div
                  className="relative overflow-hidden rounded-[20px] border text-slate-950 backdrop-blur-xl transition-transform duration-200 ease-out"
                  style={{
                    width: item.width,
                    minHeight: item.height,
                    borderColor: item.isSelected ? item.accentColor : `${item.accentColor}AA`,
                    background: cardBackground,
                    boxShadow: cardShadow,
                    transform: `scale(${item.scale})`,
                    transformOrigin: "center bottom",
                  }}
                >
                  {item.isSelected ? (
                    <div className="relative px-3 py-3">
                      <div
                        className="absolute inset-y-0 left-0 w-[5px]"
                        style={{ backgroundColor: item.accentColor }}
                      />
                      <div className="absolute inset-x-0 top-0 h-[1px] bg-[linear-gradient(90deg,transparent,rgba(148,163,184,0.42),transparent)]" />

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: item.accentColor }}
                            />
                            <p
                              className="shrink-0 text-[9px] font-bold uppercase tracking-[0.24em]"
                              style={{ color: routeMetaColor }}
                            >
                              Route #{item.rank}
                            </p>
                          </div>
                          <div className="mt-2 flex items-end gap-2">
                            <p className="text-[24px] font-semibold leading-none text-slate-950">
                              {item.durationLabel}
                            </p>
                            <p className="pb-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                              ETA {item.arrivalLabel}
                            </p>
                          </div>
                        </div>
                        <span
                          className="shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em]"
                          style={{
                            color: toneStyles.text,
                            backgroundColor: toneStyles.background,
                            borderColor: toneStyles.border,
                          }}
                        >
                          {item.riskLabel}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-[12px] border border-slate-200/80 bg-white/55 px-2.5 py-2">
                          <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            Delay
                          </p>
                          <p
                            className="mt-1 text-[11px] font-semibold leading-tight"
                            style={{ color: item.delayLabel ? item.accentColor : "#475569" }}
                          >
                            {item.delayLabel ?? "Clear"}
                          </p>
                        </div>
                        <div className="rounded-[12px] border border-slate-200/80 bg-white/55 px-2.5 py-2">
                          <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            Route Data
                          </p>
                          <p className="mt-1 text-[11px] font-semibold leading-tight text-slate-700">
                            {item.checkpointLabel}
                          </p>
                        </div>
                        <div className="rounded-[12px] border border-slate-200/80 bg-white/55 px-2.5 py-2">
                          <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            Signal
                          </p>
                          <p className="mt-1 text-[11px] font-semibold leading-tight text-slate-700">
                            {item.scoreLabel}
                          </p>
                        </div>
                      </div>

                      {item.summaryLabel ? (
                        <p className="mt-2.5 line-clamp-2 text-[10px] leading-4 text-slate-600">
                          {item.summaryLabel}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="relative flex items-center gap-2 px-2.5 py-2">
                      <div
                        className="absolute inset-y-0 left-0 w-[4px]"
                        style={{ backgroundColor: item.accentColor }}
                      />
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: item.accentColor }}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-[8px] font-bold uppercase tracking-[0.22em]"
                          style={{ color: routeMetaColor }}
                        >
                          Route #{item.rank}
                        </p>
                        <div className="mt-0.5 flex items-baseline gap-2">
                          <span className="text-[17px] font-semibold leading-none text-slate-950">
                            {item.durationLabel}
                          </span>
                          <span className="truncate text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">
                            {item.riskLabel}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-slate-400">
                          Route
                        </p>
                        <p className="mt-0.5 text-[10px] font-semibold text-slate-700">
                          {item.checkpointLabel}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
