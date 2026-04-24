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

The routing endpoint reads its API key from:

- `GRAPHHOPPER_API_KEY`

If this variable is missing, the routing endpoint returns:

- `503 Service Unavailable`

The frontend should treat that as a backend configuration issue, not a user input issue.

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
| `POST` | `/api/routing` | Return a simple car route between two points |
| `POST` | `/api/routing/v4` | Return checkpoint-aware alternative routes with reranking metadata |

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

## 8. `POST /api/routing/v4`

### Purpose

Return up to 3 GraphHopper candidate routes, enrich them with nearby checkpoint intelligence, forecast checkpoint risk at the time each checkpoint is actually reached, propagate checkpoint delay forward through the route, rerank the routes, and return a frontend-ready payload with Smart ETA and Journey Risk fields.

V1 remains unchanged at `POST /api/routing`.

### Request Body

```json
{
  "origin": { "lat": 32.221, "lng": 35.262 },
  "destination": { "lat": 32.281, "lng": 35.183 },
  "depart_at": "2026-04-23T08:00:00Z",
  "profile": "car"
}
```

### Request Notes

- `origin` and `destination` are required
- `depart_at` is optional and defaults to the current UTC time
- `profile` currently only accepts `car`
- legacy aliases `startPoint` and `endPoint` are accepted for V4 request parsing

### Backend Flow

- GraphHopper still generates the routes
- the backend requests up to 3 alternative routes using `algorithm=alternative_route`
- GraphHopper flexible mode is required for V2 custom-model routing and route alternatives; free-tier keys cannot produce the 3-route checkpoint-aware response
- the backend matches checkpoints within `2500m` of each route polyline
- checkpoint ETA is interpolated from GraphHopper instructions when available
- checkpoint forecasts are evaluated sequentially, so delay from an earlier checkpoint shifts the arrival time used for downstream checkpoints
- current checkpoint status is collapsed from entering/leaving using worst severity
- forecast status is requested for both entering and leaving, then collapsed using worst severity
- route-level Smart ETA adds the expected delay from matched checkpoints to the raw GraphHopper duration
- route-level risk scoring uses checkpoint burden, forecast severity, forecast confidence, and historical volatility
- routes are scored and reranked before the response is returned

### Success Response

```json
{
  "success": true,
  "data": {
    "generated_at": "2026-04-23T08:00:02Z",
    "version": "v4",
    "origin": { "lat": 32.221, "lng": 35.262 },
    "destination": { "lat": 32.281, "lng": 35.183 },
    "depart_at": "2026-04-23T08:00:00Z",
    "warnings": [],
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
            "lat": 32.24,
            "lng": 35.23,
            "distance_from_route_m": 812.3,
            "nearest_segment_index": 0,
            "projected_point_on_route": [35.233, 32.239],
            "chainage_m": 14567.8,
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
            "historical_volatility": 0.0
          }
        ],
        "graphhopper": {
          "details": {},
          "instructions": []
        }
      }
    ]
  }
}
```

### Status Clarification

This endpoint does not return the raw ML label directly in `predicted_status_at_eta`.

- `POST /checkpoints/{checkpoint_id}/predict` returns the model label in `predicted_status`
- `POST /api/routing/v4` normalizes that label into a routing bucket for ranking and display
- the routing buckets are `green`, `yellow`, `red`, and `unknown`
- raw checkpoint source values are preserved under `current_status_raw`

So in the routing response, `predicted_status_at_eta: "green"` is valid and expected when the forecasted checkpoint risk is low.

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
| `version` | string | Always `"v4"` for this endpoint |
| `origin` | object | `{ "lat": number, "lng": number }` |
| `destination` | object | `{ "lat": number, "lng": number }` |
| `depart_at` | string | ISO 8601 UTC timestamp used for ETA calculations |
| `warnings` | array of strings | Empty when there are no soft failures; otherwise human-readable warnings |
| `graphhopper_info` | object or null | Upstream GraphHopper `info` object passthrough; shape is not fixed by this API |
| `routes` | array of objects | Ranked routes, usually 1 to 3 items |

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
| `risk_score` | number | Composite journey risk score |
| `risk_level` | string | `low`, `medium`, `high`, or `unknown` |
| `risk_confidence` | number | Average forecast confidence used in the risk score |
| `risk_components` | object | Normalized components used to compute `risk_score`; may contain short explanation fields |
| `historical_volatility` | number | Average checkpoint volatility used in the risk score |
| `route_viability` | string | `good`, `risky`, or `avoid` |
| `worst_predicted_status` | string | `green`, `yellow`, `red`, or `unknown` |
| `reason_summary` | string | Human-readable explanation of the ranking decision |
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

