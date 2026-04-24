# Mashwar Backend API Guide

This is the frontend-facing contract for the Mashwar backend.

It documents:

- every route currently exposed by the backend
- request method, path, and body/query requirements
- response shapes and status codes
- error cases and how the frontend should handle them
- the prediction model contract
- how to run the backend locally

The backend is a FastAPI app and currently supports:

- live checkpoint lookups from Supabase
- single checkpoint status lookup
- single checkpoint status prediction
- checkpoint forecast timelines for fixed horizons
- simple routing via GraphHopper
- heatmap corridor network caching and SSE streaming

---

## Base Information

### Framework

- FastAPI

### CORS

The backend currently allows browser requests from any origin.

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: *`
- `Access-Control-Allow-Headers: *`

### Local Base URL

```text
http://127.0.0.1:8000
```

### Response Envelope

Success responses use this shape:

```json
{
  "success": true,
  "data": {}
}
```

Error responses use this shape:

```json
{
  "success": false,
  "error": "Message"
}
```

Validation errors include extra detail:

```json
{
  "success": false,
  "error": "Validation failed",
  "details": []
}
```

The frontend should support all three shapes.

Important:

- `GET /heatmap` is intentionally a raw response and does not use the success envelope
- `GET /heatmap/stream` is an SSE stream and sends raw event payloads

---

## Authentication

There is currently no frontend authentication required for the read-only routes documented here.

The backend talks to Supabase using a server-side admin client, not a browser key.

---

## Supabase Configuration

The backend reads environment variables from `API/.env`.

Required variables:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_PUBLISHABLE_KEY`

Supported alias for the backend secret:

- `SUPABASE_SERVICE_ROLE_KEY`

Important:

- the backend uses `SUPABASE_SECRET_KEY` for Supabase queries
- if `SUPABASE_SECRET_KEY` is not present, it falls back to `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLISHABLE_KEY` is kept for future frontend use, but it is not used for these backend database queries

If Supabase is unreachable or misconfigured, the frontend should expect:

- `503 Service Unavailable` for missing server config
- `502 Bad Gateway` for connection/query failures

---

## GraphHopper Configuration

The backend reads routing configuration from:

- `GRAPHHOPPER_BASE_URL`
- `GRAPHHOPPER_API_KEY` optional
- `GRAPHHOPPER_TIMEOUT_SECONDS`

Important:

- the deployed Mashwar setup can use a self-hosted GraphHopper server on your own VPS
- in self-hosted mode, `GRAPHHOPPER_API_KEY` is optional and no key is sent unless explicitly configured
- hosted GraphHopper setups can still provide `GRAPHHOPPER_API_KEY`

---

## Route Summary

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Simple app liveness message |
| `GET` | `/health` | Health probe |
| `GET` | `/checkpoints/current-status` | List current checkpoint rows |
| `GET` | `/checkpoints/{checkpoint_id}` | Fetch one checkpoint row |
| `POST` | `/checkpoints/{checkpoint_id}/predict` | Predict a single checkpoint status at a target datetime |
| `GET` | `/checkpoints/{checkpoint_id}/forecast` | Return current checkpoint status plus future prediction horizons |
| `GET` | `/heatmap` | Return cached heatmap corridor GeoJSON when available |
| `GET` | `/heatmap/stream` | Stream cached or newly built heatmap corridors over SSE |
| `POST` | `/api/routing` | Return a simple car route between two points |
| `POST` | `/api/routing/v2` | Return checkpoint-aware alternative routes with reranking metadata |

---

## 1. `GET /`

### Purpose

Basic liveness check for the app process.

### Request

- no body
- no query params

### Response

```json
{
  "message": "Mashwar API is running"
}
```

### Status Code

- `200 OK`

### Frontend Notes

- use for smoke checks only
- do not treat this as a business endpoint

---

## 2. `GET /health`

### Purpose

Health probe for uptime and deployment checks.

### Request

- no body
- no query params

### Response

```json
{
  "status": "ok"
}
```

### Status Code

- `200 OK`

### Frontend Notes

- use for readiness or uptime checks
- if this fails, the app process is unhealthy or unreachable

---

## Heatmap Endpoints

### `GET /heatmap`

Purpose:

- return the cached heatmap corridor GeoJSON if it already exists
- otherwise tell the client to use `GET /heatmap/stream`

Cache validity:

- file path: `API/data/heatmap/corridors.geojson`
- must parse as JSON
- must be a GeoJSON `FeatureCollection`
- must contain a non-empty `features` array

Cached response:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "12-45",
        "from_checkpoint_id": 12,
        "to_checkpoint_id": 45,
        "from_checkpoint_name": "حوارة",
        "to_checkpoint_name": "زعترة",
        "distance_m": 8200
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [[35.2, 32.1], [35.21, 32.11]]
      }
    }
  ]
}
```

Cache-miss response:

```json
{
  "cached": false,
  "message": "Heatmap network cache not found. Use /heatmap/stream to build and stream it."
}
```

Notes:

- this route intentionally returns a raw payload, not the standard success envelope
- geometry is static only; no checkpoint uncertainty coloring is returned here

### `GET /heatmap/stream`

Purpose:

- stream cached corridors immediately when the cache already exists
- or build the corridor network, stream progress in real time, and persist the final cache

Media type:

- `text/event-stream`

Headers:

- `Cache-Control: no-cache`
- `Connection: keep-alive`
- `X-Accel-Buffering: no`

SSE format:

```text
data: {json}

