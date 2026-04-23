# Mashwar Backend API Guide

This document is the frontend integration contract for the Mashwar backend.

It explains:

- every currently exposed endpoint
- request method and request shape
- response shape
- response codes
- error cases
- how the frontend should handle each case
- what is available for future extension

The backend is implemented with FastAPI and currently exposes a small set of read-only routes.

---

## Base Information

### Framework

- FastAPI

### Base URL

For local development, the API is usually served on:

```text
http://127.0.0.1:8000
```

### General Response Pattern

Most application responses are JSON.

The checkpoint route follows this success envelope:

```json
{
  "success": true,
  "data": []
}
```

On failure, FastAPI errors are returned in the standard shape:

```json
{
  "detail": "..."
}
```

The frontend should support both styles.

---

## Authentication

There is currently no frontend authentication requirement for the read-only routes that exist today.

The `/checkpoints/current-status` route uses a server-side Supabase admin client and is not called with a browser key from the frontend.

The frontend should not try to query Supabase directly for this endpoint unless the architecture changes later.

---

## Environment Expectations

The backend reads Supabase secrets from `API/.env`.

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_PUBLISHABLE_KEY`

Supported alias for the secret key:

- `SUPABASE_SERVICE_ROLE_KEY`

Important:

- the backend uses `SUPABASE_SECRET_KEY` for the admin query
- if `SUPABASE_SECRET_KEY` is absent, the backend will fall back to `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLISHABLE_KEY` is kept for future frontend use, but is not used by the backend for the checkpoints query

---

## Endpoint Reference

## 1. `GET /`

### Purpose

Basic root route for confirming the app is alive.

### Request

No body.

No query params.

### Response

```json
{
  "message": "Mashwar API is running"
}
```

### Response Codes

- `200 OK`

### Frontend Notes

- Use this only as a lightweight connectivity check.
- It is not a business endpoint.

---

## 2. `GET /health`

### Purpose

Health probe for uptime and deployment monitoring.

### Request

No body.

No query params.

### Response

```json
{
  "status": "ok"
}
```

### Response Codes

- `200 OK`

### Frontend Notes

- This is ideal for health checks, not user-facing data fetching.
- If this route fails, the app process is unhealthy or unreachable.

---

## 3. `GET /checkpoints/current-status`

### Purpose

Fetch the current checkpoint records from Supabase.

This is the main frontend data endpoint currently exposed by the backend.

### Request

Method:

```text
GET
```

Body:

- none

Query params:

- none currently

Headers:

- no custom headers required for now

### What It Queries

The backend queries the Supabase table:

- `checkpoints`

It selects only these fields:

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

The backend wraps the results like this:

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

### Success Response Code

- `200 OK`

### Empty Data Case

If the table exists but has no rows returned, the backend should return:

```json
{
  "success": true,
  "data": []
}
```

Frontend handling:

- render an empty state
- do not treat this as an error
- avoid retry spam unless the UI expects polling

### Field Semantics

The frontend should treat these fields as follows:

- `id`: unique numeric checkpoint identifier
- `checkpoint`: display name, usually Arabic text
- `city`: checkpoint city or region
- `entering_status`: current status for entering traffic
- `leaving_status`: current status for leaving traffic
- `entering_status_last_updated`: timestamp string for the entering status update
- `leaving_status_last_updated`: timestamp string for the leaving status update
- `alert_text`: optional warning message, may be `null`
- `latitude`: optional numeric latitude, may be `null`
- `longitude`: optional numeric longitude, may be `null`

### Frontend Display Guidance

Suggested frontend behavior:

- show `checkpoint` as the primary title
- show `city` as the location label
- show `entering_status` and `leaving_status` as the primary live state
- show alert UI only when `alert_text` is non-null and non-empty
- show timestamps only when the UI needs freshness detail
- treat `latitude` and `longitude` as optional metadata

### Possible Failure Responses

#### 1. Supabase not configured

If the backend does not see a usable Supabase URL and secret key, it returns:

```json
{
  "detail": "Supabase is not configured on the server."
}
```

HTTP status:

- `503 Service Unavailable`

Frontend handling:

- show a generic service-unavailable state
- do not ask the user to retry endlessly
- if the app has admin/debug mode, surface that the backend is missing configuration

#### 2. Supabase query failed

If the query fails for any backend/Supabase reason, the API returns:

```json
{
  "detail": "Failed to fetch checkpoints."
}
```

HTTP status:

- `502 Bad Gateway`

Frontend handling:

- show a generic fetch error
- allow manual retry
- do not expose technical internals to the user

#### 3. Network failure

If the backend cannot be reached at all, the frontend may see:

- fetch rejection
- timeout
- browser network error

Frontend handling:

- show offline/server-unreachable UI
- provide retry
- distinguish this from an empty result

---

## Frontend Error Handling Matrix

| Case | HTTP Status | JSON Shape | Recommended Frontend Action |
| --- | --- | --- | --- |
| Success with data | `200` | `{ "success": true, "data": [...] }` | Render results |
| Success with no rows | `200` | `{ "success": true, "data": [] }` | Render empty state |
| Supabase missing | `503` | `{ "detail": "Supabase is not configured on the server." }` | Show service unavailable |
| Supabase query error | `502` | `{ "detail": "Failed to fetch checkpoints." }` | Show fetch error and allow retry |
| Network unavailable | none | none | Show offline/server unreachable state |

---

## Recommended Frontend Fetch Flow

### 1. Send request

Call:

```text
GET /checkpoints/current-status
```

### 2. Check HTTP status

- if `response.ok` is `true`, parse JSON and render data
- if status is `503`, show backend configuration unavailable
- if status is `502`, show fetch failure
- if the request fails before a response arrives, show connectivity failure

### 3. Validate payload

For `200` responses, frontend should still confirm:

- `success === true`
- `data` is an array

If the payload shape is unexpected, treat it as a client-side contract issue and fall back to a safe error state.

---

## Example Frontend Pseudocode

```ts
const res = await fetch("/checkpoints/current-status");

