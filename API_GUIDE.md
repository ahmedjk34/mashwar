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