```

Cache and resume files:

- final cache: `API/data/heatmap/corridors.geojson`
- resumable state: `API/data/heatmap/build_state.json`

Build behavior:

- checkpoint source: `src/data/checkpoints.json`
- connect each checkpoint to its closest `HEATMAP_NEIGHBOR_COUNT` neighbors
- deduplicate pairs using sorted pair ids like `12-45`
- route pairs through GraphHopper with bounded concurrency
- retry upstream failures up to `HEATMAP_RETRY_COUNT`
- skip routes whose routed distance exceeds `straight_line_distance * HEATMAP_MAX_ROUTE_STRETCH`
- update `build_state.json` after every built, skipped, or failed pair
- resume from `build_state.json` if the process was interrupted before final GeoJSON write

Supported event types:

- `start`
- `route_built`
- `route_skipped`
- `route_failed`
- `progress`
- `done`
- `error`

Event shape notes:

- `start` includes `cached: true` when replaying cache and `cached: false` when building
- `completed` counts all terminal pairs: built, skipped, and failed
- `percentage` is `completed / total * 100`
- `route_built.corridor.geometry.coordinates` are GeoJSON `[lng, lat]`

Environment variables used by the heatmap builder:

- `GRAPHHOPPER_BASE_URL`
- `GRAPHHOPPER_API_KEY` optional
- `GRAPHHOPPER_TIMEOUT_SECONDS`
- `HEATMAP_NEIGHBOR_COUNT`
- `HEATMAP_BUILD_CONCURRENCY`
- `HEATMAP_MAX_ROUTE_STRETCH`
- `HEATMAP_RETRY_COUNT`

Self-hosted GraphHopper note:

- when using your own VPS GraphHopper server, `GRAPHHOPPER_API_KEY` is optional
- the backend only forwards a `key` query parameter when the env var is explicitly set

---

## 3. `GET /checkpoints/current-status`

### Purpose

Return all current checkpoint rows from Supabase.

This is the list endpoint for the live checkpoint table.

### Request

- method: `GET`
- no body
- no query params

### Supabase Table

- `checkpoints`

### Selected Columns

The backend returns only these columns:

- `id`
- `checkpoint`
- `city`
- `entering_status`
- `leaving_status`
- `entering_status_last_updated`
- `leaving_status_last_updated`
- `alert_text`
- `latitude`
- `longitude`

### Success Response

```json
{
  "success": true,
  "data": [
    {
      "id": 359,
      "checkpoint": "مسافر يطّا والبادية",
      "city": "الخليل",
      "entering_status": "سالك",
      "leaving_status": "سالك",
      "entering_status_last_updated": "2026-04-22T19:24:51",
      "leaving_status_last_updated": "2026-04-22T19:24:51",
      "alert_text": null,
      "latitude": null,
      "longitude": null
    }
  ]
}
```

### `status_type=both` Success Response

```json
{
  "success": true,
  "data": {
    "checkpoint": {
      "id": 359,
      "checkpoint": "مسافر يطّا والبادية",
      "city": "الخليل",
      "entering_status": "سالك",
      "leaving_status": "سالك",
      "entering_status_last_updated": "2026-04-22T19:24:51",
      "leaving_status_last_updated": "2026-04-22T19:24:51",
      "alert_text": null,
      "latitude": null,
      "longitude": null
    },
    "request": {
      "checkpoint_id": 359,
      "status_type": "both",
      "as_of": "2026-04-23T08:00:00Z"
    },
    "predictions": {
      "entering": [
        {
          "horizon": "plus_30m",
          "target_datetime": "2026-04-23T08:30:00Z",
          "prediction": {
            "target_datetime": "2026-04-23T08:30:00Z",
            "status_type": "entering",
            "predicted_status": "سالك",
            "confidence": 0.6801,
            "class_probabilities": {
              "سالك": 0.6801,
              "أزمة": 0.2022,
              "مغلق": 0.1177
            }
          }
        }
      ],
      "leaving": [
        {
          "horizon": "plus_30m",
          "target_datetime": "2026-04-23T08:30:00Z",
          "prediction": {
            "target_datetime": "2026-04-23T08:30:00Z",
            "status_type": "leaving",
            "predicted_status": "سالك",
            "confidence": 0.6123,
            "class_probabilities": {
              "سالك": 0.6123,
              "أزمة": 0.2451,
              "مغلق": 0.1426
            }
          }
        }
      ]
    }
  }
}
```

### Status Codes

- `200 OK`
- `502 Bad Gateway` if Supabase query/connection fails
- `503 Service Unavailable` if backend Supabase config is missing

### Empty Data

If the table returns no rows:

```json
{
  "success": true,
  "data": []
}
```

Frontend handling:

- render an empty state
- do not treat it as an error

### Frontend Notes

- `checkpoint` is the display name
- `city` can be shown as the region/location
- `alert_text` is optional and may be `null`
- `latitude` and `longitude` are optional and may be `null`
- timestamps may be displayed as freshness metadata if needed

---

## 4. `GET /checkpoints/{checkpoint_id}`

### Purpose

Fetch one checkpoint row from Supabase by numeric checkpoint ID.

### Request

- method: `GET`
- path param:
  - `checkpoint_id` integer

### Example

```text
GET /checkpoints/359
```

### Response

```json
{
  "success": true,
  "data": {
    "id": 359,
    "checkpoint": "مسافر يطّا والبادية",
    "city": "الخليل",
    "entering_status": "سالك",
    "leaving_status": "سالك",
    "entering_status_last_updated": "2026-04-22T19:24:51",
    "leaving_status_last_updated": "2026-04-22T19:24:51",
    "alert_text": null,
    "latitude": null,
    "longitude": null
  }
}
```

### Status Codes

- `200 OK`
- `404 Not Found` if the checkpoint ID does not exist in Supabase
- `502 Bad Gateway` if the Supabase query/connection fails
- `503 Service Unavailable` if backend Supabase config is missing

### Frontend Handling

- if `200`, render the checkpoint details
- if `404`, show a checkpoint-not-found state
- if `502`, show a generic backend/Supabase failure state and allow retry
- if `503`, show a service-unavailable state and avoid aggressive retry loops

---

## 5. `POST /checkpoints/{checkpoint_id}/predict`

### Purpose

Predict the status of a single checkpoint at an exact future datetime.

This is the direct model inference endpoint.

### Request

- method: `POST`
- path param:
  - `checkpoint_id` integer
- body:

```json
{
  "target_datetime": "2026-04-23T08:00:00Z",
  "status_type": "entering"
}
```

### Body Fields

- `target_datetime`
  - required
  - ISO 8601 datetime
  - timezone-aware is preferred
- `status_type`
  - required
  - canonical values: `entering` or `leaving`

### Why `target_datetime` Is Required

The Level 2 model uses time-derived features including:

- hour
- day of week
- month

So the API uses exact datetime input rather than hour/day only.

### Prediction Contract

The backend normalizes the timestamp to UTC and derives:

- hour
- weekday
- month

The canonical weekday names used by the model are:

- `Mon`
- `Tue`
- `Wed`
- `Thu`
- `Fri`
- `Sat`
- `Sun`

The frontend does not need to send weekday names. The backend derives them from `target_datetime`.

### Startup and Caching

The backend loads the Level 2 artifact bundle on server startup and keeps it cached in memory.

That means:

- the first prediction request does not pay the model-load cost
- repeated prediction requests reuse the same in-memory bundle
- if the artifacts cannot be loaded at startup, the server fails fast instead of serving a half-working prediction API

### Parallel Execution

Prediction work is parallelized for speed:

- the single-checkpoint prediction route looks up the checkpoint row and runs inference concurrently
- the forecast route looks up the checkpoint row and computes all forecast horizons concurrently

This is an implementation detail, but it affects latency expectations on the frontend.

### Success Response

```json
{
  "success": true,
  "data": {
    "checkpoint": {
      "id": 359,
      "checkpoint": "مسافر يطّا والبادية",
      "city": "الخليل",
      "entering_status": "سالك",
      "leaving_status": "سالك",
      "entering_status_last_updated": "2026-04-22T19:24:51",
      "leaving_status_last_updated": "2026-04-22T19:24:51",
      "alert_text": null,
      "latitude": null,
      "longitude": null
    },
    "request": {
      "checkpoint_id": 359,
      "target_datetime": "2026-04-23T08:00:00Z",
      "status_type": "entering"
    },
    "prediction": {
      "target_datetime": "2026-04-23T08:00:00Z",
      "status_type": "entering",
      "predicted_status": "سالك",
      "confidence": 0.6969,
      "class_probabilities": {
        "سالك": 0.6969,
        "أزمة": 0.1911,
        "مغلق": 0.1120
      }
    }
  }
}
```

### Status Codes

- `200 OK`
- `404 Not Found` if the checkpoint does not exist
- `422 Unprocessable Entity` if the body is invalid
- `502 Bad Gateway` if inference or backend lookup fails unexpectedly
- `503 Service Unavailable` if Supabase config is missing or prediction artifacts are unavailable

### Validation Failure Example

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "loc": ["body", "target_datetime"],
      "msg": "Field required",
      "type": "missing"
    }
  ]
}
```