if (!res.ok) {
  const err = await res.json().catch(() => null);
  throw new Error(err?.detail ?? "Failed to load checkpoints");
}

const payload = await res.json();

if (!payload?.success || !Array.isArray(payload?.data)) {
  throw new Error("Invalid checkpoints response");
}

return payload.data;
```

---

## Routing Structure

The current API structure is:

- [API/app.py](/home/ahmedjk34/Desktop/Work_Dev/Miscellaneous/mashwar-backend/API/app.py)
- [API/routes/checkpoints.py](/home/ahmedjk34/Desktop/Work_Dev/Miscellaneous/mashwar-backend/API/routes/checkpoints.py)
- [API/services/supabase_client.py](/home/ahmedjk34/Desktop/Work_Dev/Miscellaneous/mashwar-backend/API/services/supabase_client.py)
- [API/core/settings.py](/home/ahmedjk34/Desktop/Work_Dev/Miscellaneous/mashwar-backend/API/core/settings.py)

This means:

- HTTP endpoints live in route modules
- Supabase initialization stays in the service layer
- env loading stays in settings
- the app file only wires routes into FastAPI

That structure is intended to make future expansion easier for both backend and frontend teams.

---

## Future Route Convention

When new endpoints are added, the frontend should expect them to follow a similar structure:

- resource-based path names
- JSON response bodies
- consistent `success` + `data` shape for successful read endpoints
- standard HTTP errors for failures
- no sensitive internals in error payloads

Likely future routes may include:

- `GET /checkpoints/{id}`
- `GET /checkpoints/city/{city_name}`
- `GET /checkpoints/search`
- `GET /health/db`

If those appear later, this guide should be extended with the same level of detail.

---

## Local Run Command

From the repo root:

```bash
.venv/bin/uvicorn API.app:app --reload --host 0.0.0.0 --port 8000
```

---

## Local Test Command

```bash
curl http://127.0.0.1:8000/checkpoints/current-status
```

Expected success:

```json
{
  "success": true,
  "data": []
}
```

or a non-empty array of checkpoint objects.

---

## Notes For Frontend Teams

1. Treat the checkpoint endpoint as the source of truth for current checkpoint status.
2. Do not assume fields are non-null unless the UI explicitly requires them.
3. Do not assume all rows have coordinates.
4. Do not assume alert text is always present.
5. Distinguish between:
   - empty data
   - backend unavailable
   - Supabase query failure
   - network failure
6. Keep retry UI available, but avoid infinite automatic retries for `503` cases.

