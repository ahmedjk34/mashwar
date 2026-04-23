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
  getMapTileUrlTemplate,
  MAX_ZOOM,
  MIN_ZOOM,
  PALESTINE_BOUNDS,
  PALESTINE_CENTER,
  ROUTE_ALT_1_LAYER_ID,
  ROUTE_ALT_1_SOURCE_ID,
  ROUTE_ALT_2_LAYER_ID,
  ROUTE_ALT_2_SOURCE_ID,
  ROUTE_MAIN_LAYER_ID,
  ROUTE_MAIN_SOURCE_ID,
  ROUTE_STYLE,
  TILE_LAYER_ID,
  TILE_SOURCE_ID,
  transformRouteToGeoJSON,
  UNCLUSTERED_RADIUS_EXPRESSION,
} from "@/lib/config/map";
import type {
  MapCheckpoint,
  NormalizedRoutes,
} from "@/lib/types/map";

interface MapViewProps {
  checkpoints: MapCheckpoint[];
  routes: NormalizedRoutes;
  onCheckpointSelect?: (checkpoint: MapCheckpoint | null) => void;
}

type MapLibreModule = typeof import("maplibre-gl");

function cleanupRouteLayers(map: MapLibreMap): void {
  const layerIds = [
    ROUTE_MAIN_LAYER_ID,
    ROUTE_ALT_1_LAYER_ID,
    ROUTE_ALT_2_LAYER_ID,
  ];
  const sourceIds = [
    ROUTE_MAIN_SOURCE_ID,
    ROUTE_ALT_1_SOURCE_ID,
    ROUTE_ALT_2_SOURCE_ID,
  ];

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
}

export default function MapView({
  checkpoints,
  routes,
  onCheckpointSelect,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const checkpointsById = useMemo(() => {
    return new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  }, [checkpoints]);

  const checkpointFeatureCollection = useMemo(() => {
    return buildCheckpointFeatureCollection(checkpoints);
  }, [checkpoints]);

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

    const handleClusterClick = async (event: any) => {
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
  }, [checkpointsById, mapLoaded, onCheckpointSelect]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !onCheckpointSelect) {
      return;
    }

    const map = mapRef.current;

    const handleBackgroundClick = (event: any) => {
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
  }, [mapLoaded, onCheckpointSelect]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) {
      return;
    }

    const map = mapRef.current;
    cleanupRouteLayers(map);

    if (!routes.mainRoute && routes.alternativeRoutes.length === 0) {
      return;
    }

    if (routes.mainRoute) {
      map.addSource(ROUTE_MAIN_SOURCE_ID, {
        type: "geojson",
        data: transformRouteToGeoJSON(routes.mainRoute),
      });

      map.addLayer({
        id: ROUTE_MAIN_LAYER_ID,
        type: "line",
        source: ROUTE_MAIN_SOURCE_ID,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": ROUTE_STYLE.MAIN_COLOR,
          "line-width": ROUTE_STYLE.MAIN_WIDTH,
          "line-opacity": ROUTE_STYLE.MAIN_OPACITY,
        },
      });
    }

    routes.alternativeRoutes.forEach((route, index) => {
      if (index >= 2) {
        return;
      }

      const sourceId = index === 0 ? ROUTE_ALT_1_SOURCE_ID : ROUTE_ALT_2_SOURCE_ID;
      const layerId = index === 0 ? ROUTE_ALT_1_LAYER_ID : ROUTE_ALT_2_LAYER_ID;

      map.addSource(sourceId, {
        type: "geojson",
        data: transformRouteToGeoJSON(route),
      });

      const layerConfig = {
        id: layerId,
        type: "line" as const,
        source: sourceId,
        layout: {
          "line-join": "round" as const,
          "line-cap": "round" as const,
        },
        paint: {
          "line-color": ROUTE_STYLE.ALT_COLOR,
          "line-width": ROUTE_STYLE.ALT_WIDTH,
          "line-opacity": ROUTE_STYLE.ALT_OPACITY,
        },
      };

      if (routes.mainRoute) {
        map.addLayer(layerConfig, ROUTE_MAIN_LAYER_ID);
      } else {
        map.addLayer(layerConfig);
      }
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
  }, [mapLoaded, routes]);

  return <div ref={containerRef} className="h-full w-full" />;
}