### Frontend Handling

- if `200`, use `prediction.predicted_status` as the primary forecast
- use `confidence` as the reliability indicator
- use `class_probabilities` if the UI wants a distribution bar or debug panel
- if `404`, show checkpoint-not-found
- if `422`, surface a form/input validation error
- if `502`, show a generic backend/model failure state
- if `503`, show service unavailable or model unavailable

### Notes

The backend does not expose raw model internals in the public response.

It returns a lean prediction payload suitable for frontend use.

---

## 6. `GET /checkpoints/{checkpoint_id}/forecast`

### Purpose

Return the current checkpoint row plus a fixed set of forecast horizons.

This endpoint is designed for the frontend to show:

- the current live checkpoint status
- the checkpoint prediction after 30 minutes
- the checkpoint prediction after 1 hour
- the checkpoint prediction after 2 hours
- the checkpoint prediction at the next day’s 08:00 UTC

### Request

- method: `GET`
- path param:
  - `checkpoint_id` integer
- query params:
  - `status_type` required, canonical values: `entering`, `leaving`, or `both`
  - `both` is forecast-only and means the backend will run both directions for each horizon
  - `as_of` optional ISO 8601 datetime

### Example

```text
GET /checkpoints/359/forecast?status_type=entering&as_of=2026-04-23T08:00:00Z
```

For both directions:

```text
GET /checkpoints/359/forecast?status_type=both&as_of=2026-04-23T08:00:00Z
```

If `as_of` is omitted, the backend uses the current UTC time.

### Horizon Rules

The backend computes the following prediction targets in UTC:

- `+30 minutes`
- `+1 hour`
- `+2 hours`
- `next day at 08:00`

When `status_type=both`, the backend runs 8 predictions total:

- 4 horizons for `entering`
- 4 horizons for `leaving`

### Success Response

```json
{
  "success": true,
  "data": {
    "checkpoint": {
      "id": 359,
      "checkpoint": "مسافر يطّا والبادية",
      "city": "الخليل",
      "entering_status": "سالك",
      "leaving_status": "سالك",
      "entering_status_last_updated": "2026-04-22T19:24:51",
      "leaving_status_last_updated": "2026-04-22T19:24:51",
      "alert_text": null,
      "latitude": null,
      "longitude": null
    },
    "request": {
      "checkpoint_id": 359,
      "status_type": "entering",
      "as_of": "2026-04-23T08:00:00Z"
    },
    "predictions": [
      {
        "horizon": "plus_30m",
        "target_datetime": "2026-04-23T08:30:00Z",
        "prediction": {
          "target_datetime": "2026-04-23T08:30:00Z",
          "status_type": "entering",
          "predicted_status": "سالك",
          "confidence": 0.6801,
          "class_probabilities": {
            "سالك": 0.6801,
            "أزمة": 0.2022,
            "مغلق": 0.1177
          }
        }
      },
      {
        "horizon": "plus_1h",
        "target_datetime": "2026-04-23T09:00:00Z",
        "prediction": {
          "target_datetime": "2026-04-23T09:00:00Z",
          "status_type": "entering",
          "predicted_status": "سالك",
          "confidence": 0.6710,
          "class_probabilities": {
            "سالك": 0.6710,
            "أزمة": 0.2090,
            "مغلق": 0.1200
          }
        }
      },
      {
        "horizon": "plus_2h",
        "target_datetime": "2026-04-23T10:00:00Z",
        "prediction": {
          "target_datetime": "2026-04-23T10:00:00Z",
          "status_type": "entering",
          "predicted_status": "أزمة",
          "confidence": 0.5330,
          "class_probabilities": {
            "سالك": 0.3210,
            "أزمة": 0.5330,
            "مغلق": 0.1460
          }
        }
      },
      {
        "horizon": "next_day_8am",
        "target_datetime": "2026-04-24T08:00:00Z",
        "prediction": {
          "target_datetime": "2026-04-24T08:00:00Z",
          "status_type": "entering",
          "predicted_status": "سالك",
          "confidence": 0.7022,
          "class_probabilities": {
            "سالك": 0.7022,
            "أزمة": 0.1888,
            "مغلق": 0.1090
          }
        }
      }
    ]
  }
}
```

### Status Codes

- `200 OK`
- `404 Not Found` if the checkpoint does not exist
- `422 Unprocessable Entity` if the query params are invalid
- `502 Bad Gateway` if checkpoint lookup or prediction fails unexpectedly
- `503 Service Unavailable` if Supabase config is missing or prediction artifacts are unavailable

### Frontend Handling

- render the current `checkpoint` object as the live status panel
- render `predictions` as a timeline or cards
- if `status_type=both`, render `predictions.entering` and `predictions.leaving` separately
- do not treat missing `alert_text` as an error
- if the response is `404`, show checkpoint-not-found
- if the response is `422`, show invalid filter/selection
- if the response is `502`, show backend/model failure
- if the response is `503`, show service unavailable

---

## 7. `POST /api/routing`

### Purpose

Return a simple car route between two points using GraphHopper.

This is a backend proxy route, so the frontend does not call GraphHopper directly.

### Request

- method: `POST`
- body:

```json
{
  "startPoint": {
    "lat": 24.7136,
    "lng": 46.6753
  },
  "endPoint": {
    "lat": 24.7236,
    "lng": 46.6853
  }
}
```

### Request Fields

- `startPoint`
  - required
  - object with `lat` and `lng`
- `endPoint`
  - required
  - object with `lat` and `lng`

### Validation Rules

The backend validates:

- `lat` must be a number between `-90` and `90`
- `lng` must be a number between `-180` and `180`
- both points must be present
- extra fields are rejected

### GraphHopper Conversion

The frontend sends coordinates as `{ lat, lng }`.

The backend converts them to GraphHopper’s `[lng, lat]` order before forwarding the request.

### Upstream Request

The backend sends GraphHopper a simple routing request with:

- `profile=car`
- `points_encoded=false`
- no alternative-route settings

### Success Response

The backend returns the GraphHopper response wrapped in the standard envelope:

```json
{
  "success": true,
  "data": {
    "paths": [
      {
        "distance": 1234.56,
        "time": 120000,
        "points": {
          "type": "LineString",
          "coordinates": [
            [46.6753, 24.7136],
            [46.6853, 24.7236]
          ]
        },
        "instructions": [],
        "ascend": 0.0,
        "descend": 0.0,
        "snapped_waypoints": {
          "type": "Point",
          "coordinates": [46.6753, 24.7136]
        }
      }
    ],
    "info": {
      "copyrights": ["GraphHopper", "OpenStreetMap contributors"],
      "took": 5
    }
  }
}
```

### Status Codes