| Field | Type | Possible values |
| --- | --- | --- |
| `checkpoint_id` | integer | Numeric checkpoint ID from the live checkpoint catalog |
| `name` | string | Checkpoint name, or `Checkpoint {id}` when the source name is missing |
| `lat` | number | Latitude in decimal degrees |
| `lng` | number | Longitude in decimal degrees |
| `distance_from_route_m` | number | Non-negative distance from the route polyline in meters |
| `nearest_segment_index` | integer | Zero-based segment index on the matched route polyline |
| `projected_point_on_route` | array | `[lng, lat]` projection of the checkpoint onto the route |
| `chainage_m` | number | Distance along the route polyline to the matched point |
| `base_eta_ms` | integer | ETA from route start to the checkpoint before checkpoint delay propagation |
| `effective_eta_ms` | integer | ETA used for forecasting after adding cumulative prior delay |
| `cumulative_delay_ms_before_checkpoint` | integer | Delay already accumulated before this checkpoint |
| `eta_ms` | integer | Estimated travel time from route start to the checkpoint |
| `eta_seconds` | integer | `eta_ms / 1000`, rounded |
| `eta_minutes` | number | `eta_ms / 60000` |
| `crossing_datetime` | string | ISO 8601 UTC timestamp for the expected crossing time |
| `current_status` | string | `green`, `yellow`, `red`, or `unknown` |
| `current_status_raw` | object | Raw upstream checkpoint status values and timestamps |
| `predicted_status_at_eta` | string | `green`, `yellow`, `red`, or `unknown` |
| `forecast_confidence` | number or null | Confidence score between `0` and `1` when a forecast is available |
| `forecast_source` | string | Usually `model` or `baseline`; `fallback_unavailable` when no forecast service is available |
| `forecast_model_version` | integer or null | Currently `2` when forecast data comes from Level 2, otherwise null |
| `forecast_reason` | string or null | Null in the normal path; `"No forecast service available"` in the fallback path |
| `forecast_probabilities` | object | Normalized `green` / `yellow` / `red` / `unknown` probability vector used for delay estimation |
| `expected_delay_ms` | integer | Expected delay contributed by this checkpoint |
| `expected_delay_minutes` | number | `expected_delay_ms / 60000` |
| `severity_ratio` | number | Normalized severity mass used by the risk model |
| `selected_status_type` | string or null | The entering/leaving prediction chosen for the delay calculation |
| `historical_volatility` | number | Checkpoint volatility proxy from historical status distribution |

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
| `route_viability` | `good` when the route has no severe forecast risk, `risky` when it has yellow or unknown forecast risk, high composite risk, or a red current status, `avoid` when any checkpoint is forecast red |
| `worst_predicted_status` | The highest-severity checkpoint forecast on that route, using the same `green` / `yellow` / `red` / `unknown` scale |
| `warnings` | Free-form warning strings such as fewer-than-3-routes, malformed GraphHopper paths, or checkpoint catalog warnings |

### Status Codes

- `200 OK`
- `422 Unprocessable Entity` for invalid coordinates, invalid profile, or malformed input
- `502 Bad Gateway` if GraphHopper fails or no usable candidate route can be normalized
- `503 Service Unavailable` if GraphHopper is not configured on the server

### Frontend Notes

- render routes in reranked order using `rank`
- preserve `original_index` if you want to compare against GraphHopper raw ordering
- geometry remains in `[lng, lat]` order
- `checkpoints` is always present, even when empty
- `predicted_status_at_eta` is a routing bucket, not the raw ML label
- `current_status_raw` is the raw checkpoint payload; `current_status` is the normalized routing bucket
- `warnings` may explain degraded cases such as fewer than 3 routes or unavailable live status

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
