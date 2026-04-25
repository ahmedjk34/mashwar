# Mashwar — AI-Powered Movement Intelligence for Palestine

**Product & technical specification (complete revision)**  
_Audience: engineers, judges, NGO operators, investors. Tone: precise, evidence-grounded, no filler._

---

## Executive summary (for non-technical judges)

Mashwar is a **movement intelligence platform for the West Bank** that answers a question ordinary maps cannot: _given checkpoints, restrictions, and volatile conditions, how can people and organizations move with the least avoidable delay, risk, and uncertainty?_ It combines **checkpoint geography** (`checkpoints.json`), **city anchors** (`cities.json`), **GraphHopper routing**, and a **Level 2 XGBoost model** that forecasts checkpoint status from historical and near-real-time signals. The product surfaces **live + predicted status**, **risk-aware route options**, **delay ranges (not single ETAs)**, **city- and region-level hardship**, **heatmaps**, and **plain-language AI insights**—with **explicit confidence** so the UI never pretends certainty where data is thin. Mashwar is designed first for **civilians, NGOs, journalists, and analysts** who need defensible, time-stamped intelligence—not a generic consumer map.

---

## Table of contents

1. [Problem statement](#1-problem-statement-human-stakes)
2. [Product definition & scope](#2-product-definition--scope)
3. [Users, use cases, and success criteria](#3-users-use-cases-and-success-criteria)
4. [Complete feature catalog](#4-complete-feature-catalog)
5. [End-to-end user flows (flow-first)](#5-end-to-end-user-flows-flow-first)
6. [System architecture](#6-system-architecture)
7. [Data model & file/API dependencies](#7-data-model--fileapi-dependencies)
8. [Scoring, metrics, and formulas](#8-scoring-metrics-and-formulas)
9. [AI / ML integration](#9-ai--ml-integration)
10. [Feasibility: live now, hackathon, production](#10-feasibility-live-now-hackathon-production)
11. [Security, privacy, ethics, and known limitations](#11-security-privacy-ethics-and-known-limitations)
12. [Presentation narrative](#12-presentation-narrative-pitch-demo-judge-criteria)

---

## 1. Problem statement (human stakes)

### 1.1 The situation (specific, not abstract)

In the West Bank, **movement is not primarily a shortest-path problem**. It is shaped by **checkpoints** and **access regimes** that can change behavior within hours: delays lengthen, lanes narrow, passage becomes selective, or movement is blocked entirely. Cities that are geographically close can become **operationally distant** when one or two corridor checkpoints degrade.

**Human stakes (concrete):**

| Stakeholder                 | What goes wrong when movement intel is wrong or absent                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Civilians**               | Missed medical appointments; children late to school; workers lose wages; families split across unpredictable windows.     |
| **Patients & caregivers**   | Time-sensitive care fails not only from distance but from **uncertain passage** at specific bottlenecks.                   |
| **NGOs / humanitarian**     | Field missions abort; perishable aid spoils; staff safety rises when routes are chosen on outdated assumptions.            |
| **Journalists**             | Reporting becomes anecdotal; teams cannot corroborate **where** friction spiked **when**, weakening public accountability. |
| **Analysts / policymakers** | Decisions rely IVEon impressions; there is no shared, time-stamped **hardship signal** comparable across cities and weeks. |

### 1.2 Why generic maps fail here

Consumer maps optimize **travel time under static road rules**. They do not maintain a **checkpoint state model**, do not forecast **partial closure patterns**, and do not expose **confidence intervals** on passage. Mashwar’s purpose is to supply **restriction-aware movement intelligence**: _what is likely to happen at bottleneck X in the next hours, and how does that change the sensible set of routes?_

### 1.3 What Mashwar promises (and what it does not)

| Promises                                                  | Non-promises                                             |
| --------------------------------------------------------- | -------------------------------------------------------- |
| Transparent **probabilities**, delays, and confidence     | “Guaranteed safe” routing (no such guarantee exists)     |
| **Decision support** for time, route, and corridor choice | Legal advice or authorization to cross any control point |
| **Audit-friendly** timestamps and metric definitions      | Perfect prediction under abrupt, unmodeled events        |
| Palestine-specific **checkpoint + city** layer            | Global navigation parity with Big Tech map stacks        |

---

## 2. Product definition & scope

### 2.1 What Mashwar is

**Mashwar** is an integrated system:

| Layer       | Role                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| **Data**    | Canonical checkpoint and city geometry/metadata; optional observation feeds; historical series.                       |
| **Routing** | GraphHopper produces baseline paths and travel times on OSM-derived graphs.                                           |
| **ML**      | Level 2 XGBoost predicts checkpoint status / friction; Level 1 rules aggregate and backstop when data is sparse.      |
| **Scoring** | Deterministic functions map predictions + graph metrics into **risk**, **delay bands**, **hardship**, **volatility**. |
| **Client**  | Next.js + MapLibre map application: layers, panels, comparisons, uncertainty UI.                                      |
| **API**     | FastAPI: orchestrates routing, fusion, scoring, caching, and read models for the UI.                                  |

### 2.2 Geographic and product scope (v1 vs later)

| Scope      | v1 (buildable core)                                       | Later                                                |
| ---------- | --------------------------------------------------------- | ---------------------------------------------------- |
| Geography  | West Bank checkpoint network + inter-city corridors       | Extend only with validated data + governance review  |
| Modes      | Private car / generic “driving” profile unless configured | Separate profiles (ambulance, goods) where justified |
| Real-time  | Polling + batch inference snapshots                       | Push/SMS/WhatsApp digest integrations                |
| Governance | Read-heavy public intelligence                            | Role-based org workspaces, mission logs              |

---

## 3. Users, use cases, and success criteria

### 3.1 Primary users

| User             | Primary jobs-to-be-done                                                              |
| ---------------- | ------------------------------------------------------------------------------------ |
| **Civilian**     | Pick departure window; compare 2–4 routes; understand delay range and worst-case.    |
| **NGO operator** | Plan corridor reliability for missions; export evidence; share internal brief links. |
| **Journalist**   | Verify claims against timestamped checkpoint forecasts and trends.                   |
| **Analyst**      | Compare city hardship week-over-week; attribute drivers to checkpoint clusters.      |

### 3.2 Measurable success criteria (examples)

| Metric              | Definition                                                             | Target direction                        |
| ------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| **Calibration**     | Predicted probabilities vs realized frequencies (reliability diagrams) | Improve with held-out weeks             |
| **Route stability** | % users who change choice when uncertainty is shown vs hidden          | Informed tradeoff, not panic            |
| **API p95 latency** | `/routes/plan` under nominal load                                      | < 2s hackathon; < 800ms prod with cache |
| **Explainability**  | Every score has inspectable contributors in UI                         | 100% for shipped metrics                |

---

## 4. Complete feature catalog

_Each feature below includes: **what**, **why**, **exact UX (step-by-step)**, **technical implementation** (frontend / backend / data / ML), and **AI/ML role**._

---

### Feature F1 — Smart routing with risk awareness

**What it does**  
Computes **multiple candidate routes** (GraphHopper), identifies **checkpoint exposure** along each geometry, attaches **ML-driven status/delay distributions**, and returns a **ranked set** with explicit **risk**, **delay band**, and **confidence**.

**Why it matters**  
Shortest-time routes can maximize exposure to **high volatility** bottlenecks. Risk-aware ranking aligns the product with how people actually choose movement under restrictions.

**Exact UX (step-by-step)**

1. User opens **Route** mode (or route bar is default).
2. User sets **Origin** and **Destination** via search (backed by `cities.json`) or map long-press.
3. Optional: **Depart at** time; default = now.
4. User clicks **Find routes**.
5. UI shows skeleton cards; map shows temporary “calculating” state.
6. Response returns **3–5 alternatives**; each card shows: label (`Fastest`, `Safer`, `Balanced`, …), **ETA range** (e.g. 42–68 min), **route risk 0–100**, **expected checkpoint delay** (single number + tooltip with distribution), **# checkpoints**, **confidence** badge.
7. Hover card → highlight polyline; dim others.
8. Click card → select route; open **segment breakdown** drawer listing each crossed checkpoint with contribution bars.
9. If GraphHopper or ML degraded → banner + still show best-effort geometry from corridor cache where possible.

**Technical implementation**

| Component                         | Responsibility                                                                                                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend (Next.js + MapLibre)** | Collect O/D, time, preferences; call `POST /api/v1/routes/plan`; render GeoJSON polylines; manage selection + hover; show uncertainty chrome (range ETA, badge).                                                                    |
| **Backend (FastAPI)**             | Validate coords against West Bank bounds; call `routing_service`; run `checkpoint_intersection` with buffered checkpoint footprints; call `checkpoint_state_service` for each id; run `risk_scoring_service`; cache keyed response. |
| **Data**                          | `API/data/checkpoints.json` for ids, lat/lng, metadata; `cities.json` for snap points; optional `corridors.geojson` fallback segments.                                                                                              |
| **ML**                            | Per-checkpoint class probabilities and horizon features feed **delay** and **risk**; entropy feeds **confidence** and route uncertainty surcharge.                                                                                  |

**AI/ML role**  
ML supplies **P(status)** and derived **E[delay]**; it does **not** draw the base road path—that is GraphHopper. ML changes **ranking** and **ETA band width**, not the existence of the road network.

---

### Feature F2 — Checkpoint live status + short-horizon prediction

**What it does**  
Shows **observed** (if any) and **predicted** checkpoint state for **now + next hours**, with **volatility** and **last updated** time.

**Why it matters**  
Decisions are made **forward in time**; historical averages alone mislead on volatile days.

**Exact UX (step-by-step)**

1. Map loads checkpoint markers from bootstrap or `GET /api/v1/checkpoints`.
2. Marker color = **dominant predicted state** (or observed if fresher).
3. Marker ring style = **confidence** (solid / dashed).
4. Tap/click marker → bottom sheet (mobile) or side panel (desktop).
5. Panel tabs: **Now**, **Forecast (1–6h)**, **About** (static metadata).
6. Forecast shows hourly chips with probabilities mini-bar; volatility label.
7. User can tap **Refresh** (forces revalidate, respects rate limits).
8. Optional: **Watch checkpoint** toggle (hackathon: local reminder only; prod: notifications).

**Technical implementation**

| Component    | Implementation detail                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend** | SWR/React Query with `staleTime` 60–120s; ETag support; optimistic show cached marker while revalidating.                                         |
| **Backend**  | `GET /api/v1/checkpoints` list view; `GET /api/v1/checkpoints/{id}` detail; fusion order: fresh observation > model snapshot > Level 1 heuristic. |
| **Data**     | Static: `checkpoints.json`; Dynamic: `checkpoint_predictions` table or artifact from batch job; Observations: optional ingest table.              |
| **ML**       | XGBoost inference outputs stored per `(checkpoint_id, horizon, as_of)`; served read-only for scale.                                               |

**AI/ML role**  
Primary signal for **forecast tab**; **Level 1** fills gaps and sets conservative UI when model confidence is low.

---

### Feature F3 — Movement hardship index (city + region)

**What it does**  
A **0–100** index summarizing **how hard movement is** from/to a city vs a baseline period, combining **accessibility loss**, **delay burden**, **risk**, and **volatility**.

**Why it matters**  
NGOs and analysts need **macro** indicators; civilians benefit from “**which areas are systemically stressed this week**.”

**Exact UX (step-by-step)**

1. User toggles **Hardship** layer in layer control.
2. Map shades **city centers** (or polygons if available) by quintile.
3. Side list: **Rising / falling** cities vs yesterday or vs 7d median.
4. Click city → panel with **sparkline**, **driver breakdown** (which corridors/checkpoints moved the index).
5. Toggle comparison window: **Today / 7d / 30d**.

**Technical implementation**

| Component    | Implementation detail                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| **Frontend** | `GET /api/v1/hardship/cities?window=…&compare=…`; MapLibre `circle-color` or `fill-color` data-driven styling. |
| **Backend**  | `hardship_aggregation_service` reads precomputed `city_hardship_snapshots` (materialized by job).              |
| **Data**     | `cities.json` ids; graph of canonical OD pairs; checkpoint predictions time series.                            |
| **ML**       | Predictions feed **expected delay** and **closure probability mass** used in hardship sub-scores.              |

**AI/ML role**  
Hardship is **not** a separate black-box model in v1; it is a **deterministic aggregate** of ML-derived per-checkpoint expectations plus graph metrics—this keeps it explainable.

---

### Feature F4 — Heatmap: risk / delay / volatility

**What it does**  
Spatial field: intensity reflects **combined checkpoint influence** on surrounding road network, per chosen **mode** and **forecast horizon**.

**Why it matters**  
Operators grasp **spatial concentration** of stress faster than a list of markers.

**Exact UX (step-by-step)**

1. User enables **Heatmap**.
2. Chooses **Metric**: Risk / Delay / Volatility.
3. Chooses **Time**: Now, +1h, +3h, +6h.
4. Adjusts **Opacity** slider.
5. Pans/zooms map; tiles load; legend updates percentiles for **current viewport** (or fixed global legend—product choice; spec recommends **viewport-adaptive legend** for honesty).
6. Turning heatmap on does not disable markers; z-order: heatmap below routes above.

**Technical implementation**

| Component    | Implementation detail                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend** | MapLibre raster or vector tile source: `GET /api/v1/map/tiles/{z}/{x}/{y}?layer=…&horizon=…`.                                                |
| **Backend**  | `tile_service` generates value = Σ kernel(checkpoint_i) \* metric_i; precompute in job for hackathon scale; on-demand for small bbox in dev. |
| **Data**     | Checkpoint coordinates + computed metric snapshot id.                                                                                        |
| **ML**       | Metrics at each checkpoint are ML-informed; spatial blending is **not** ML—it is a transparent kernel.                                       |

**AI/ML role**  
ML sets **checkpoint-level intensities**; heatmap is **spatial aggregation** for cognition, not a second predictive model.

---

### Feature F5 — Checkpoint detail panel (deep profile)

**What it does**  
Single place for **metadata**, **forecast**, **history**, **corridor links**, and **comparables**.

**Why it matters**  
NGOs and journalists need **defensible detail**: what the model saw, when, and what changed.

**Exact UX (step-by-step)**

1. From marker → **Open details**.
2. Sections appear progressively (lazy): **Summary**, **Forecast chart**, **History**, **Corridors**, **Nearby**.
3. **History** default: last 14d hourly aggregation; dropdown 30d / 7d.
4. **Export snapshot** (prod): PNG + JSON snippet of current panel state.

**Technical implementation**

| Component    | Implementation detail                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| **Frontend** | Code-split chart library; parallel `GET …/forecast` + `GET …/history` after shell render.                |
| **Backend**  | `GET /api/v1/checkpoints/{id}` aggregates static + latest prediction row + small rollups.                |
| **Data**     | Static fields from JSON; time series from warehouse/parquet rollups in hackathon MVP.                    |
| **ML**       | Forecast section reads inference artifact; history can show **observed** vs **predicted** if both exist. |

**AI/ML role**  
Explainability: return **top feature contributions** if SHAP is computed offline and stored compactly (prod); hackathon can omit SHAP and still show **probability bars**.

---

### Feature F6 — Best time to travel (checkpoint-scoped and route-scoped)

**What it does**  
Scans upcoming time buckets; recommends **windows** minimizing a weighted objective (delay + risk − reliability bonus), subject to minimum confidence.

**Why it matters**  
Many users can shift departure **1–2 hours**; that shift can dominate route choice.

**Exact UX (step-by-step)**

1. User selects a **route** OR stays on checkpoint detail.
2. Clicks **Best times**.
3. UI shows ranked windows: start–end, **score**, **why** (2 bullet reasons: e.g. “Checkpoint A closure prob drops 12:00–14:00”).
4. If no window passes confidence threshold → explicit **“no high-confidence window”** state with conservative guidance.

**Technical implementation**

| Component    | Implementation detail                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Frontend** | `GET /api/v1/routes/{route_id}/best-time?horizon_hours=12` or `GET /api/v1/checkpoints/{id}/best-time`.                      |
| **Backend**  | Pre-fetch prediction slices per time bucket (from stored multi-horizon inference or re-run lightweight model if latency OK). |
| **Data**     | Historical hour-of-week patterns + live snapshot.                                                                            |
| **ML**       | Same model outputs; scanning is **orchestration**, not retraining.                                                           |

**AI/ML role**  
Uses **horizon-specific** or interpolated predictions; confidence gates prevent over-selling a narrow window.

---

### Feature F7 — Route comparison (multi-criteria, preference-aware)

**What it does**  
Side-by-side matrix for **2–3 routes** with user-adjustable weights for delay vs risk vs reliability.

**Why it matters**  
Different orgs **legitimately disagree** on weights; the product should make tradeoffs legible.

**Exact UX (step-by-step)**

1. After `routes/plan`, user checks **Compare** on 2–3 cards.
2. Opens **Compare** drawer.
3. Moves sliders; ranking updates **live** (client sort) with optional **server tie-break** for sharing.
4. “Why ranked first” text lists **top 3 contributors** across checkpoints.

**Technical implementation**

| Component    | Implementation detail                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Frontend** | Stores full metrics vector per route from plan response; sliders map to weights `w_delay`, `w_risk`, `w_uncert`.              |
| **Backend**  | Optional `POST /api/v1/routes/compare/snapshots` persists shareable state (id + weights + route hashes).                      |
| **Data**     | None beyond plan payload.                                                                                                     |
| **ML**       | Reliability score derived from **1 − normalized entropy** at crossed checkpoints, optionally damped by observation freshness. |

**AI/ML role**  
Supplies per-checkpoint **probabilities** that define delay distribution and entropy-based reliability.

---

### Feature F8 — Corridor network layer (`corridors.geojson`)

**What it does**  
Precomputed **canonical inter-city** polylines with **reliability class** and summary stats—serves UX and **resilience** when ad-hoc routing fails.

**Why it matters**  
Strategic view + **fallback** paths when OSM coverage or GraphHopper is weak for certain edges.

**Exact UX (step-by-step)**

1. Toggle **Corridors**.
2. Lines appear between major pairs; color = reliability.
3. Click line → mini panel: **median delay**, **volatility**, **checkpoints touched**, **last computed**.
4. If user plans route along corridor geometry, mark as **canonical path** in explain drawer.

**Technical implementation**

| Component    | Implementation detail                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| **Frontend** | GeoJSON source layer; click hit-testing.                                                             |
| **Backend**  | `GET /api/v1/corridors` returns features + metrics; static file served from CDN in prod.             |
| **Data**     | Generated offline: GraphHopper between city centers in `cities.json`; versioned `corridors.geojson`. |
| **ML**       | Enriches each corridor with **rolling reliability** from constituent checkpoint predictions.         |

**AI/ML role**  
Turns static geometry into a **live reliability overlay** without recomputing full routing for every pan.

---

### Feature F9 — Uncertainty visualization (confidence-first UI)

**What it does**  
Every predictive surface shows **confidence**, **entropy**, or **staleness**; routes show **ETA bands**.

**Why it matters**  
False precision erodes trust and can cause harmful decisions.

**Exact UX (step-by-step)**

1. Any predicted label shows **confidence** chip (High/Med/Low) with tooltip definition.
2. Routes never show a single minute without **range** unless user explicitly toggles **“simple mode”** (still shows disclaimer).
3. Map banner when **global model age** > threshold.
4. Toggle **Prefer high-confidence routes** changes ranking weights (increases penalty on entropy and staleness).

**Technical implementation**

| Component    | Implementation detail                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Frontend** | Central `UncertaintyBadge` component; consistent thresholds from server config `GET /bootstrap` includes `thresholds` object. |
| **Backend**  | Emits `model_as_of`, `data_freshness_seconds`, per-entity `confidence`.                                                       |
| **ML**       | Calibration + entropy; see §9.                                                                                                |

**AI/ML role**  
Supplies **probability vectors** and calibration metadata consumed by UI tokens.

---

### Feature F10 — Historical trends (checkpoint / city / corridor)

**What it does**  
Time-series views with comparisons and export hooks.

**Why it matters**  
Journalists and analysts need **evidence**, not vibes.

**Exact UX (step-by-step)**

1. In checkpoint detail → **History** tab.
2. Choose granularity: hour / day / week.
3. Choose compare baseline.
4. Chart shows **observed** (if available) overlaid with **model backtest** (prod only if validated).
5. **Export** CSV/PNG (prod).

**Technical implementation**

| Component    | Implementation detail                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------- |
| **Frontend** | Downsampled series for chart performance.                                                          |
| **Backend**  | `GET /api/v1/checkpoints/{id}/history?from=&to=&granularity=`; similar for city/corridor ids.      |
| **Data**     | Partitioned time-series store.                                                                     |
| **ML**       | Optional **offline** evaluation overlays; not required for hackathon MVP beyond simple aggregates. |

**AI/ML role**  
Primarily **measurement + aggregation**; ML evaluation is a **governance** layer in production.

---

### Feature F11 — AI insights layer (situation summaries)

**What it does**  
Short, **templated** (v1) or **LLM-polished** (later) narratives when metrics cross thresholds: e.g. regional deterioration, corridor divergence.

**Why it matters**  
Executives and civilians often start from **language**, not maps.

**Exact UX (step-by-step)**

1. Top-of-home **Insights strip**: 1–3 cards max.
2. Each card: headline, geography tags, **confidence**, **as_of**, deep link “**Show on map**”.
3. Refresh on timer or manual pull.

**Technical implementation**

| Component    | Implementation detail                                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend** | `GET /api/v1/insights`; renders cards; deep links set map bounds + layer toggles via URL state.                                                                            |
| **Backend**  | `insight_service` runs rule engine on latest aggregates; caches result 5–15 min.                                                                                           |
| **Data**     | Reads hardship snapshots + top checkpoint deltas.                                                                                                                          |
| **ML**       | ML does not hallucinate text in v1; text is **tied to measured triggers**. Optional LLM rephrase must cite **metric ids** and refuse if missing context (prod guardrails). |

**AI/ML role**  
Insights are **derived from ML-informed metrics**, not free-form prediction of events.

---

### Feature F12 — System health & provenance (cross-cutting)

**What it does**  
Surfaces **which subsystem** is fresh: routing, predictions, observations, tiles.

**Why it matters**  
Credible intelligence products show **provenance**.

**Exact UX**  
Footer or “i” panel: GraphHopper status, model version, data timestamp, tile age.

**Technical**  
`GET /api/v1/health` returns component checks; `bootstrap` embeds user-facing subset.

---

## 5. End-to-end user flows (flow-first)

_Format for each flow: **numbered steps** with **User action → Frontend → API → Backend logic → ML → Response rendered**._

### Flow 5.1 — Cold start: open app → map ready

| Step | User action | Frontend                                                | API                                            | Backend logic                                                                                     | ML                                                                            | Response rendered                 |
| ---- | ----------- | ------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------- |
| 1    | Opens URL   | Loads shell, map style, shows skeleton                  | `GET /api/v1/bootstrap`                        | Assembles: city list, checkpoint summaries, thresholds, model `as_of`, optional hardship headline | Reads latest prediction snapshot ids per checkpoint (no on-request inference) | Markers + cities + insights strip |
| 2    | Waits       | SWR marks fresh                                         | —                                              | If ETag match → 304                                                                               | —                                                                             | Silent no-op                      |
| 3    | Pan map     | Requests nothing extra until bbox-driven layers enabled | optional `GET /checkpoints?bbox=` if list huge | Filters server-side                                                                               | —                                                                             | Marker virtualization             |

### Flow 5.2 — Plan route A → B

| Step | User action                             | Frontend                                  | API                                                                 | Backend logic                                                                                | ML                                                                            | Response rendered                    |
| ---- | --------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| 1    | Chooses Ramallah → Nablus, depart 09:30 | Validates ids/coords                      | `POST /api/v1/routes/plan` body: `{origin, dest, depart_at, prefs}` | Calls GraphHopper alternatives; normalizes polylines; intersects buffers with checkpoint set | Fetches per-checkpoint `P(open), P(partial), P(closed)` for relevant horizons | Cards + polylines                    |
| 2    | Hovers “Safer” card                     | Local highlight                           | —                                                                   | —                                                                                            | —                                                                             | Polyline emphasis                    |
| 3    | Clicks card                             | Sets `selectedRouteId`                    | `GET /api/v1/routes/{id}/explain`                                   | Builds per-segment contributor list                                                          | Uses same snapshot; optional SHAP if stored                                   | Drawer with checkpoint contributions |
| 4    | Toggles “Prefer high-confidence”        | Re-sorts client OR re-call plan with flag | `POST …/plan` with `ranking_mode=confidence_first`                  | Recomputes weights                                                                           | Same preds, different weighting                                               | Reordered cards                      |

### Flow 5.3 — Checkpoint click → forecast

| Step | User action             | Frontend                 | API                                           | Backend logic                              | ML                 | Response rendered    |
| ---- | ----------------------- | ------------------------ | --------------------------------------------- | ------------------------------------------ | ------------------ | -------------------- |
| 1    | Clicks marker           | Opens popover from cache | `GET /api/v1/checkpoints/{id}` + `…/forecast` | Merge observation vs model freshness rules | Loads horizon rows | Hourly forecast bars |
| 2    | Switches tab to History | Lazy mount chart         | `GET /api/v1/checkpoints/{id}/history?…`      | DB/query rollups                           | —                  | Line chart           |

### Flow 5.4 — Enable heatmap

| Step | User action              | Frontend           | API                         | Backend logic         | ML                               | Response rendered    |
| ---- | ------------------------ | ------------------ | --------------------------- | --------------------- | -------------------------------- | -------------------- |
| 1    | Toggles heatmap Risk +3h | Adds raster source | Tile requests `{z}/{x}/{y}` | Cache lookup / render | Checkpoint metrics from snapshot | Color field + legend |

### Flow 5.5 — Hardship mode

| Step | User action      | Frontend              | API                                                       | Backend logic   | ML                                          | Response rendered   |
| ---- | ---------------- | --------------------- | --------------------------------------------------------- | --------------- | ------------------------------------------- | ------------------- |
| 1    | Toggles Hardship | Clears route overlays | `GET /api/v1/hardship/cities?window=7d&compare=yesterday` | Reads snapshots | Snapshots already include ML-derived inputs | City shading + list |

### Flow 5.6 — Best time for selected route

| Step | User action                    | Frontend | API                                                  | Backend logic                                                        | ML                                                      | Response rendered        |
| ---- | ------------------------------ | -------- | ---------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------ |
| 1    | Clicks **Best times** on route | Spinner  | `GET /api/v1/routes/{id}/best-time?horizon_hours=12` | For each 30-min slot, recompute route score using interpolated preds | Uses stored per-horizon outputs or interpolation policy | Ranked windows + reasons |

### Flow 5.7 — Corridor toggle + drill-in

| Step | User action       | Frontend     | API                                   | Backend logic | ML                               | Response rendered |
| ---- | ----------------- | ------------ | ------------------------------------- | ------------- | -------------------------------- | ----------------- |
| 1    | Enables corridors | Adds GeoJSON | `GET /api/v1/corridors`               | Join metrics  | Rolling metrics from checkpoints | Styled lines      |
| 2    | Clicks corridor   | Panel        | same payload or `GET /corridors/{id}` | —             | —                                | Stats             |

### Flow 5.8 — Insights refresh

| Step | User action   | Frontend              | API                    | Backend logic             | ML       | Response rendered |
| ---- | ------------- | --------------------- | ---------------------- | ------------------------- | -------- | ----------------- |
| 1    | Lands on home | Shows cached insights | `GET /api/v1/insights` | Rule engine on aggregates | Indirect | Cards             |

---

## 6. System architecture

### 6.1 High-level diagram (text)

```
[cities.json] [checkpoints.json]     [observations ingest*]
        \            |                      /
         v           v                     v
    [FastAPI]  <---  [checkpoint_state_service]  <--- [prediction_store]
        |                      ^
        |                      | batch/scheduled
        v                      v
   [routing_service] --> [GraphHopper]          [predict_job: XGBoost L2]
        |
        v
 [risk_scoring_service] --> [route/hardship metrics]
        |
        +----> [Redis/cache] ----> [Next.js + MapLibre client]
        |
        +----> [tile_service] ---> [heatmap tiles]

* observations optional in hackathon; design assumes future feed.
```

### 6.2 Backend services (logical modules)

| Service                        | Responsibilities                                   | Upstream deps                     | Downstream consumers                      |
| ------------------------------ | -------------------------------------------------- | --------------------------------- | ----------------------------------------- |
| `routing_service`              | GH requests, polyline decode, alternatives, errors | GraphHopper                       | `risk_scoring_service`, responses         |
| `checkpoint_state_service`     | Fusion rules, staleness, normalization             | JSON + predictions + observations | all user-facing checkpoint/route features |
| `risk_scoring_service`         | Risk, route score, delay bands, reliability        | routing + checkpoint state        | API DTOs                                  |
| `hardship_aggregation_service` | City/region rollups                                | predictions + OD graph            | `/hardship/*`                             |
| `tile_service`                 | Tile math, caching                                 | checkpoint metrics                | map                                       |
| `insight_service`              | Threshold rules, templates                         | hardship + top deltas             | `/insights`                               |

### 6.3 HTTP API (explicit catalog)

| Method | Path                                  | Purpose                      | Typical response shape                                  |
| ------ | ------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| GET    | `/api/v1/health`                      | Liveness + dependency status | `{status, components:{gh,db,redis,model}}`              |
| GET    | `/api/v1/bootstrap`                   | One-call client init         | cities, checkpoints summary, thresholds, model metadata |
| GET    | `/api/v1/checkpoints`                 | List/filter markers          | `[{id, lat, lng, label, state, confidence, as_of}]`     |
| GET    | `/api/v1/checkpoints/{id}`            | Detail fusion                | static + dynamic + provenance                           |
| GET    | `/api/v1/checkpoints/{id}/forecast`   | Horizons                     | hourly buckets with probs                               |
| GET    | `/api/v1/checkpoints/{id}/history`    | Series                       | downsampled points                                      |
| GET    | `/api/v1/checkpoints/{id}/best-time`  | Windows                      | ranked slots + reasons                                  |
| POST   | `/api/v1/routes/plan`                 | O/D planning                 | ranked routes + metrics vectors                         |
| GET    | `/api/v1/routes/{route_id}/explain`   | Contributors                 | per-checkpoint breakdown                                |
| GET    | `/api/v1/routes/{route_id}/best-time` | Route windows                | ranked slots                                            |
| POST   | `/api/v1/routes/compare/snapshots`    | Share/compare                | `{snapshot_id}`                                         |
| GET    | `/api/v1/hardship/cities`             | City index                   | scores + deltas                                         |
| GET    | `/api/v1/hardship/regions`            | Region rollups               | optional                                                |
| GET    | `/api/v1/corridors`                   | Network overlay              | GeoJSON + metrics                                       |
| GET    | `/api/v1/insights`                    | Narrative cards              | structured text + links                                 |
| GET    | `/api/v1/map/tiles/{z}/{x}/{y}`       | Heatmap                      | raster/vector tile                                      |

_Version prefix `/api/v1` keeps contract stability as the stack matures._

### 6.4 Frontend structure (recommended)

| Area                  | Responsibility                                                               |
| --------------------- | ---------------------------------------------------------------------------- |
| `app/` routes         | Page shells: `/`, `/explore`, optional `/reports`                            |
| `components/map/*`    | MapLibre instance, sources, layers, hit tests                                |
| `components/panels/*` | Checkpoint drawer, route drawer, compare                                     |
| `lib/api/*`           | Typed fetchers, Zod validation of DTOs                                       |
| `lib/state/*`         | URL-synced query params (shareable links), UI preferences                    |
| `lib/metrics/*`       | Client-side sorting helpers (compare), never silent math hiding server truth |

**State management**  
Server state: **TanStack Query** or **SWR**. Map state: small **Zustand** slice or React context for `selectedCheckpointId`, `selectedRouteId`, `layers`. URL: `?o=&d=&t=&layers=` for demo deep links.

### 6.5 ML pipeline & serving

| Stage      | Hackathon MVP                                   | Production                               |
| ---------- | ----------------------------------------------- | ---------------------------------------- |
| Training   | Offline notebook / pipeline; versioned artifact | Scheduled retrain, drift monitoring      |
| Inference  | Batch job writes `predictions` table            | Batch + triggered on observation burst   |
| Serving    | API read-only from store                        | Same + canary model routing              |
| Evaluation | Manual backtest                                 | Automated reports + calibration tracking |

### 6.6 Caching strategy (keys + TTL guidance)

| Key pattern                    | TTL       | Invalidation                     |
| ------------------------------ | --------- | -------------------------------- |
| `checkpoint:state:{id}`        | 2–5 min   | new observation or new snapshot  |
| `route:plan:{hash}`            | 10–20 min | time bucket change, prefs change |
| `tile:{layer}:{h}:{z}:{x}:{y}` | 15–60 min | new snapshot id                  |
| `hardship:city:{window}`       | 1–6 h     | aggregate job                    |
| `insights:latest`              | 5–15 min  | insight job                      |

**ETag** on list endpoints; **stale-while-revalidate** in client.

### 6.7 Background jobs

| Job              | Cadence                | Output                      |
| ---------------- | ---------------------- | --------------------------- |
| `ingest_job`     | 1–5 min if feeds exist | normalized observations     |
| `predict_job`    | 10–60 min              | `predictions` snapshot      |
| `aggregate_job`  | 1–6 h                  | hardship + corridor metrics |
| `tile_build_job` | 15–60 min              | tile cache                  |
| `insight_job`    | 5–15 min               | `/insights` payload         |

---

## 7. Data model & file/API dependencies

### 7.1 Static files (repo / deployment)

| Asset                           | Contents                    | Used by                             |
| ------------------------------- | --------------------------- | ----------------------------------- |
| `API/data/checkpoints.json`     | id, name, lat/lng, metadata | map markers, intersection, panels   |
| `API/data/cities.json`          | id, label, center lat/lng   | search, OD snap, corridor endpoints |
| `corridors.geojson` (generated) | LineString features + props | overlay + routing fallback          |

### 7.2 Dynamic tables (conceptual)

| Table                     | Grain                                                    | Notes                 |
| ------------------------- | -------------------------------------------------------- | --------------------- |
| `checkpoint_observations` | `(checkpoint_id, ts, observed_state, source, quality)`   | optional at hackathon |
| `checkpoint_predictions`  | `(checkpoint_id, horizon, as_of, probs…, model_version)` | required for ML UI    |
| `city_hardship_snapshots` | `(city_id, window, ts, components…)`                     | precomputed           |
| `corridor_metrics`        | `(corridor_id, ts, stats…)`                              | precomputed           |

---

## 8. Scoring, metrics, and formulas

_All outputs are **bounded** and **documented** in API responses so third parties can audit._

### 8.1 Notation

| Symbol          | Meaning                                                   |
| --------------- | --------------------------------------------------------- |
| `P_o, P_p, P_c` | Model probabilities for open / partial / closed           |
| `H`             | Shannon entropy of `(P_o,P_p,P_c)`                        |
| `V`             | Volatility score from recent observed transitions (0–1)   |
| `F`             | Freshness factor in (0,1], decays with age of best signal |
| `K`             | Checkpoint criticality weight (≥1)                        |
| `w_i`           | Exposure weight for checkpoint i along route              |

### 8.2 Expected severity (checkpoint)

`S = 0·P_o + 0.6·P_p + 1.0·P_c`  
_(0.6 is a tunable constant reflecting that “partial” is materially worse than “open” but not full closure; must be validated against labeled outcomes.)_

### 8.3 Volatility adjustment

Let `V` be normalized transition rate last 24–72h.  
`VolAdj = 1 + α·V` with `α` in `[0.2,0.6]` (tunable).

### 8.4 Confidence adjustment (conservative)

Let `H_max = log2(3)` for 3 classes. Define `c = 1 − H/H_max` (calibration may replace raw probs first).  
`ConfAdj = 1 + β·(1 − c)` with `β` small (e.g. 0.15) **increases** risk when confidence is low.

### 8.5 Checkpoint risk (0–100)

`Raw = 100 · S · VolAdj · K · ConfAdj · (1/F_if_stale)`  
`CheckpointRisk = clamp(0, 100, Raw)`  
Where `F_if_stale` gently increases risk if last observation/model is older than policy thresholds.

**Inputs:** probabilities, entropy, volatility, criticality, freshness.  
**Output:** single scalar + optional breakdown object in JSON.

### 8.6 Exposure weights along route

For each checkpoint i intersecting buffered corridor:  
`w_i = (time_in_buffer_i / T_route) · g(distance_to_polyline_i)`  
where `g` is a kernel decreasing with distance (e.g. triangular or Gaussian).

### 8.7 Route risk (0–100)

`RouteRiskRaw = Σ_i w_i · CheckpointRisk_i + λ_u · U_route`  
`U_route = mean(H_i normalized)` entropy penalty across touched checkpoints.  
`RouteRisk = clamp(0, 100, normalize(RouteRiskRaw))`  
Normalization can be percentile vs daily distribution of random OD samples (prod) or fixed scale (hackathon).

### 8.8 Delay estimation

Per checkpoint state-delay table (empirical or expert-seeded):  
`E[D_i] = P_o·d_o + P_p·d_p + P_c·d_c`  
`ETA_expected = T_baseline + Σ_i E[D_i] + Σ_pairs ρ_ij · min(E[D_i],E[D_j])`  
where `ρ_ij` is small interaction term if checkpoints are **sequentially close** (optional).

**Percentile band (display)**  
If variance model unknown:  
`ETA_low = T_baseline + Σ quantile_25(D_i)`  
`ETA_high = T_baseline + Σ quantile_90(D_i)`  
using bootstrapped draws from categorical state per checkpoint (cheap Monte Carlo, e.g. 200 samples).

**Inputs:** GH baseline `T_baseline`, probabilities, delay table.  
**Output:** `{expected, p25, p90}` minutes.

### 8.9 Reliability (0–1)

`Reliability = clamp(0,1, 1 − norm(H) ) · F`  
Used in compare sliders and corridor summaries.

### 8.10 Hardship index (city, 0–100)

Component scores in `[0,100]` after monotonic normalization:

| Component           | Meaning (intuition)                              |
| ------------------- | ------------------------------------------------ |
| `AccessibilityLoss` | Share of key OD corridors in “stressed/critical” |
| `DelayBurden`       | Expected extra minutes vs rolling baseline       |
| `RiskBurden`        | Mean route risk to hub destinations              |
| `VolatilityBurden`  | Mean volatility across connected checkpoints     |

`HardshipCity = 0.35·A + 0.30·D + 0.20·R + 0.15·V`  
Weights are **policy constants**; ship with sensitivity analysis in docs.

**Region hardship**  
`HardshipRegion = Σ_c pop_c · HardshipCity_c / Σ pop` (or NGO-weighted importance vector if population data incomplete—document chosen weighting).

---

## 9. AI / ML integration

### 9.1 What the model predicts

| Output    | Description                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| Primary   | Discrete checkpoint status class at defined horizons (e.g. +1h,+3h,+6h) or single next-step depending on training schema |
| Secondary | Class probabilities `P_o,P_p,P_c` per horizon                                                                            |
| Meta      | `model_version`, `as_of`, optional SHAP top-k                                                                            |

### 9.2 How predictions flow through the system

1. **Offline / scheduled**: `predict_job` loads features, runs XGBoost, writes `checkpoint_predictions`.
2. **Online**: FastAPI **never blocks** on heavy inference in hackathon mode; it reads latest rows.
3. **Fusion**: `checkpoint_state_service` chooses observed vs predicted based on **freshness and source quality**.
4. **Consumption**: routing + scoring + tiles + insights all read the same snapshot for a given `as_of` to avoid inconsistent UI.

### 9.3 Uncertainty handling (explicit)

| Mechanism               | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| **Probability entropy** | Detect flat / unsure distributions                                      |
| **Calibration**         | Map raw scores to observed rates (isotonic / Platt on validation split) |
| **Staleness decay**     | Reduce trust in old snapshots                                           |
| **Level 1 fallback**    | Historical hour-of-week + recent mean when model confidence low         |
| **UI gating**           | Do not emit “best time” narrow peaks below confidence threshold         |

### 9.4 Where AI adds value a static system cannot

| Static-only                   | ML-enabled                                                         |
| ----------------------------- | ------------------------------------------------------------------ |
| “Yesterday at this hour was…” | “**Next hours** lean toward partial/closed given recent patterns.” |
| Fixed delay assumptions       | **State-dependent** delay expectations                             |
| Single ETA                    | **Bands** driven by categorical uncertainty                        |
| Manual bulletins              | **Continuous refresh** at checkpoint scale                         |

---

## 10. Feasibility: live now, hackathon, production

### 10.1 What is “live now” (aligned with stated repo assets)

| Asset / capability                | Typical status                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `checkpoints.json`, `cities.json` | Present as design inputs                                                                         |
| FastAPI backend                   | Core orchestration layer                                                                         |
| Next.js + MapLibre frontend       | Map UX                                                                                           |
| GraphHopper integration           | Baseline routing                                                                                 |
| XGBoost Level 2 model             | Checkpoint status prediction (offline artifact + batch inference assumed unless otherwise wired) |

_Exact wiring (env vars, GH URL, prediction store) should be documented in `README.md` / `API_GUIDE.md` separately; this spec defines the **intended contract**._

### 10.2 Hackathon-scoped (deliberate constraints)

| Area           | Hackathon choice                        | Risk accepted                                 |
| -------------- | --------------------------------------- | --------------------------------------------- |
| Auth           | Public read-only                        | No org tenancy                                |
| Data freshness | Batch predictions every N minutes       | Slower reaction                               |
| Heatmap        | Pre-baked tiles for demo bbox           | Less global flexibility                       |
| Observations   | Sparse or mocked                        | Fusion less impressive but architecture ready |
| LLM insights   | **Off** or demo-only with fixed strings | Avoid hallucination liability                 |

### 10.3 Production roadmap (12 months, realistic)

| Quarter | Deliverable                                                                                |
| ------- | ------------------------------------------------------------------------------------------ |
| Q1      | Hardening: auth, rate limits, observability, SLA on `/routes/plan`, calibration dashboards |
| Q2      | Observation ingestion + source scoring; incident hooks; SHAP-lite explainability           |
| Q3      | Org workspaces, mission planner, exports, audit logs                                       |
| Q4      | Multi-profile routing, richer evaluation, partnerships for verified feeds                  |

### 10.4 Real constraints (honest)

| Constraint                      | Implication                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **OSM completeness**            | Rural or newly changed roads may mismatch reality; corridors + disclaimers required                                                        |
| **Sensitive security dynamics** | Product must avoid tactical real-time instructions that endanger users; focus on **civilian movement intelligence** with clear limitations |
| **Data access**                 | Model quality capped by observation quality; invest in **governance** not only model capacity                                              |
| **Single graph profile**        | Ambulance / VIP / permit-based movement not modeled without explicit policy work                                                           |

---

## 11. Security, privacy, ethics, and known limitations

| Topic           | Policy                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Privacy**     | Minimize PII; avoid storing user routes unless opt-in; hash IPs in logs (prod).                                  |
| **Abuse**       | Rate limit tile + plan endpoints; captcha if public (prod).                                                      |
| **Ethics**      | No weaponization claims; no certainty language; show provenance and confidence.                                  |
| **Limitations** | Predictions are probabilistic; users must comply with law and local orders; Mashwar informs, does not authorize. |

---

## 12. Presentation narrative (pitch, demo, judge criteria)

### 12.1 Human story (30-second opener)

> A parent needs to cross two checkpoints to reach a hospital appointment. The map says forty minutes. The reality is a **range** that depends on lanes, inspections, and volatility that changes through the morning. Mashwar does not replace judgment—but it **replaces guesswork with structured intelligence**: which corridor is **less uncertain right now**, what window **improves odds**, and what the system **does not know** honestly enough to show.

### 12.2 Demo flow (8–10 minutes, judge-safe)

1. **Map**: West Bank cities + checkpoints load from real project data.
2. **Checkpoint**: click one → show **status + forecast + confidence**.
3. **Route**: Ramallah → Nablus → show **3 alternatives** with **ETA band** and **risk**.
4. **Explain**: open contributors → tie numbers to **specific checkpoints**.
5. **Hardship**: toggle city stress → show **macro** view.
6. **Heatmap**: risk +3h → show **spatial** concentration.
7. **Insights**: one card with **metric-backed** language + deep link.
8. **Close**: health/provenance footer → “here is model time, graph time, data limits.”

### 12.3 Key messages by judge criterion

| Criterion          | Message                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| **Impact**         | Directly addresses **daily movement friction** under restrictions; humanitarian and civilian relevance.   |
| **Innovation**     | **Uncertainty-first** routing + checkpoint ML + corridor resilience—not a generic map clone.              |
| **Feasibility**    | Built on **proven stack** (FastAPI, Next.js, GraphHopper, XGBoost) with a clear **batch inference** path. |
| **Scale / vision** | Roadmap to **org workspaces**, richer feeds, and longitudinal **hardship evidence** for NGOs/media.       |
| **Trust**          | Explicit **confidence**, **staleness**, and **formula transparency** in API and UI.                       |

---

## Document control

| Field            | Value                                                   |
| ---------------- | ------------------------------------------------------- |
| **Product name** | Mashwar                                                 |
| **Doc type**     | Product + technical specification                       |
| **Revision**     | Major rewrite: flow-first, judge/engineer dual audience |
| **Location**     | `docs/mashwar-product-technical-spec.md`                |

---

_End of specification._