- `200 OK`
- `422 Unprocessable Entity` if the body is missing, incomplete, malformed, or out of range
- `502 Bad Gateway` if GraphHopper rejects the request or times out
- `503 Service Unavailable` if the GraphHopper API key is missing
- `500 Internal Server Error` only for unexpected server bugs

### Frontend Handling

- if `200`, render `paths[0]` as the primary route
- render the returned GeoJSON path directly
- treat `paths[0]` as the fastest route in v1
- if `422`, show a validation message for the entered points
- if `502`, show a routing-provider failure state and allow retry
- if `503`, show a service-unavailable state and avoid retry loops

### Notes

- v1 is intentionally simple
- there is no alternative-route tuning exposed yet
- routing is server-side only
- the frontend can consume the GeoJSON path directly because `points_encoded=false`

---

## 8. `POST /api/routing/v2`

### Purpose

Return up to 3 GraphHopper candidate routes, enrich them with nearby checkpoint intelligence, forecast checkpoint risk at the time each checkpoint is actually reached, propagate checkpoint delay forward through the route, rerank the routes, and return a frontend-ready payload with Smart ETA and Journey Risk fields.

V1 remains unchanged at `POST /api/routing`.

### V5 Architecture Overview

V5 significantly improves checkpoint matching and direction-aware logic compared to V4:

**Static Data Sources:**
- `API/data/checkpoints.json`: Source of truth for checkpoint geometry, ID, name, and city
- `API/data/cities.json`: Broad routing city centers for origin/destination inference
- Live status from Supabase: Merged by checkpoint ID with static registry

**Strict Checkpoint Matching (V5):**
- **Old approach (V4):** 2500m radius was too broad, caused false positives
- **New approach (V5):** 300m is only an outer candidate radius
- Candidates must pass strict geometric validation:
  - Projection quality (`projection_t` between 0.12-0.88 for medium, 0.20-0.80 for weak)
  - Local route window length (minimum 120m of continuous route)
  - Route endpoint rejection (rejected if within 180m of route start/end unless very close to route)
  - Nearest-vertex snap distance (weak matches must be >70m from route corners)
  - Confidence classification: `strong` (0-80m), `medium` (80-150m), `weak` (150-300m)

**Direction-Aware Logic (V5):**
- Route direction is derived from checkpoint city vs trip origin/destination:
  - `leaving`: checkpoint city matches origin city
  - `entering`: checkpoint city matches destination city
  - `transit`: checkpoint city is neither origin nor destination
  - `unknown`: origin/destination cities are unknown
- Current status selection uses direction:
  - `leaving`: use leaving_status
  - `entering`: use entering_status
  - `transit`/`unknown`: use worst of both (conservative)
- Forecast selection uses direction (similar logic)

**Cumulative Delay Propagation (V4/V5):**
- Checkpoints are evaluated sequentially
- Each checkpoint's expected delay is added to the cumulative total
- Downstream checkpoints are forecast at their effective ETA (base ETA + cumulative prior delay)
- This creates realistic Smart ETA that compounds delays through the route

**Risk Scoring (V4/V5):**
- Combines: checkpoint burden (30%), severity ratio (35%), confidence penalty (20%), volatility ratio (15%)
- Risk level: `low` (0-33), `medium` (34-66), `high` (67-100)

### Request Body

```json
{
  "origin": { "lat": 32.221, "lng": 35.262 },
  "destination": { "lat": 32.281, "lng": 35.183 },
  "origin_city": "جنين",
  "destination_city": "نابلس",
  "depart_at": "2026-04-23T08:00:00Z",
  "profile": "car"
}
```

### Request Field Reference

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `origin` | object | Yes | `{ "lat": number, "lng": number }` |
| `destination` | object | Yes | `{ "lat": number, "lng": number }` |
| `origin_city` | string | No | Broad routing city label (e.g., "جنين", "نابلس") |
| `destination_city` | string | No | Broad routing city label |
| `depart_at` | string | No | ISO 8601 UTC datetime; defaults to current time |
| `profile` | string | No | Only `"car"` is supported |

### Request Notes

**City Inference:**
- If `origin_city` / `destination_city` are not provided:
  - Backend infers them from `API/data/cities.json` using haversine distance to route endpoints
  - Inference priority: request-provided > nearest city center > checkpoint city in first/last 5km > unknown
  - City inference enables direction-aware checkpoint status/forecast selection
- If cities cannot be inferred, direction defaults to `unknown` for all checkpoints (conservative fallback)

**Static Data Sources:**
- `API/data/checkpoints.json`: Static checkpoint registry with ID, name, city, latitude, longitude
  - Source of truth for checkpoint geometry and broad routing city
  - Merged with live status from Supabase by checkpoint ID
- `API/data/cities.json`: City centers used for origin/destination inference
  - Supports multiple JSON formats (direct list, `routing_city_centers` object, `west_bank_cities` object)
  - Used for haversine distance calculations
  - Preferred city centers are broad routing labels (e.g., "جنين", "نابلس", not micro-location names)

**Backward Compatibility:**
- Legacy aliases `startPoint` / `endPoint` are auto-converted to `origin` / `destination`
- Camel-case aliases `originCity` / `destinationCity` are auto-converted to snake_case
- All V4 response fields are preserved; new V5 fields are additions only

**Grouped Checkpoint Labels (V5):**
- Checkpoint city values like `أريحا - طوباس` (grouped labels) are resolved to a single routing city:
  - Backend uses checkpoint coordinates to infer which city in the group is most likely
  - This ensures consistent direction-aware status selection across grouped checkpoints

### Backend Flow (V5)

**Stage 1: Data Loading**
- Load static checkpoint registry from `API/data/checkpoints.json`
  - Validate coordinates, skip invalid rows
  - Log total/usable/skipped counts
- Load city centers from `API/data/cities.json`
  - Support multiple JSON root formats
  - Validate coordinate bounds
  - Normalize aliases_ar
- Load live checkpoint statuses from Supabase
- Merge static + live by checkpoint ID
  - Keep static geometry as source of truth
  - Add live status fields (entering_status, leaving_status, timestamps)

**Stage 2: Route Generation**
- GraphHopper generates up to 3 alternative routes using `algorithm=alternative_route`
- GraphHopper flexible mode required for custom-model routing (free tier cannot produce 3-route response)
- Multi-pass fallback:
  - Pass 1: Unrestricted routes
  - Pass 2: Avoid RED checkpoints (if < 3 routes)
  - Pass 3: Avoid RED + penalize YELLOW (if still < 3 routes)

**Stage 3: City Inference**
- Infer origin/destination cities if not provided
- Priority: request > nearest city center > checkpoint city in route segment > unknown
- Enables direction-aware checkpoint selection

**Stage 4: Strict Checkpoint Matching (V5)**
- Project route to 2D for geometry calculations
- For each checkpoint in merged catalog:
  - Find closest route segment
  - Calculate perpendicular distance
  - If > 300m: reject as out of corridor
  - If <= 300m: validate using strict geometric rules:
    - Check projection_t (parametric position on segment)
    - Check local route window (120m minimum continuous route)
    - Check route endpoint distance (reject if too near start/end)
    - Check nearest vertex distance (weak matches must be far from corners)
  - Classify as `strong` / `medium` / `weak` based on distance + geometry
  - Accept or reject based on classification rules
