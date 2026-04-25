"use client";

import type { FeatureCollection, LineString } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
  HEATMAP_COLOR_EXPRESSION,
  HEATMAP_CORRIDOR_GLOW_LAYER_ID,
  HEATMAP_CORRIDOR_MAIN_LAYER_ID,
  HEATMAP_CORRIDOR_SOURCE_ID,
  HEATMAP_GLOW_WIDTH_EXPRESSION,
  HEATMAP_MAIN_WIDTH_EXPRESSION,
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
import type { HeatmapSegmentProperties } from "@/lib/types/heatmap";
import type {
  MapCheckpoint,
  NormalizedRoutes,
  RoutePath,
  RoutePoint,
  RoutingRiskLevel,
  RoutingRouteViability,
  UserLocation,
} from "@/lib/types/map";

interface MapViewProps {
  checkpoints: MapCheckpoint[];
  routes: NormalizedRoutes;
  departAt?: string | null;
  userLocation?: UserLocation | null;
  focusTarget?: {
    lat: number;
    lng: number;
    zoom?: number;
    key: number;
  } | null;
  routeEndpoints?: {
    from: RoutePoint | null;
    to: RoutePoint | null;
  };
  heatmapEnabled?: boolean;
  heatmapSegments?: FeatureCollection<LineString, HeatmapSegmentProperties>;
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

/** Crosshair + pin; hotspot at pin tip for map placement mode. */
const MASHWAR_PLACEMENT_CURSOR =
  `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><g stroke="rgba(255,255,255,0.95)" stroke-width="1.25" stroke-linecap="round"><path d="M18 3v6M18 27v6M3 18h6M27 18h6"/></g><path fill="#22c55e" stroke="#ffffff" stroke-width="1.4" d="M18 10.5c-2.6 0-4.7 2-4.7 4.7 0 3.2 4.7 10.3 4.7 10.3s4.7-7 4.7-10.3c0-2.6-2.1-4.7-4.7-4.7z"/></svg>',
  )}") 18 24, crosshair`;

type DurationParts =
  | { kind: "split"; amount: string; unit: string }
  | { kind: "line"; text: string };

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
  /** Visual scale; footprint = baseWidth × scale by baseHeight × scale. */
  scale: number;
  opacity: number;
  baseWidth: number;
  baseHeight: number;
  /** Smart trip duration: split minutes vs single line for ≥1h. */
  durationParts: DurationParts;
  arrivalLabel: string;
  delayLabel: string | null;
  riskBadgeLabel: string;
  riskTone: "good" | "warning" | "danger";
  /** Localized risk index (digits only; title is `riskScoreTitle`). */
  riskScoreDisplay: string;
  /** Localized full “model confidence …” line for section 3. */
  confidenceLineLabel: string;
  viabilityLabel: string;
  /** Worst forecast status label only (paired with `metaForecastTitle` in the card). */
  pressureStatusText: string | null;
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
    outlineWidth: isSelected
      ? ROUTE_STYLE.OUTLINE_WIDTH_SELECTED
      : ROUTE_STYLE.OUTLINE_WIDTH_ALT,
    outlineBlur: isSelected
      ? ROUTE_STYLE.OUTLINE_BLUR_SELECTED
      : ROUTE_STYLE.OUTLINE_BLUR_ALT,
  };
}

function getRouteToneStyles(tone: "good" | "warning" | "danger") {
  switch (tone) {
    case "good":
      return {
        text: "var(--risk-low)",
        border: "var(--risk-low)",
        background: "var(--risk-low-bg)",
      };
    case "danger":
      return {
        text: "var(--risk-high)",
        border: "var(--risk-high)",
        background: "var(--risk-high-bg)",
      };
    default:
      return {
        text: "var(--risk-med)",
        border: "var(--risk-med)",
        background: "var(--risk-med-bg)",
      };
  }
}

function truncateLabel(value: string | null, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
}

