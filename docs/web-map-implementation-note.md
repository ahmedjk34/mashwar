# Web Map Implementation Note

This document captures the React Native reference behavior preserved in the Next.js web base.

## Reference Files Used

- `react-native-inspo/utils/checkpointMapStyle.ts`
- `react-native-inspo/components/map/MapView.web.tsx`
- `react-native-inspo/components/map/MapView.tsx`
- `react-native-inspo/hooks/useMapCheckpointCoordinates.ts`
- `react-native-inspo/utils/mapUtils.ts`
- `react-native-inspo/docs/maps-backend-api.md`
- `react-native-inspo/docs/maps-integration-guide.md`
- `API_GUIDE.md`

## Data Shapes Preserved

- Checkpoint map coordinates are normalized to GeoJSON-friendly `[lng, lat]`.
- Backend checkpoint integration now follows `API_GUIDE.md`:
  - `GET /checkpoints/current-status`
  - success envelope `{ success: true, data: [...] }`
  - checkpoint rows include `checkpoint`, `city`, `entering_status`, `leaving_status`, `alert_text`, `latitude`, `longitude`
- Routing requests use:
  - `startPoint: { lat, lng }`
  - `endPoint: { lat, lng }`
- Routing responses are normalized into:
  - `mainRoute`
  - `alternativeRoutes`
- Each route keeps `points.coordinates` as a GeoJSON `LineString` coordinate array in `[lng, lat]` order.
- Checkpoint feature properties stay map-driven:
  - `checkpointId`
  - `checkpointName`
  - `markerColor`
  - `markerBorderColor`
  - `worstStatus`

## Mapping Rules Preserved

- Map library: MapLibre.
- Raster tile template: `http://164.68.121.28/tiles/{z}/{x}/{y}.png` unless overridden by env.
- Palestine-focused defaults:
  - center: `[35.1, 31.4]`
  - zoom: `8`
  - min zoom: `5`
  - max zoom: `16`
  - max bounds: `[[33.9, 29.2], [36.3, 33.6]]`
- Checkpoints render as clustered GeoJSON circles, not DOM markers.
- Cluster settings preserved:
  - `clusterRadius: 60`
  - `clusterMaxZoom: 13`
- Route styling preserved:
  - main route: `#3b82f6`, width `6`, opacity `0.9`
  - alternatives: `#6b7280`, width `3`, opacity `0.5`
- Route camera fitting preserves the RN 5% padding strategy and `fitBounds` padding of `50`.

## Status Semantics Preserved

- Priority order:
  - `مغلق`
  - `أزمة خانقة`
  - `أزمة متوسطة`
  - `سالك`
  - `غير معروف`
- Web keeps the RN color model:
  - `سالك` -> green
  - `أزمة متوسطة` -> yellow
  - `أزمة خانقة` -> orange
  - `مغلق` -> red
  - `غير معروف` -> gray

## Notes

- `react-native-inspo` is treated as reference-only.
- The RN folder currently contains stale doc pointers and merge-conflict markers, so the web implementation trusts the concrete map utilities and map components first, then uses docs only where source files are missing.
- The web checkpoint service now uses the backend contract in `API_GUIDE.md` as the source of truth for current checkpoint status data.