- Log all rejected candidates (within 300m but failed validation)
- Sort accepted checkpoints by chainage_m (distance along route)

**Stage 5: Direction-Aware Enrichment**
- For each accepted checkpoint:
  - Derive route_direction from checkpoint.city vs origin_city / destination_city
  - Select current status based on direction (entering/leaving/worst)
  - Calculate base ETA using instruction-based interpolation
  - Apply cumulative delays from prior checkpoints → effective ETA
  - Calculate crossing_time = depart_at + effective_eta_ms
  - Get direction-aware forecast at crossing_time
  - Extract forecast_probabilities and expected_delay_ms
  - Add expected_delay to cumulative total for downstream checkpoints
  - Build complete checkpoint payload

**Stage 6: Route Scoring & Risk**
- Calculate predicted_burden (sum of predicted status penalties)
- Calculate current_burden (sum of current status penalties)
- Calculate checkpoint_penalty (checkpoint_count - 1) * 5
- route_score = duration_minutes + predicted_burden + current_burden + checkpoint_penalty
- Calculate risk_score from 4 components:
  - 30% checkpoint_burden = checkpoint_count / 5 (clamped to 1.0)
  - 35% severity_ratio = expected delays normalized
  - 20% confidence_penalty = 1 - average forecast confidence
  - 15% volatility_ratio = average checkpoint volatility
- Determine risk_level: low (0-33), medium (34-66), high (67-100)
- Derive route_viability: good / risky / avoid

**Stage 7: Route Ranking**
- Tiered sort by: has_any_red, worst_status_bucket, count_red, count_yellow_or_unknown, earliest_risky_eta, duration
- Deduplicate similar routes (< 8% distance difference + > 85% bbox overlap)
- Select top 3 routes

**Stage 8: Response Building**
- Add `checkpoint_matching` metadata describing V5 matcher configuration
- Set version = "v5"
- Include all V4 fields (smart_eta, risk_score, etc.) + V5 new fields
- Return in API response envelope

### Success Response

```json
{
  "success": true,
  "data": {
    "generated_at": "2026-04-23T08:00:02Z",
    "version": "v5",
    "origin": { "lat": 32.221, "lng": 35.262 },
    "destination": { "lat": 32.281, "lng": 35.183 },
    "depart_at": "2026-04-23T08:00:00Z",
    "warnings": [],
    "checkpoint_matching": {
      "mode": "route_corridor_geometric_confidence",
      "outer_threshold_m": 300.0,
      "strong_match_distance_m": 80.0,
      "medium_match_distance_m": 150.0,
      "weak_match_distance_m": 300.0,
      "static_checkpoint_source": "API/data/checkpoints.json",
      "city_source": "API/data/cities.json",
      "city_inference": "request_city_then_nearest_city_center",
      "direction_mode": "origin_destination_city"
    },
    "graphhopper_info": { "took": 7 },
    "routes": [
      {
        "route_id": "route_1",
        "rank": 1,
        "original_index": 0,
        "distance_m": 41234.5,
        "duration_ms": 3180000,
        "duration_minutes": 53.0,
        "geometry": {
          "type": "LineString",
          "coordinates": [[35.262, 32.221], [35.241, 32.236]]
        },
        "snapped_waypoints": null,
        "bbox": null,
        "ascend": null,
        "descend": null,
        "checkpoint_count": 1,
        "smart_eta_ms": 3480000,
        "smart_eta_minutes": 58.0,
        "smart_eta_datetime": "2026-04-23T08:58:00Z",
        "expected_delay_ms": 300000,
        "expected_delay_minutes": 5.0,
        "city": "نابلس",
        "route_score": 58.0,
        "risk_score": 8,
        "risk_level": "low",
        "risk_confidence": 0.82,
        "risk_components": {
          "checkpoint_burden": 0.2,
          "severity_ratio": 0.0,
          "confidence_penalty": 0.18,
          "volatility_ratio": 0.0,
          "average_forecast_confidence": 0.82
        },
        "historical_volatility": 0.0,
        "route_viability": "good",
        "worst_predicted_status": "green",
        "reason_summary": "Low checkpoint burden with favorable forecast windows.",
        "checkpoints": [
          {
            "checkpoint_id": 12,
            "name": "Huwwara",
            "city": "نابلس",
            "lat": 32.24,
            "lng": 35.23,
            "route_direction": "entering",
            "distance_from_route_m": 812.3,
            "match_confidence": "strong",
            "projection_t": 0.54,
            "nearest_segment_index": 0,
            "projected_point_on_route": [35.233, 32.239],
            "chainage_m": 14567.8,
            "base_eta_ms": 2040000,
            "effective_eta_ms": 2340000,
            "cumulative_delay_ms_before_checkpoint": 300000,
            "base_eta_ms": 2040000,
            "effective_eta_ms": 2340000,
            "cumulative_delay_ms_before_checkpoint": 300000,
            "eta_ms": 2340000,
            "eta_seconds": 2340,
            "eta_minutes": 39.0,
            "crossing_datetime": "2026-04-23T08:39:00Z",
            "current_status": "yellow",
            "current_status_raw": {
              "entering_status": "أزمة",
              "leaving_status": "سالك",
              "entering_status_last_updated": "2026-04-23T07:45:00Z",
              "leaving_status_last_updated": "2026-04-23T07:45:00Z"
            },
            "predicted_status_at_eta": "green",
            "forecast_confidence": 0.82,
            "forecast_source": "model",
            "forecast_model_version": 2,
            "forecast_reason": null,
            "forecast_probabilities": {
              "green": 1.0,
              "yellow": 0.0,
              "red": 0.0,
              "unknown": 0.0
            },
            "expected_delay_ms": 0,
            "expected_delay_minutes": 0.0,
            "severity_ratio": 0.0,
            "selected_status_type": "entering",
            "historical_volatility": 0.0,
            "match_confidence_details": {
              "distance_m": 42.3,
              "projection_quality": "good",
              "local_window_route_length_m": 500.0,
              "distance_to_nearest_vertex_m": 123.4
            }
          }
        ],
        "graphhopper": {
          "details": {},
          "instructions": []
        }
      }
    ],
    "tradeoff_explainer": {
      "mode": "rule_based_bilingual",
      "language": "bilingual",
      "compared_route_count": 3,
      "winner_route_id": "route_1",
      "fastest_route_id": "route_2",
      "safest_route_id": "route_1",
      "set_summary": {
        "time_spread_minutes": 5.0,
        "risk_spread": 12,
        "delay_spread_minutes": 3.0,
        "checkpoint_spread": 1,
        "confidence_spread": 0.12,
        "volatility_spread": 0.08,
        "corridor_note": "جنين -> نابلس",
        "decision_driver_en": "speed and safety align on the same route",
        "decision_driver_ar": "السرعة والأمان يتطابقان على المسار نفسه"
      },
      "routes": [
        {
          "route_id": "route_1",
          "rank": 1,
          "label_en": "Route 1",
          "label_ar": "المسار 1",
          "is_recommended": true,
          "is_fastest": false,
          "is_safest": true,
          "duration_minutes": 53.0,
          "smart_eta_minutes": 58.0,
          "expected_delay_minutes": 5.0,
          "risk_score": 8,
          "risk_level": "low",
          "route_viability": "good",
          "worst_predicted_status": "green",
          "comparison_facts": {
            "english": ["This is the recommended route and it is also the safest option in the set."],
            "arabic": ["هذا هو المسار الموصى به، وهو أيضا الأكثر أمانا ضمن المجموعة."]
          }
        }
      ],
      "english_text": "Route 1 is best overall.",
      "arabic_text": "المسار 1 هو الأفضل إجمالا.",
      "full_text": "English: Route 1 is best overall.\n\nالعربية: المسار 1 هو الأفضل إجمالا."
    }
  }
}
```