function hasArabicScript(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
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

/** Minimum gap between card footprints (each side padded by half). */
const ROUTE_LABEL_EDGE_PADDING = 10;
const ROUTE_LABEL_MIN_GAP = 6;

function footprintsOverlap(
  left: number,
  top: number,
  right: number,
  bottom: number,
  other: { left: number; top: number; right: number; bottom: number },
  gap: number,
): boolean {
  const half = gap / 2;
  return intersects(
    left - half,
    top - half,
    right + half,
    bottom + half,
    {
      left: other.left - half,
      top: other.top - half,
      right: other.right + half,
      bottom: other.bottom + half,
    },
  );
}

function buildRouteLabelScaleSteps(initialScale: number): number[] {
  const cap = Math.min(initialScale, 1.05);
  const steps: number[] = [];
  for (let s = cap; s >= 0.32; s -= 0.038) {
    steps.push(clamp(s, 0.32, cap));
    if (steps.length >= 22) {
      break;
    }
  }
  return [...new Set(steps.map((v) => Math.round(v * 1000) / 1000))];
}

function buildRouteLabelOffsetPairs(): Array<{ n: number; t: number }> {
  const normalSteps = [0, 18, -18, 32, -32, 48, -48, 66, -66, 86, -86, 108, -108, 132, -132, 158, -158];
  const tangentSteps = [0, 20, -20, 40, -40, 62, -62, 86, -86, 112, -112];
  const pairs: Array<{ n: number; t: number }> = [];
  for (const n of normalSteps) {
    for (const t of tangentSteps) {
      pairs.push({ n, t });
    }
  }
  return pairs;
}

const ROUTE_LABEL_OFFSET_PAIRS = buildRouteLabelOffsetPairs();

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

    const scaleOptions = buildRouteLabelScaleSteps(item.scale);

    outer: for (const candidateScale of scaleOptions) {
      const footprintW = Math.max(1, Math.round(item.baseWidth * candidateScale));
      const footprintH = Math.max(1, Math.round(item.baseHeight * candidateScale));
      const verticalLift = 8 + footprintH * 0.11;

      for (const { n: normalShift, t: tangentShift } of ROUTE_LABEL_OFFSET_PAIRS) {
        const x =
          item.anchorX + item.normalX * normalShift + tangentX * tangentShift;
        const y =
          item.anchorY + item.normalY * normalShift + tangentY * tangentShift - verticalLift;
        const left = x - footprintW / 2;
        const top = y - footprintH;
        const right = x + footprintW / 2;
        const bottom = y;

        if (
          left < ROUTE_LABEL_EDGE_PADDING ||
          top < ROUTE_LABEL_EDGE_PADDING ||
          right > viewportWidth - ROUTE_LABEL_EDGE_PADDING ||
          bottom > viewportHeight - ROUTE_LABEL_EDGE_PADDING
        ) {
          continue;
        }

        const hasOverlap = placed.some((other) =>
          footprintsOverlap(left, top, right, bottom, other, ROUTE_LABEL_MIN_GAP),
        );
        if (hasOverlap) {
          continue;
        }

        chosen = {
          ...item,
          x,
          y,
          scale: candidateScale,
          left,
          top,
          right,
          bottom,
        };
        break outer;
      }
    }

    if (!chosen) {
      return;
    }

    placed.push(chosen);
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
  focusTarget,
  routeEndpoints,
  heatmapEnabled = false,
  heatmapSegments = { type: "FeatureCollection", features: [] },
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
  const routeGeometryFingerprintRef = useRef<string>("");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [routeLabelItems, setRouteLabelItems] = useState<RouteLabelItem[]>([]);

  useEffect(() => {
    departAtRef.current = departAt;
  }, [departAt]);

  const locale = useLocale();
  const tCommon = useTranslations("common");
  const tMap = useTranslations("map");
  const tPopup = useTranslations("map.popup");
  const tCard = useTranslations("map.card");
  const tMarker = useTranslations("map.marker");
  const tViability = useTranslations("tradeoff.viability");
  const tBucket = useTranslations("routing.bucket");
  const dateIntlLocale = locale.startsWith("ar") ? "ar" : "en-US";
  const numberLocale = locale.startsWith("ar") ? "ar-u-nu-latn" : dateIntlLocale;

  function formatLocaleInt(value: number): string {
    return new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(value);
  }

  function formatLocaleFixed1(value: number): string {
    return new Intl.NumberFormat(numberLocale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  }

  function formatRiskScorePercent(value: number): string {
    const symbol = locale.startsWith("ar") ? "٪" : "%";
    return `${formatLocaleFixed1(value)}${symbol}`;
  }

  const formatViabilityLabel = useCallback(
    (v: RoutingRouteViability) => {
      if (v === "good" || v === "risky" || v === "avoid") {
        return tViability(v);
      }
      return tViability("unknown");
    },
    [tViability],
  );

  const humanizeRiskComponentLine = useCallback(
    (raw: string) => {
      const match = raw.match(/^([a-z0-9_]+):\s*([\d.\-+eE]+)$/i);
      if (!match) {
        return raw;
      }
      const key = match[1].toLowerCase();
      const num = Number(match[2]);
      if (!Number.isFinite(num)) {
        return raw;
      }
      const percent = num >= 0 && num <= 1 ? Math.round(num * 100) : Math.round(num * 10) / 10;

      switch (key) {
        case "checkpoint_burden":
        case "checkpoint_burden_ratio":
          return tCard("metricCheckpointBurden", { percent });
        case "severity_ratio":
          return tCard("metricSeverity", { percent });
        case "confidence_penalty":
          return tCard("metricConfidenceGap", { percent });
        case "volatility_ratio":
          return tCard("metricVolatility", { percent });
        case "average_forecast_confidence":
          return tCard("metricForecastConfidence", { percent });
        default: {
          const label = key.replace(/_/g, " ");
          const value =
            num >= 0 && num <= 1 ? `${Math.round(num * 100)}%` : String(percent);
          return tCard("metricFallback", { label, value });
        }
      }
    },
    [tCard],
  );

  const buildRouteCardSummary = useCallback(
    (route: RoutePath): string | null => {
      const summary = route.reasonSummary?.trim();
      if (summary) {
        if (locale.startsWith("ar") && !hasArabicScript(summary)) {
          return null;
        }
        return truncateLabel(summary, 92);
      }
      if (route.riskComponents.length === 0) {
        return null;
      }
      const lines = route.riskComponents
        .slice(0, 2)
        .map(humanizeRiskComponentLine)
        .join(" · ");
      if (locale.startsWith("ar") && !hasArabicScript(lines)) {
        return null;
      }
      return truncateLabel(lines, 92);
    },
    [humanizeRiskComponentLine, locale],
  );

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getRouteRiskBadgeLabel(route: RoutePath): string {
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
        return tCard("riskBadgeLow");
      case "high":
        return tCard("riskBadgeHigh");
      case "medium":
        return tCard("riskBadgeMedium");
      default:
        return tCard("riskBadgeUnknown");
    }
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
        return { label: tMap("risk.low"), tone: "good" };
      case "high":
        return { label: tMap("risk.high"), tone: "danger" };
      case "medium":
        return { label: tMap("risk.medium"), tone: "warning" };
      default:
        return { label: tMap("risk.unknown"), tone: "warning" };
    }
  }

  function formatDelayLabel(delayMinutes: number | null): string | null {
    if (delayMinutes === null || !Number.isFinite(delayMinutes) || delayMinutes <= 0) {
      return null;
    }

    return tMap("delay", { minutes: formatLocaleInt(Math.max(1, Math.round(delayMinutes))) });
  }

  function formatRouteArrivalLabel(value: string | null): string {
    if (!value) {
      return tMap("arrivalNa");
    }

    return formatDateTimeInPalestine(
      value,
      { dateStyle: "medium", timeStyle: "short" },
      dateIntlLocale,
    );
  }

  function getRouteRiskScoreParen(route: RoutePath): string {
    if (route.riskScore !== null && Number.isFinite(route.riskScore)) {
      return formatRiskScorePercent(route.riskScore);
    }
    if (Number.isFinite(route.routeScore)) {
      return formatRiskScorePercent(route.routeScore);
    }
    return tCommon("notAvailable");
  }

  function getRouteRiskScoreDisplay(route: RoutePath): string {
    if (route.riskScore !== null && Number.isFinite(route.riskScore)) {
      return formatRiskScorePercent(route.riskScore);
    }
    if (Number.isFinite(route.routeScore)) {
      return formatRiskScorePercent(route.routeScore);
    }
    return tCommon("dash");
  }

  function formatDurationLabel(durationMs: number | null): string {
    if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) {
      return tMap("durationNa");
    }

    const totalMinutes = Math.round(durationMs / 60000);
    if (totalMinutes >= 60) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return minutes > 0
        ? tCommon("durationHM", {
            hours: formatLocaleInt(hours),
            minutes: formatLocaleInt(minutes),
          })
        : tCommon("durationH", { hours: formatLocaleInt(hours) });
    }

    return tCommon("durationMin", { minutes: formatLocaleInt(totalMinutes) });
  }

  function buildDurationParts(durationMs: number | null): DurationParts {
    if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) {
      return { kind: "line", text: tMap("durationNa") };
    }

    const totalMinutes = Math.round(durationMs / 60000);
    if (totalMinutes >= 60) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const text =
        minutes > 0
          ? tCommon("durationHM", {
              hours: formatLocaleInt(hours),
              minutes: formatLocaleInt(minutes),
            })
          : tCommon("durationH", { hours: formatLocaleInt(hours) });
      return { kind: "line", text };
    }

    return {
      kind: "split",
      amount: formatLocaleInt(totalMinutes),
      unit: tCard("durationUnitMinutes"),
    };
  }

  function formatRouteDistance(distanceM: number): string {
    if (!Number.isFinite(distanceM) || distanceM <= 0) {
      return tMap("distanceZero");
    }

    if (distanceM >= 1000) {
      const km = distanceM / 1000;
      const rounded = distanceM >= 10000 ? Math.round(km) : Math.round(km * 10) / 10;
      const value =
        Number.isInteger(rounded) || Math.abs(rounded - Math.round(rounded)) < 1e-9
          ? formatLocaleInt(Math.round(rounded))
          : formatLocaleFixed1(rounded);
      return tCommon("unitKm", { value });
    }

    return tCommon("unitM", { value: formatLocaleInt(Math.round(distanceM)) });
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
    const durationSmart = formatDurationLabel(route.smartEtaMs ?? route.durationMs);
    const expectedDelay =
      formatDelayLabel(route.expectedDelayMinutes ?? route.estimatedDelayMinutes) ??
      tCommon("notAvailable");
    const summarySource =
      route.reasonSummary?.trim() ||
      route.riskComponents.map(humanizeRiskComponentLine).join(" · ") ||
      "";
    const summaryAllowed =
      !locale.startsWith("ar") || (summarySource ? hasArabicScript(summarySource) : false);
    const summaryRaw =
      summarySource && summaryAllowed ? truncateLabel(summarySource, 120) : null;
    const summary = summaryRaw ? escapeHtml(summaryRaw) : "";
    const viability = escapeHtml(formatViabilityLabel(route.routeViability));
    const routeMeta = escapeHtml(
      tCard("checkpointsDistance", {
        count: formatLocaleInt(route.checkpointCount),
        distance: formatRouteDistance(route.distanceM),
      }),
    );
    const pressure =
      route.worstPredictedStatus !== "unknown"
        ? escapeHtml(
            tCard("forecastAlongRoute", {
              status: tBucket(route.worstPredictedStatus),
            }),
          )
        : "";
    const riskLine = escapeHtml(
      tPopup("riskWithScore", {
        label: risk.label,
        score: getRouteRiskScoreParen(route),
      }),
    );
    const confidenceLine =
      route.riskConfidence !== null && Number.isFinite(route.riskConfidence)
        ? escapeHtml(
            tCard("modelConfidenceLine", {
              value: formatLocaleInt(Math.round(route.riskConfidence * 100)),
            }),
          )
        : escapeHtml(tCard("modelConfidenceNa"));
    const hoverDir = locale.startsWith("ar") ? "rtl" : "ltr";

    return `
      <div class="mashwar-route-hover-root" dir="${hoverDir}">
        <div class="mashwar-route-hover-sec mashwar-route-hover-sec--route">
          <div class="mashwar-route-hover-k">${escapeHtml(tCard("sectionIdentity"))}</div>
          <div class="mashwar-route-hover-row mashwar-route-hover-row--head">
            <span class="mashwar-route-hover-route-num">${escapeHtml(tPopup("routeNumber", { rank: route.rank }))}</span>
            <span class="mashwar-route-hover-pill">${viability}</span>
          </div>
          <div class="mashwar-route-hover-meta">${routeMeta}</div>
          ${pressure ? `<div class="mashwar-route-hover-meta">${pressure}</div>` : ""}
        </div>
        <div class="mashwar-route-hover-sec mashwar-route-hover-sec--time">
          <div class="mashwar-route-hover-k">${escapeHtml(tCard("sectionTime"))}</div>
          <div class="mashwar-route-hover-eta">${escapeHtml(durationSmart)}</div>
          <div class="mashwar-route-hover-sub">${escapeHtml(tCard("smartDurationCaption"))} · ${escapeHtml(smartEtaLabel)}</div>
          <div class="mashwar-route-hover-delay"><span class="mashwar-route-hover-dim">${escapeHtml(tPopup("expectedDelay"))}</span> <strong>${escapeHtml(expectedDelay)}</strong></div>
        </div>
        <div class="mashwar-route-hover-sec mashwar-route-hover-sec--risk">
          <div class="mashwar-route-hover-k">${escapeHtml(tCard("sectionRisk"))}</div>
          <div class="mashwar-route-hover-riskline">${riskLine}</div>
          <div class="mashwar-route-hover-confidence">${confidenceLine}</div>
          ${summary ? `<p class="mashwar-route-hover-summary" dir="auto">${summary}</p>` : ""}
        </div>
      </div>
    `;
  }

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
        const viewportFactor = clamp((Math.min(width, height) - 300) / 920, 0, 1);
        const zoomNorm = clamp((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM), 0, 1);
        const mapScale = clamp(
          0.56 + zoomNorm * 0.42 + viewportFactor * 0.14,
          0.54,
          1.06,
        );
        const offsetDistance = 10 + mapScale * 10;
        const opacity = clamp(0.76 + zoomNorm * 0.2, 0.76, 0.97);
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
            const routeScale = isSelectedRoute ? mapScale : mapScale * 0.9;
            const labelBaseWidth = isSelectedRoute
              ? Math.round(280 + mapScale * 32)
              : Math.round(168 + mapScale * 18);
            const labelBaseHeight = isSelectedRoute
              ? Math.round(168 + mapScale * 26)
              : Math.round(46 + mapScale * 8);
            const summaryLabel = isSelectedRoute ? buildRouteCardSummary(route) : null;
            const checkpointLabel = isSelectedRoute
              ? tCard("checkpointsDistance", {
                  count: formatLocaleInt(route.checkpointCount),
                  distance: formatRouteDistance(route.distanceM),
                })
              : tCard("distanceOnly", { distance: formatRouteDistance(route.distanceM) });

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
                  baseWidth: labelBaseWidth,
                  baseHeight: labelBaseHeight,
                  durationParts: buildDurationParts(route.smartEtaMs ?? route.durationMs),
                  arrivalLabel,
                  delayLabel: formatDelayLabel(
                    route.expectedDelayMinutes ?? route.estimatedDelayMinutes,
                  ),
                  riskBadgeLabel: getRouteRiskBadgeLabel(route),
                  riskTone: risk.tone,
                  riskScoreDisplay: getRouteRiskScoreDisplay(route),
                  confidenceLineLabel:
                    route.riskConfidence !== null && Number.isFinite(route.riskConfidence)
                      ? tCard("modelConfidenceLine", {
                          value: formatLocaleInt(Math.round(route.riskConfidence * 100)),
                        })
                      : tCard("modelConfidenceNa"),
                  viabilityLabel: formatViabilityLabel(route.routeViability),
                  pressureStatusText:
                    route.worstPredictedStatus !== "unknown"
                      ? tBucket(route.worstPredictedStatus)
                      : null,
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
                baseWidth: labelBaseWidth,
                baseHeight: labelBaseHeight,
                durationParts: buildDurationParts(route.smartEtaMs ?? route.durationMs),
                arrivalLabel,
                delayLabel: formatDelayLabel(
                  route.expectedDelayMinutes ?? route.estimatedDelayMinutes,
                ),
                riskBadgeLabel: getRouteRiskBadgeLabel(route),
                riskTone: risk.tone,
                riskScoreDisplay: getRouteRiskScoreDisplay(route),
                confidenceLineLabel:
                  route.riskConfidence !== null && Number.isFinite(route.riskConfidence)
                    ? tCard("modelConfidenceLine", {
                        value: formatLocaleInt(Math.round(route.riskConfidence * 100)),
                      })
                    : tCard("modelConfidenceNa"),
                viabilityLabel: formatViabilityLabel(route.routeViability),
                pressureStatusText:
                  route.worstPredictedStatus !== "unknown"
                    ? tBucket(route.worstPredictedStatus)
                    : null,
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
  }, [
    mapLoaded,
    routePaths,
    routes.selectedRouteId,
    locale,
    tMap,
    tCard,
    tCommon,
    tBucket,
    formatViabilityLabel,
    buildRouteCardSummary,
  ]);

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
      dot.style.backgroundColor = role === "from" ? "#22c55e" : "#ef4444";

      const label = document.createElement("div");
      label.textContent = role === "from" ? tMarker("from") : tMarker("to");
      label.style.padding = "3px 8px";
      label.style.borderRadius = "9999px";
      label.style.backgroundColor = "#ffffff";
      label.style.border = `1px solid ${role === "from" ? "#bbf7d0" : "#fecaca"}`;
      label.style.color = role === "from" ? "#15803d" : "#b91c1c";
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
  }, [mapLoaded, routeEndpoints, locale, tMarker]);

  function closeRoutePopup(): void {
    routePopupRef.current?.remove();
    routePopupRef.current = null;
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
      HEATMAP_CORRIDOR_SOURCE_ID,
    ) as GeoJSONSource | undefined;
    const beforeLayerId = map.getLayer(CHECKPOINT_CLUSTER_LAYER_ID)
      ? CHECKPOINT_CLUSTER_LAYER_ID
      : undefined;

    if (!existingSource) {
      map.addSource(HEATMAP_CORRIDOR_SOURCE_ID, {
        type: "geojson",
        data: heatmapSegments,
      });

      map.addLayer(
        {
          id: HEATMAP_CORRIDOR_GLOW_LAYER_ID,
          type: "line",
          source: HEATMAP_CORRIDOR_SOURCE_ID,
          layout: {
            visibility: heatmapEnabled ? "visible" : "none",
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": HEATMAP_COLOR_EXPRESSION as any,
            "line-width": HEATMAP_GLOW_WIDTH_EXPRESSION as any,
            "line-opacity": 0.3,
            "line-blur": 4,
          },
        },
        beforeLayerId,
      );

      map.addLayer(
        {
          id: HEATMAP_CORRIDOR_MAIN_LAYER_ID,
          type: "line",
          source: HEATMAP_CORRIDOR_SOURCE_ID,
          layout: {
            visibility: heatmapEnabled ? "visible" : "none",
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": HEATMAP_COLOR_EXPRESSION as any,
            "line-width": HEATMAP_MAIN_WIDTH_EXPRESSION as any,
            "line-opacity": 0.9,
          },
        },
        beforeLayerId,
      );

      return;
    }

    existingSource.setData(heatmapSegments);

    if (map.getLayer(HEATMAP_CORRIDOR_GLOW_LAYER_ID)) {
      map.setLayoutProperty(
        HEATMAP_CORRIDOR_GLOW_LAYER_ID,
        "visibility",
        heatmapEnabled ? "visible" : "none",
      );
    }

    if (map.getLayer(HEATMAP_CORRIDOR_MAIN_LAYER_ID)) {
      map.setLayoutProperty(
        HEATMAP_CORRIDOR_MAIN_LAYER_ID,
        "visibility",
        heatmapEnabled ? "visible" : "none",
      );
    }
  }, [heatmapEnabled, heatmapSegments, mapLoaded]);

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
    if (!mapRef.current || !mapLoaded || !focusTarget) {
      return;
    }

    mapRef.current.easeTo({
      center: [focusTarget.lng, focusTarget.lat],
      zoom: focusTarget.zoom ?? 14,
      duration: 750,
    });
  }, [focusTarget, mapLoaded]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) {
      return;
    }

    const map = mapRef.current;
    map.getCanvas().style.cursor = placementMode ? MASHWAR_PLACEMENT_CURSOR : "";

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
      map.getCanvas().style.cursor = placementMode ? MASHWAR_PLACEMENT_CURSOR : "pointer";
    };

    const handlePointerLeave = () => {
      map.getCanvas().style.cursor = placementMode ? MASHWAR_PLACEMENT_CURSOR : "";
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
      routeGeometryFingerprintRef.current = "";
      return;
    }

    const geometryFingerprint = routePaths
      .map((route) => `${route.routeId}:${route.geometry.coordinates.length}`)
      .join("|");
    const geometryChanged =
      routeGeometryFingerprintRef.current !== geometryFingerprint;
    routeGeometryFingerprintRef.current = geometryFingerprint;

    const selectedRouteId =
      routes.selectedRouteId ?? routePaths[0]?.routeId ?? null;
    // Palette index must follow list order, not a Map keyed by routeId — duplicate
    // route_id values from the API would collapse to one slot and paint both lines the same color.
    const pathsWithPaletteIndex = routePaths.map((route, routeIndex) => ({
      route,
      routeIndex,
    }));
    const orderedRoutes = [
      ...pathsWithPaletteIndex.filter(
        ({ route }) => route.routeId !== selectedRouteId,
      ),
      ...pathsWithPaletteIndex.filter(
        ({ route }) => route.routeId === selectedRouteId,
      ),
    ].slice(0, ROUTE_LAYER_IDS.length);

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
          "line-opacity": 0.92,
          "line-blur": style.outlineBlur,
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

    if (!geometryChanged) {
      return;
    }

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
      if (placementMode) {
        map.getCanvas().style.cursor = MASHWAR_PLACEMENT_CURSOR;
        return;
      }

      if (!route) {
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
      map.getCanvas().style.cursor = placementMode ? MASHWAR_PLACEMENT_CURSOR : "";
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
    locale,
    onMapPlacement,
    onRouteOpen,
    onRouteSelect,
    placementMode,
    routeLayerBindings,
    tCommon,
    tMap,
    tPopup,
    tCard,
    formatViabilityLabel,
    tBucket,
    humanizeRiskComponentLine,
  ]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />

      {routeLabelItems.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-20">
          {routeLabelItems.map((item, index) => {
            const toneStyles = getRouteToneStyles(item.riskTone);
            const cardBackground = item.isSelected ? "#fffdfb" : "#ffffff";
            const cardShadow = item.isSelected
              ? "0 1px 0 rgba(15,23,42,0.06), 0 4px 12px rgba(15,23,42,0.1), 0 12px 24px rgba(15,23,42,0.08)"
              : "0 1px 0 rgba(15,23,42,0.05), 0 3px 10px rgba(15,23,42,0.08)";
            const routeMetaColor = item.isSelected ? "#64748b" : "#7c8798";

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
                  className="relative overflow-hidden rounded-2xl border border-slate-200 text-slate-950 antialiased transition-opacity duration-150 ease-out"
                  style={{
                    width: item.baseWidth,
                    minHeight: item.baseHeight,
                    borderColor: item.isSelected ? item.accentColor : `${item.accentColor}99`,
                    background: cardBackground,
                    boxShadow: cardShadow,
                    transform: `scale(${item.scale}) translateZ(0)`,
                    transformOrigin: "center bottom",
                  }}
                >
                  {item.isSelected ? (
                    <div
                      className="relative divide-y divide-slate-200/95"
                      dir={locale.startsWith("ar") ? "rtl" : "ltr"}
                    >
                      <div
                        className="absolute inset-y-0 start-0 w-1.5 rounded-s-2xl"
                        style={{ backgroundColor: item.accentColor }}
                      />
                      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(148,163,184,0.35),transparent)]" />

                      <div className="relative px-4 pb-4 pt-4 ps-[18px]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {tCard("sectionIdentity")}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/90"
                              style={{ backgroundColor: item.accentColor }}
                            />
                            <p className="min-w-0 text-[18px] font-semibold leading-tight tracking-tight text-slate-950">
                              {tCard("routeNumber", { rank: item.rank })}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-lg border border-slate-200/90 bg-slate-50 px-3.5 py-1.5 text-[12px] font-semibold leading-none text-slate-800">
                            {item.viabilityLabel}
                          </span>
                        </div>

                        <p className="mt-4 text-[11.5px] font-semibold leading-snug text-slate-600">
                          {tCard("metaCheckpointsTitle")}
                        </p>
                        <p className="mt-1 text-[15px] font-semibold leading-snug text-slate-800">
                          {item.checkpointLabel}
                        </p>

                        {item.pressureStatusText ? (
                          <div className="mt-4">
                            <p className="text-[11.5px] font-semibold leading-snug text-slate-600">
                              {tCard("metaForecastTitle")}
                            </p>
                            <p className="mt-1 text-[14px] font-semibold leading-snug text-slate-800">
                              {item.pressureStatusText}
                            </p>
                          </div>
                        ) : null}
                      </div>

                      <div className="relative space-y-3 px-4 py-4 ps-[18px]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {tCard("sectionTime")}
                        </p>
                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                          {item.durationParts.kind === "split" ? (
                            <div className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
                              <span className="text-[40px] font-semibold tracking-tight text-slate-950 [font-variant-numeric:lining-nums]">
                                {item.durationParts.amount}
                              </span>
                              <span className="pb-1 text-[15px] font-semibold text-slate-700">
                                {item.durationParts.unit}
                              </span>
                            </div>
                          ) : (
                            <p className="min-w-0 text-[26px] font-semibold leading-snug tracking-tight text-slate-950 [font-variant-numeric:lining-nums]">
                              {item.durationParts.text}
                            </p>
                          )}
                          <div className="flex min-w-0 max-w-full flex-col gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 sm:max-w-[min(280px,56%)] sm:items-end sm:text-end">
                            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                              {tCard("smartDurationCaption")}
                            </span>
                            <span
                              className="text-[14px] font-semibold leading-snug text-emerald-900 [font-variant-numeric:lining-nums]"
                              dir="auto"
                            >
                              {item.arrivalLabel}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-slate-50/95 px-3.5 py-3">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            {tCard("delay")}
                          </span>
                          <span
                            className="text-[15px] font-semibold tracking-tight text-slate-900 [font-variant-numeric:lining-nums]"
                            style={{ color: item.delayLabel ? item.accentColor : "#475569" }}
                          >
                            {item.delayLabel ?? tCard("clear")}
                          </span>
                        </div>
                      </div>

                      <div className="relative space-y-3 px-4 pb-4 pt-4 ps-[18px]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {tCard("sectionRisk")}
                        </p>
                        <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3.5 py-3">
                          <p className="text-[11px] font-semibold leading-none text-slate-500">
                            {tCard("riskScoreTitle")}
                          </p>
                          <span
                            className="text-[32px] font-semibold leading-none tracking-tight text-slate-950 [font-variant-numeric:lining-nums] sm:text-[34px]"
                            dir="ltr"
                            style={{ unicodeBidi: "isolate" }}
                          >
                            {item.riskScoreDisplay}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3.5 py-3">
                          <p className="text-[11px] font-semibold leading-none text-slate-500">
                            {tCard("riskLevelTitle")}
                          </p>
                          <span
                            className="w-fit shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold leading-snug"
                            style={{
                              color: toneStyles.text,
                              backgroundColor: toneStyles.background,
                              borderColor: toneStyles.border,
                            }}
                          >
                            {item.riskBadgeLabel}
                          </span>
                        </div>
                        <p className="rounded-xl border border-slate-200/90 bg-slate-50/80 px-3.5 py-2.5 text-[13px] font-medium leading-snug text-slate-700">
                          {item.confidenceLineLabel}
                        </p>
                        {item.summaryLabel ? (
                          <p
                            className="line-clamp-3 text-[12.5px] font-medium leading-relaxed text-slate-700"
                            dir="auto"
                          >
                            {item.summaryLabel}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex items-center gap-2.5 px-3 py-2.5 ps-[14px]">
                      <div
                        className="absolute inset-y-0 start-0 w-1 rounded-s-xl"
                        style={{ backgroundColor: item.accentColor }}
                      />
                      <span
                        className="h-2 w-2 shrink-0 rounded-full ring-2 ring-white/90"
                        style={{ backgroundColor: item.accentColor }}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-[9px] font-bold uppercase tracking-[0.14em]"
                          style={{ color: routeMetaColor }}
                        >
                          {tCard("routeNumber", { rank: item.rank })}
                        </p>
                        <div className="mt-1 flex min-w-0 items-baseline gap-2">
                          <span className="inline-flex shrink-0 items-baseline gap-1 text-[19px] font-semibold leading-none tracking-tight text-slate-950 [font-variant-numeric:lining-nums]">
                            {item.durationParts.kind === "split" ? (
                              <>
                                <span>{item.durationParts.amount}</span>
                                <span className="text-[11px] font-semibold text-slate-600">
                                  {item.durationParts.unit}
                                </span>
                              </>
                            ) : (
                              <span className="truncate">{item.durationParts.text}</span>
                            )}
                          </span>
                          <span className="min-w-0 truncate text-[10px] font-semibold text-slate-600">
                            {item.riskBadgeLabel}
                          </span>
                        </div>
                      </div>
                      <p className="shrink-0 max-w-[44%] truncate text-end text-[11px] font-semibold text-slate-800 [font-variant-numeric:lining-nums]">
                        {item.checkpointLabel}
                      </p>
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