### Status Normalization & Direction-Awareness (V5)

**Status Buckets:**
- `green` (سالك): Open, flowing traffic
- `yellow` (أزمة, ازمة): Congested, busy
- `red` (مغلق): Closed, blocked
- `unknown`: Unrecognized or unavailable

**Current Status Selection (V5):**
- If `route_direction == "leaving"`: use `leaving_status` from live checkpoint data
- If `route_direction == "entering"`: use `entering_status` from live checkpoint data  
- If `route_direction == "transit"` or `"unknown"`: use worst of both (conservative)
- This replaces V4 behavior which always used worst-of-both

**Predicted Status Selection (V5):**
- Prediction service returns both entering and leaving forecasts
- Backend selects forecast based on `route_direction`:
  - `leaving`: use leaving forecast
  - `entering`: use entering forecast
  - `transit`/`unknown`: use worst of both
- `selected_status_type` field indicates which was chosen

**Why Direction Matters:**
- A checkpoint's status depends on which direction you're crossing it
- Entering side may have congestion while leaving side is clear (or vice versa)
- V5 makes this explicit; V4 always used conservative worst-of-both
- Results in more accurate ETAs and risk scores

**Example:**
```
Checkpoint entering_status: yellow (congestion on entry side)
Checkpoint leaving_status: green (clear on exit side)
Route direction: "entering"
→ selected current_status: yellow
→ selected predicted_status: yellow forecast
```

Raw source values (before direction selection) are always available in `current_status_raw` for transparency.

### Field Reference

#### Top-Level Response

| Field | Type | Possible values |
| --- | --- | --- |
| `success` | boolean | Always `true` on success |
| `data` | object | Response payload described below |

#### `data`

| Field | Type | Possible values |
| --- | --- | --- |
| `generated_at` | string | ISO 8601 UTC timestamp such as `2026-04-23T08:00:02Z` |
| `version` | string | Always `"v5"` for this endpoint |
| `origin` | object | `{ "lat": number, "lng": number }` |
| `destination` | object | `{ "lat": number, "lng": number }` |
| `depart_at` | string | ISO 8601 UTC timestamp used for ETA calculations |
| `warnings` | array of strings | Empty when there are no soft failures; otherwise human-readable warnings |
| `checkpoint_matching` | object | **NEW in V5**: Configuration of the strict geometric matcher |
| `graphhopper_info` | object or null | Upstream GraphHopper `info` object passthrough; shape is not fixed by this API |
| `routes` | array of objects | Ranked routes, usually 1 to 3 items |
| `tradeoff_explainer` | object | Deterministic bilingual comparison across all returned routes |

#### `checkpoint_matching` (NEW in V5)

Metadata describing the V5 strict checkpoint matcher configuration:

| Field | Type | Meaning |
| --- | --- | --- |
| `mode` | string | Always `"route_corridor_geometric_confidence"` |
| `outer_threshold_m` | number | Outer candidate radius (300m) |
| `strong_match_distance_m` | number | Strong match threshold (0-80m) |
| `medium_match_distance_m` | number | Medium match threshold (80-150m) |
| `weak_match_distance_m` | number | Weak match threshold (150-300m) |
| `static_checkpoint_source` | string | Source file for static checkpoint registry |
| `city_source` | string | Source file for city centers |
| `city_inference` | string | City inference priority order |
| `direction_mode` | string | Direction derivation method |

#### Route Object

| Field | Type | Possible values |
| --- | --- | --- |
| `route_id` | string | `route_1`, `route_2`, `route_3`, etc. |
| `rank` | integer | 1 is the best route after reranking |
| `original_index` | integer | Zero-based GraphHopper order before reranking |
| `distance_m` | number | Non-negative route distance in meters |
| `duration_ms` | integer | Non-negative route duration in milliseconds |
| `duration_minutes` | number | `duration_ms / 60000` |
| `geometry` | object | GeoJSON `LineString` with `[lng, lat]` coordinates |
| `snapped_waypoints` | object or null | Passthrough from GraphHopper; may be null |
| `bbox` | array or null | Passthrough from GraphHopper; typically `[minLng, minLat, maxLng, maxLat]` when present |
| `ascend` | number or null | Passthrough from GraphHopper; ascent in meters when present |
| `descend` | number or null | Passthrough from GraphHopper; descent in meters when present |
| `checkpoint_count` | integer | Number of matched checkpoints on the route |
| `smart_eta_ms` | integer | Route ETA after adding cumulative expected checkpoint delay |
| `smart_eta_minutes` | number | `smart_eta_ms / 60000` |
| `smart_eta_datetime` | string | ISO 8601 UTC timestamp for the route arrival time after expected checkpoint delay |
| `expected_delay_ms` | integer | Total expected delay contributed by matched checkpoints |
| `expected_delay_minutes` | number | `expected_delay_ms / 60000` |
| `route_score` | number | Lower is better; used for reranking |
| `risk_score` | integer | Composite `0-100` journey risk score |
| `risk_level` | string | `low`, `medium`, or `high` |
| `risk_confidence` | number | Average forecast confidence used in the risk score |
| `risk_components` | object | Normalized components used to compute `risk_score` |
| `historical_volatility` | number | Average checkpoint volatility used in the risk score |
| `route_viability` | string | `good`, `risky`, or `avoid` |
| `worst_predicted_status` | string | `green`, `yellow`, `red`, or `unknown` |
| `reason_summary` | string | Human-readable explanation of the ranking decision |
| `tradeoff_explainer` | object | Bilingual comparison across all returned routes |
| `checkpoints` | array of objects | Matched checkpoints in route order |
| `graphhopper` | object | Passthrough of the route geometry details and instructions |

#### Route Geometry and GraphHopper Passthrough

| Field | Type | Possible values |
| --- | --- | --- |
| `geometry.type` | string | Always `"LineString"` |
| `geometry.coordinates` | array | Array of `[lng, lat]` coordinate pairs |
| `graphhopper.details` | object | Upstream detail buckets keyed by GraphHopper detail name |
| `graphhopper.instructions` | array | Upstream instruction objects from GraphHopper |

GraphHopper detail keys currently requested by the backend are:

- `road_class`
- `road_environment`
- `road_access`
- `street_name`
- `time`
- `distance`

#### Checkpoint Object

| Field | Type | Meaning | V5 New? |
| --- | --- | --- | --- |
| `checkpoint_id` | integer | Numeric checkpoint ID from static registry + live status | |
| `name` | string | Checkpoint display name | |
| `city` | string | Broad routing label from static checkpoint registry | ✅ |
| `lat` | number | Latitude in decimal degrees | |
| `lng` | number | Longitude in decimal degrees | |
| `route_direction` | string | Trip direction: `leaving`, `entering`, `transit`, `unknown` | ✅ |
| `distance_from_route_m` | number | Perpendicular distance to route polyline in meters | |
| `match_confidence` | string | V5 geometric match quality: `strong`, `medium`, `weak` | ✅ |
| `projection_t` | number | Parametric position on segment [0=start, 1=end] | ✅ |
| `nearest_segment_index` | integer | Zero-based route segment index for closest point | |
| `projected_point_on_route` | array | `[lng, lat]` of closest point on route | |
| `chainage_m` | number | Distance along route to checkpoint projection | |
| `base_eta_ms` | integer | ETA before cumulative delay propagation | ✅ |
| `effective_eta_ms` | integer | ETA after adding delays from prior checkpoints | ✅ |
| `cumulative_delay_ms_before_checkpoint` | integer | Total delay from all upstream checkpoints | ✅ |
| `eta_ms` | integer | Equivalent to `effective_eta_ms` |
| `eta_seconds` | integer | `eta_ms / 1000` rounded |
| `eta_minutes` | number | `eta_ms / 60000` |
| `crossing_datetime` | string | ISO 8601 UTC arrival time at this checkpoint |
| `current_status` | string | Direction-aware current status: `green`, `yellow`, `red`, `unknown` | ✅ |
| `current_status_raw` | object | Raw upstream entering_status, leaving_status, timestamps |
| `predicted_status_at_eta` | string | Direction-aware forecast status: `green`, `yellow`, `red`, `unknown` | ✅ |
| `forecast_confidence` | number \| null | Prediction confidence [0-1] when available |
| `forecast_source` | string | `level2_bundle`, `baseline`, or `fallback_unavailable` |
| `forecast_model_version` | integer \| null | Model version (currently `2` for Level 2) |
| `forecast_reason` | string \| null | Error message if forecast unavailable |
| `forecast_probabilities` | object | Normalized `{green, yellow, red, unknown}` probabilities |
| `expected_delay_ms` | integer | Delay expected at this checkpoint (from probabilities) |
| `expected_delay_minutes` | number | `expected_delay_ms / 60000` |
| `severity_ratio` | number | Normalized severity [0-1] from forecast probabilities |
| `selected_status_type` | string | Which direction was selected: `entering`, `leaving`, `worst` | ✅ |
| `historical_volatility` | number | Checkpoint traffic unpredictability [0-1] |
| `match_confidence_details` | object | Detailed V5 matching metrics (V5 optional debug) | ✅ |

#### match_confidence_details (V5 Debug Field - Optional)

When present, contains detailed geometric matching information:

| Field | Type | Meaning |
| --- | --- | --- |
| `distance_m` | number | Final perpendicular distance to route |
| `projection_quality` | string | `good`, `medium`, or `poor` based on parametric position |
| `local_window_route_length_m` | number | Route geometry continuity around checkpoint |
| `distance_to_nearest_vertex_m` | number | Proximity to route corner/vertex |

#### Raw Status Values

`current_status_raw` preserves the upstream checkpoint payload before normalization.

| Raw value | Normalized value | Meaning |
| --- | --- | --- |
| `سالك` | `green` | Open / flowing |
| `أزمة` or `ازمة` | `yellow` | Congested / busy |
| `مغلق` | `red` | Closed / blocked |
| anything else or missing | `unknown` | Unrecognized or unavailable |

#### Route-Level Value Map

| Field | Values |
| --- | --- |
| `route_viability` | `good` when no severe risk; `risky` when yellow/unknown predicted OR high composite risk (≥67) OR current red; `avoid` when any predicted red |
| `worst_predicted_status` | Highest-severity checkpoint forecast using `green`/`yellow`/`red`/`unknown` scale |
| `reason_summary` | Human-readable ranking explanation (e.g., "Low checkpoint burden with favorable forecast windows") |
| `tradeoff_explainer` | Deterministic all-route comparison object with structured evidence and bilingual natural-language output |
| `warnings` | Soft failures such as fewer-than-3-routes, missing live status, or insufficient city inference confidence |

#### Tradeoff Explainer (NEW in V5)

`tradeoff_explainer` compares every returned route, not just the top two.

| Field | Type | Meaning |
| --- | --- | --- |
| `mode` | string | Currently `rule_based_bilingual` |
| `language` | string | Currently `bilingual` |
| `compared_route_count` | integer | Number of routes compared in the explainer |
| `winner_route_id` | string | Route ID of the recommended route |
| `fastest_route_id` | string | Route ID of the raw fastest route |
| `safest_route_id` | string | Route ID of the lowest-risk route |
| `set_summary` | object | Overall spread across the route set |
| `routes` | array | Per-route comparison snapshots in reranked order |
| `english_text` | string | Full English explanation |
| `arabic_text` | string | Full Arabic explanation |
| `full_text` | string | Combined bilingual explanation for direct display |

Recommended frontend behavior:

- show the reranked routes first
- then render `tradeoff_explainer.full_text` as the human-readable summary
- use `tradeoff_explainer.routes` for richer visual comparison cards

#### Smart ETA Calculation (V4/V5)

Smart ETA accounts for cumulative checkpoint delays through the route:

```
smart_eta_ms = base_duration_ms + sum(expected_delay_ms per checkpoint)
smart_eta_minutes = smart_eta_ms / 60000
```

Each checkpoint's expected delay is calculated from forecast probabilities:

```
expected_delay_ms = ∑(probability[status] × delay_ms[status])

Where delays are:
- green: 0 ms
- yellow: 360000 ms (6 minutes)
- red: 1080000 ms (18 minutes)
- unknown: 540000 ms (9 minutes)
```

#### Journey Risk Score Calculation (V4/V5)

Risk score combines 4 weighted components into a 0-100 scale:

```
risk_score = ⌊30×checkpoint_burden + 35×severity_ratio + 20×confidence_penalty + 15×volatility_ratio⌋

Where:
- checkpoint_burden = min(checkpoint_count / 5, 1.0)
- severity_ratio = average expected delay / max possible delay
- confidence_penalty = 1 - average forecast confidence
- volatility_ratio = average historical checkpoint volatility
```

Risk levels:
- **low**: 0-33
- **medium**: 34-66
- **high**: 67-100

### Status Codes

- `200 OK`
- `422 Unprocessable Entity` for invalid coordinates, invalid profile, or malformed input
- `502 Bad Gateway` if GraphHopper fails or no usable candidate route can be normalized
- `503 Service Unavailable` if GraphHopper is not configured on the server

### Frontend Notes

**Route Rendering:**
- Render routes in reranked order using `rank` (1 is best)
- `original_index` shows GraphHopper raw order before reranking
- Geometry is in `[lng, lat]` order; render directly to map library
- `smart_eta_datetime` is the recommended ETA to display (accounts for checkpoint delays)
- `risk_score` + `risk_level` provide single-number risk summary; use for color-coding
- `reason_summary` provides human-readable explanation for ranking

**Checkpoint Rendering:**
- Render checkpoints in order within each route
- Use `match_confidence` for visual confidence indicator (strong > medium > weak)
- Show `effective_eta_ms` as arrival time (already includes prior delays)
- Use `route_direction` to determine if checkpoint is on entry, exit, or transit through route
- `forecast_probabilities` can be rendered as stacked bar or pie chart (optional debug UI)
- Current and predicted status may differ; show both or use direction-aware selected status
- `selected_status_type` explains which direction was selected (helpful for debug)

**Status & Forecast:**
- `predicted_status_at_eta` is a routing bucket (`green`/`yellow`/`red`/`unknown`), not raw ML label
- `current_status` is direction-aware; `current_status_raw` contains raw upstream values
- `forecast_confidence` indicates prediction reliability; show warning if low (<0.7)
- If `forecast_source` is `fallback_unavailable`, backend could not reach prediction service

**Data Source Transparency (V5):**
- `checkpoint_matching` metadata shows:
  - Checkpoint data from `API/data/checkpoints.json`
  - City inference from `API/data/cities.json`
  - Strict 300m geometric validation (not old 2500m)
  - V5 mode for reproducibility and audit
- Show this info in debug/transparency view if available

**Warnings:**
- May explain fewer than 3 routes generated
- May indicate weak city inference confidence (fallback to unknown direction)
- May indicate missing live status for some checkpoints
- Non-fatal; route is still valid, just with reduced intelligence

**Error Handling:**
- `502 Bad Gateway`: Backend infrastructure failure; show retry option
- `503 Service Unavailable`: Missing config (GraphHopper API key, Supabase, etc.); show service status
- `422 Unprocessable Entity`: Invalid coordinates; validate client input
- `200 with warnings`: Route succeeded but degraded; display route anyway

---

## Error Handling Matrix

| Case | Status | Shape | Frontend Action |
| --- | --- | --- | --- |
| Success | `200` | `{ "success": true, "data": ... }` | Render data |
| Empty checkpoint list | `200` | `{ "success": true, "data": [] }` | Render empty state |
| Checkpoint not found | `404` | `{ "success": false, "error": "Checkpoint not found." }` | Show not-found state |
| Invalid request | `422` | `{ "success": false, "error": "Validation failed", "details": [...] }` | Show validation error |
| Supabase config missing | `503` | `{ "success": false, "error": "Supabase is not configured on the server." }` | Show service unavailable |
| Prediction artifacts missing | `503` | `{ "success": false, "error": "Prediction artifacts are not available on the server." }` | Show model unavailable |
| GraphHopper config missing | `503` | `{ "success": false, "error": "GraphHopper is not configured on the server." }` | Show routing unavailable |
| GraphHopper failure | `502` | `{ "success": false, "error": "Failed to fetch route from GraphHopper." }` | Show routing retry state |
| Supabase connection/query failure | `502` | `{ "success": false, "error": "..." }` | Show retryable backend failure |
| Unhandled server failure | `500` | `{ "success": false, "error": "Internal server error" }` | Show generic failure |

---

## Prediction Model Contract

### Where the Model Lives

The backend uses the saved Level 2 artifacts in:

```text
experimental/data/level2_artifacts
```

The prediction service loads the artifact bundle directly in Python and calls the model inference function in-process.

### Prediction Entry Point

The model is used via the Python function:

- `predict_level2(checkpoint_id, target_time, status_type, bundle=...)`

### Required Input Values

- `checkpoint_id`
  - numeric checkpoint ID from the live Supabase table
- `status_type`
  - canonical values: `entering` or `leaving` for direct model inference
  - forecast requests also allow `both`, which runs both directions for every forecast horizon
- `target_datetime`
  - exact ISO 8601 datetime
  - timezone-aware is preferred

### Weekday Format

The model’s canonical weekday format is:

- `Mon`
- `Tue`
- `Wed`
- `Thu`
- `Fri`
- `Sat`
- `Sun`

The frontend does not send weekdays directly.

The backend derives the weekday from `target_datetime`, and the model itself normalizes to the same short format.

### Startup and Caching

The backend preloads the Level 2 artifact bundle when the server starts and keeps that bundle cached in memory.

### Parallel Execution

The backend runs the independent work for prediction requests in parallel:

- checkpoint lookup and single prediction generation run concurrently
- forecast horizon predictions run concurrently

### Time Handling

- timezone-aware datetimes are converted to UTC
- timezone-naive datetimes are treated as UTC
- prediction targets in the forecast endpoint are computed in UTC

### Output Contract

The public prediction payload is intentionally lean:

- `target_datetime`
- `status_type`
- `predicted_status`
- `confidence`
- `class_probabilities`

The backend does not expose raw internal model debugging values in the public API.

---

## Recommended Frontend Flow

### For checkpoint detail screens

1. Call `GET /checkpoints/{checkpoint_id}`
2. Render the live row
3. If needed, call `POST /checkpoints/{checkpoint_id}/predict`
4. If needed, call `GET /checkpoints/{checkpoint_id}/forecast`

### For list screens

1. Call `GET /checkpoints/current-status`
2. Render the array of live checkpoints
3. Handle empty results as a valid empty state

### For prediction forms

1. Validate `checkpoint_id`, `status_type`, and datetime input on the client
2. Send exact ISO 8601 datetime
3. Treat 422 as a user input problem, not a backend bug
4. Treat 502/503 as server-side failures

---

## Example Frontend Pseudocode

```ts
const res = await fetch(`/checkpoints/${checkpointId}/predict`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    target_datetime: "2026-04-23T08:00:00Z",
    status_type: "entering",
  }),
});

const payload = await res.json();

if (!res.ok) {
  throw new Error(payload.error ?? "Request failed");
}

if (!payload.success) {
  throw new Error("Unexpected response shape");
}

return payload.data;
```

---

## How to Run the Backend

From the repo root:

```bash
.venv/bin/uvicorn API.app:app --reload --host 0.0.0.0 --port 8000
```

Alternative:

```bash
.venv/bin/python API/app.py
```

Both commands start the same FastAPI app.

---

## How to Smoke Test

### Health

```bash
curl http://127.0.0.1:8000/health
```

### Current Checkpoint List

```bash
curl http://127.0.0.1:8000/checkpoints/current-status
```

### Single Checkpoint

```bash
curl http://127.0.0.1:8000/checkpoints/359
```

### Prediction

```bash
curl -X POST "http://127.0.0.1:8000/checkpoints/359/predict" \
  -H "Content-Type: application/json" \
  -d '{"target_datetime":"2026-04-23T08:00:00Z","status_type":"entering"}'
```

### Forecast

```bash
curl "http://127.0.0.1:8000/checkpoints/359/forecast?status_type=entering&as_of=2026-04-23T08:00:00Z"
```
