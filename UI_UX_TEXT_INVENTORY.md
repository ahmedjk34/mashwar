# Mashwar — UI/UX hardcoded text & backend→UI mapping

**Generated:** 2026-04-24  
**Scope:** All user-visible or assistive (ARIA) string literals in `src/` for this Next.js app, plus how remote/API data maps into the UI. CSS class names, hex colors, and non-display config IDs are omitted unless they are shown as text.

**Entry route:** `src/app/page.tsx` renders `MashwarHome` (primary product UI). `MapHome` is an alternate shell still in the repo and is listed separately.

---

## 1. App shell & metadata

| Location | Text |
|----------|------|
| `src/app/layout.tsx` — `metadata.title` | `Mashwar` |
| `src/app/layout.tsx` — `metadata.description` | `West Bank map base built with Next.js and MapLibre.` |
| `src/app/page.tsx` — `metadata.title` | `Mashwar Map Base` |
| `src/app/page.tsx` — `metadata.description` | `MapLibre-based West Bank map foundation for Mashwar.` |
| `src/lib/config/map.ts` — `DEFAULT_MAP_TILE_URL_TEMPLATE` | Tile URL template (infrastructure string, not rendered as body copy) |
| `src/lib/config/map.ts` — MapLibre cluster symbol | Layout uses font label `Open Sans Bold` (glyph/font name for map labels, not app copy) |

`globals.css` contains no user-facing prose (only design tokens and empty `content` on pseudo-elements).

---

## 2. Primary UI — `MashwarHome.tsx`

### 2.1 Constants & helpers (labels shown or used in UI)

| Key / context | Arabic (AR) | English (EN) / other |
|---------------|-------------|----------------------|
| `STATUS_VISUALS` keys & `ar` | سالك، أزمة متوسطة، أزمة خانقة، مغلق، غير معروف | OPEN, SLOW, HEAVY, CLOSED, UNKNOWN |
| `getConfidenceTone` fallback label | — | `n/a` |
| `formatForecastConfidence` | — | `n/a`, `%` formatted |
| `formatForecastDateTime` empty | — | `Pending` |
| `getForecastHorizonTitleAr` | خلال ٣٠ دقيقة، خلال ساعة، خلال ساعتين، غدًا حوالي ٨ صباحًا | Horizon string passthrough if unknown |
| `forecastCoverageLabelAr` | دخول وخروج، دخول فقط، خروج فقط | — |
| `travelWindowHeadlineAr` | أفضل وقت للعبور، أسوأ وقت للعبور | — |
| `buildTravelWindowEntries` labels | — | `Best time to cross`, `Worst time to cross` |
| `formatTravelWindowHour` | — | `n/a`, `HH:00` |
| `formatSelectionLabel` / `getRowLabelForEndpoint` | غير محدد، الحالي، مثبت على الخريطة | Concat `name · city` from checkpoint |
| `DirectionStatusTile` | Uses `titleAr` / `titleEn` props | — |
| `FusedDirectionsStatusTile` | الاتجاهان | `Entering · leaving` |
| `ForecastDirectionCell` empty status line | — | `—` |
| `ForecastDirectionCell` confidence prefix | ثقة | — |
| `ForecastHorizonCard` | Uses `titleAr`/`titleEn` for cells | `دخول` / `Entering`, `خروج` / `Leaving` |
| Error / fallback strings (set in handlers) | تعذر تحميل الخريطة الحرارية | `Unable to load checkpoint data.`, `Unable to load route data.`, `Unable to load checkpoint forecast.`, `Sync your location first to route from the current position.`, `Choose a valid origin checkpoint.`, `Choose a valid destination checkpoint.`, `Choose two different endpoints for the route.`, `Select a checkpoint first to use it as the route origin.`, `Select a checkpoint first to use it as the route destination.`, `Selected checkpoint does not have usable coordinates.` |
| `locationError` (state; set elsewhere if used) | — | Typical EN geolocation messages in older branches |

### 2.2 Top route bar (visible strings)

| Element | Text |
|---------|------|
| Primary action | `مسح المسار` / `ابدأ التوجيه` |
| Endpoint labels | `من`, `إلى` |
| Separator (decorative) | `←` |
| GPS `title` / `aria-label` | `استخدام موقعي كنقطة انطلاق`, `استخدام موقعي كوجهة` |
| Clear endpoint `aria-label` | `مسح نقطة الانطلاق`, `مسح الوجهة` |
| Error strip joiner | ` · ` (between dynamic errors) |
| Smart router `title` | `موجز المسار الذكي` |
| Heatmap `title` | `خريطة حرارية` |

### 2.3 Checkpoint bottom sheet

| Section | AR | EN |
|---------|----|----|
| Header kicker | معلومات الحاجز | `Checkpoint` |
| Close | `aria-label`: إغلاق لوحة الحاجز | — |
| SR-only heading | الوضع الحالي | — |
| Mismatch alert | تنبيه: حالة الدخول تختلف عن الخروج. راجع البطاقتين أدناه؛ أسوأ الحالتين هي … . | — |
| Route CTAs | نقطة الانطلاق، الوجهة | `Route from here`, `Route to here` |
| Forecast block | التوقعات | `Forecast` |
| Live pill | — | `Live` |
| Last update line prefix | آخر تحديث للبيانات: | — |
| Travel window summary | نافذة السفر | — |
| Pills | مرجع، النطاق | (then dynamic `travelWindow.scope` / dates) |
| Travel window sublabels | اليوم، الساعة، الموعد المستهدف، دخول، خروج | `Best window` / `Worst window` |
| Confidence line | ثقة | — |
| Forecast status line | … فترات زمنية (دخول وخروج). | `جاري تحميل التوقعات…`, `بانتظار بيانات الخط الزمني للتوقعات.` |
| Loading | جاري تقدير سلوك الحاجز… | — |
| Empty forecast | لا توجد صفوف توقع لهذا الحاجز بعد. | — |

Dynamic: `selectedCheckpoint.name`, forecast rows, `travelWindow.scope`, `windowLabel`, `dayOfWeek`, statuses from API (Arabic enum), `forecastError` message body.

---

## 3. Map — `MapView.tsx`

### 3.1 Route risk & labels (English)

| Source | Strings |
|--------|---------|
| `getRouteRiskLabel` | `LOW RISK`, `MEDIUM RISK`, `HIGH RISK`, `RISK UNKNOWN` |
| `formatDelayLabel` | `+{n} min delay` |
| `formatRouteArrivalLabel` | `Arrival n/a` |
| `getRouteNoteLabel` | `Base ETA + upstream delay`; else first `riskComponents[]` string |
| `getRouteScoreLabel` | `Risk …`, `Route …`, `Risk n/a` |
| `formatDurationLabel` | `n/a`, `{n} min`, `{h}h`, `{h}h {m}m` |
| `formatRouteDistance` | `0 km`, `… km`, `… m` |
| `formatConfidence` | `n/a`, `%` |
| Route label card (selected) | `Route #{rank}`, `ETA`, `Delay`, `Clear`, `Route Data`, `Signal` |
| Route label card (compact) | `Route #{rank}`, `Route` |
| Cluster line in template | MapLibre `text-field` cluster count (numeric) |
| Endpoint marker `textContent` | `من`, `إلى` |
| Hover popup HTML (`getRouteHoverMarkup`) | `Route #…`, `Smart ETA`, `Expected delay`, `Journey risk`, `n/a` |

Dynamic from route objects: `arrivalLabel`, `durationLabel`, `delayLabel`, `riskLabel`, `scoreLabel`, `checkpointLabel` (includes `{n} checkpoints · …` pattern), `summaryLabel`, `reasonSummary`/`riskComponents` from backend.

---

## 4. Modals

### 4.1 `MashwarNaturalLanguageRouteModal.tsx`

| Category | Examples |
|----------|----------|
| Sample / placeholder | `SAMPLE_PROMPT`, placeholder Arabic line |
| Header | `NATURAL LANGUAGE ROUTING`, `Smart route and checkpoint parser`, body paragraph EN |
| Pills | `LOW`, `MEDIUM`, `HIGH`, `UNKNOWN`, `Current location ready`, `No current location`, etc. |
| Modes | `Text`, `Voice` |
| Buttons | `Generating…`, `Generate`, `Close routing modal`, `Close modal`, `×` |
| Sections | `PROMPT`, `INPUT EXAMPLES`, bullet examples EN |
| Loading | `Generating intelligence brief`, explanation EN |
| Errors | `Request failed`, `Unable to generate route intelligence right now.`, `Enter a route or checkpoint question first.` |
| Clarification | `Clarification needed`, `We need one more detail` |
| Error kind | `Unable to process the prompt` |
| Route result | `ROUTE INTENT`, simulation vs single copy EN, `Origin`, `Destination`, `Departure`, `WHAT-IF SIMULATION`, `Departure windows`, `Apply on Map`, `ROUTE RESULT`, `Main route`, `Live route` |
| Checkpoint result | `CHECKPOINT INTENT`, `Unknown city`, `Mode`, `Target time`, `Current status`, `Confidence`, `TRAVEL WINDOW`, `Best and worst crossing windows`, `Travel window data was not included…`, `FORECAST TIMELINE`, `Entering and leaving windows`, horizon display uses `row.horizon.replace…`, `EXACT-TIME PREDICTION`, `Direction-specific predictions`, `Entering`, `Leaving`, `Confidence`, `Day`, `Hour`, `Target time`, `Reference`, `Scope`, `n/a` |
| Empty | `No intelligence generated yet`, follow-up EN |
| `RouteWindowCard` | `Smart ETA`, `Expected Delay`, `Risk`, `Checkpoints`, `Confidence`, `Volatility`, `Distance` pills; fallback `No backend summary returned for this window.` |

Status badges reuse Arabic `MapCheckpointStatus` strings as pill labels.

### 4.2 `NaturalLanguageRouteModal.tsx` (mock — used from `MapHome`)

Large set of EN UI strings (`Natural language routing`, `Compact route brief`, `Mock only`, `Prompt`, `Text or voice`, `Parsing…`, `Generate`, `Listening` / `Voice`, `Parsed route`, `Awaiting route`, `Confidence`, `Origin`, `Destination`, `Departure`, `Mode`, `Mock brief`, footer notes, skeleton labels `Parsing origin`, `Matching checkpoints`, `Building report`, `Mock route report`, `Smart parsing active`, `Future action`, `Apply on map`, `No route generated yet`, etc.).

Mock data: `SAMPLE_PROMPT`, `LOCATION_ALIASES`, `ROUTE_TEMPLATES`, `DEFAULT_TEMPLATE` (checkpoint names and notes in English; statuses in Arabic).

### 4.3 `RouteDetailsModal.tsx`

English labels throughout: `ROUTE DETAILS`, `Route #{rank}`, explanatory paragraph, `Route legend`, `Smart ETA = predicted arrival…`, `V5 checkpoint-aware routing`, risk pills `Low risk`, `Medium risk`, `High risk`, section titles `Smart ETA`, `Journey Risk`, `Distance`, `Checkpoints`, `Checkpoint matching metadata`, field labels `Mode:`, `Worst …`, `Rank #`, `Checkpoint Timeline`, `Base ETA`, `Effective ETA`, `Expected Delay`, `Prediction`, `Status Now`, `Predicted at ETA`, `Probability breakdown`, `Match details`, `Reach`, `from departure`, `No checkpoint forecast details…`, `No backend reasoning summary…`, `n/a`, `Unknown`, direction labels `Entering`, `Leaving`, `Transit`, `Entering side`, etc.

Dynamic: all `route.*`, `checkpoint.*`, `checkpointMatching.*`, and raw status strings from API.

### 4.4 `TradeoffExplainerModal.tsx`

| Type | Strings |
|------|---------|
| Risk / status badges | `SAFE`, `CAUTION`, `AVOID`, `UNKNOWN`, `GREEN`, `YELLOW`, `RED` |
| Collapsed CTA | `Show route tradeoff explainer` |
| Header | `Tradeoff explainer`, `Winner #…`, `{n} routes compared` |
| Title | `Best route today` |
| Body | `Recommended route:`, EN/AR fallbacks: `No English summary returned.`, `لا يوجد ملخص عربي.` |
| Buttons | `Expand`, `Collapse`, aria `Close route tradeoff explainer`, `×` |
| Sections | `Summary`, `Decision driver`, `Full explanation`, `Source of truth`, `English`, `العربية`, `No English explanation returned.`, `لا يوجد شرح عربي.` |
| Comparison | `Route comparison`, `Every returned route…`, `Jump to winner`, `Winner`, `Recommended`, `Fastest`, `Safest`, `Lowest delay`, `Highest risk`, `Unnamed route`, `لا يوجد اسم عربي`, metric labels (`Duration`, `Smart ETA`, `Expected delay`, …), `Time vs risk`, `Time`, `Risk`, `Delay`, `min vs recommended`, `Status counts`, `Direction counts`, `Corridor cities`, `Why this route matters`, `Risky checkpoints`, `ETA`, `Current`, `Unknown city`, `Unknown direction`, empty state EN |
| Collapsed bar | `… is summarized here. Expand…`, `Focus winner` |

Dynamic: `explainer.fullText`, `englishText`, `arabicText`, `setSummary.*`, `winnerRouteId`, `routes[].labelEn` / `labelAr`, `comparisonFacts`, `corridorNote`, etc.

---

## 5. Alternate page — `MapHome.tsx`

English-heavy dev/demo copy: `Routing`, `من - إلى`, route helper paragraphs, `Building route` / `Ready`, badges `الحالي`, `Checkpoint`, `Unset`, `Selected`, `Action`, `Route`, `Clear`, `Routing...`, checkpoint/forecast blocks, `Mashwar Web Base`, `West Bank Map`, `Natural route brief`, `Load demo route`, `Retry checkpoints`, `Sync location`, long instructional paragraphs referencing `API_GUIDE.md`, forecast strings (`Loading hourly forecast…`, `Forecast grouped by hour.`, `Captured …`, `Loading` / `Updated` / `Waiting`, etc.), Arabic CTAs (`الحالي`, `التحديد كمن`, …), `استخدم كمن`, `استخدم كإلى`.

---

## 6. Services — user-visible or thrown messages

| File | User-facing strings |
|------|---------------------|
| `checkpoints.ts` | `Checkpoint {n}` fallback name; errors: `Invalid checkpoints response.`, `Checkpoint service is currently unavailable.`, `Unable to fetch current checkpoints right now.`, `Checkpoint request failed with status …`, `Unable to reach the checkpoint service.`, `Unable to load checkpoint data from the configured Geo API.` |
| `forecast.ts` | Similar pattern: unavailable, invalid response, reachability, `Unable to load checkpoint forecast data.`, etc. |
| `heatmap.ts` (callbacks) | `Received an invalid uncertainty stream payload.`, `Received a corridor without usable geometry.`, `Received an unknown uncertainty stream event.` |
| `nominatimReverseGeocode.ts` | No UI strings; returns `display_name` substring from OSM |

---

## 7. Backend → normalized model → UI (mapping)

### 7.1 Checkpoints — `GET …/checkpoints/current-status`

| API / DTO field (flexible) | Normalized (`MapCheckpoint`) | Typical UI use |
|----------------------------|------------------------------|----------------|
| `id` | `id` | Keys, routing |
| `name` / `nameAr` / `checkpoint` | `name` | Title, labels |
| `city` | `city` | Subtitle, `name · city` |
| `lat` / `latitude`, `lng` / `longitude` | `latitude`, `longitude` | Map, routing |
| `entering_status` / `enteringStatus`, `leaving_status` / `leavingStatus`, `current_status` / `status` | `enteringStatus`, `leavingStatus` (via `normalizeCheckpointStatus`) | Status tiles, colors |
| `entering_status_last_updated`, `leaving_status_last_updated` | `enteringStatusLastUpdated`, `leavingStatusLastUpdated` | Optional future UI |
| `alert_text` | `alertText` | Modals / detail |
| `uncertainty` / `prediction` | passed through | Debug / future |

**Status normalization:** raw English or Arabic tokens from API are mapped to Arabic `MapCheckpointStatus` via `STATUS_ALIASES` in `src/lib/config/map.ts` (e.g. `open` → سالك, `closed` → مغلق).

### 7.2 Checkpoint forecast — `GET …/checkpoints/{id}/forecast?status_type=…`

| API field | Normalized path | UI |
|-----------|-----------------|-----|
| `data.checkpoint` | `NormalizedCheckpointForecast.checkpoint` | Refreshed marker + sheet header |
| `data.request.as_of`, `status_type` | `request.asOf`, `request.statusType` | “Last update” line |
| `predictions[]` **or** `predictions.entering` / `.leaving` | `predictions.entering` / `.leaving[]` | Horizon cards |
| Each item: `horizon`, `target_datetime`, `prediction.predicted_status`, `confidence`, `class_probabilities` | `NormalizedCheckpointForecastTimelineItem` | Status text + ثقة % |
| `travel_window` / `travelWindow`, `reference_time`, `scope` | `travelWindow` | Travel window section; `scope` shown raw |

### 7.3 Routing v2 — Geo API route response → `NormalizedRoutes` / `RoutePath`

Representative DTO → UI paths (see `src/lib/types/map.ts` for full list):

| DTO (snake_case typical) | UI consumer |
|--------------------------|-------------|
| `routes[].route_id`, `rank`, `distance_m`, `duration_ms`, `geometry` | Map lines, labels, details modal |
| `smart_eta_ms`, `smart_eta_datetime`, `expected_delay_minutes` | ETA / delay copy |
| `risk_level`, `risk_score`, `risk_confidence`, `risk_components`, `reason_summary` | Risk badges, summaries |
| `checkpoint_count`, `checkpoints[]` | “Checkpoints” metrics, timeline in `RouteDetailsModal` |
| `worst_predicted_status` | Bucket pill |
| `tradeoff_explainer` | `TradeoffExplainerModal` (bilingual text, metrics, per-route cards) |

Request from client (`getRoute`): `origin`, `destination`, optional `origin_city`, `destination_city`, `profile: "car"`, optional `depart_at`.

### 7.4 Natural language — `POST /api/route-intent` + `resolveNaturalLanguageRequest`

- Client sends prompt (+ optional `currentLocation`).
- Server uses LLM with a fixed JSON schema (see `buildSystemPrompt()` in `src/app/api/route-intent/route.ts`); **model-generated strings** are not hardcoded in the repo.
- Resolved execution kinds (`route`, `checkpoint`, `clarification`, `error`) drive `MashwarNaturalLanguageRouteModal` layout; labels like `originLabel` / `destinationLabel` come from resolution objects built server-side.

### 7.5 Heatmap — `GET …/heatmap`, `EventSource …/heatmap/stream`

| Payload | UI |
|---------|-----|
| GeoJSON corridors / streamed `route_built.corridor` | Line geometry + heatmap styling |
| `properties.score` (segment) | Color via `HEATMAP_COLOR_EXPRESSION` |
| Error `message` | `heatmapError` strip |

### 7.6 Reverse geocode — Nominatim

| External field | UI |
|----------------|-----|
| `display_name` | Truncated string from `reverseGeocodeShortLabel` shown as map-point / GPS row label when resolved |

### 7.7 Static city data — `src/lib/data/cities.ts` + `cities.json`

| Field | Use |
|-------|-----|
| `name_ar`, `name_en`, `aliases_ar`, coordinates | Resolving place names in route-intent / NL flow |

---

## 8. `formatDateTimeInPalestine` / locale

- Default empty date: **`n/a`**
- Formatter uses locale **`en-US`** with time zone **`Asia/Hebron`** (`src/lib/utils/palestine-time.ts`).
- `MashwarHome`’s `formatForecastDateTime` uses **`en-US`** + **`Asia/Hebron`** for horizon timestamps (uppercased month, 12h clock).

---

## 9. Build / hygiene notes (inventory-only)

In the current `src/components/map/MashwarHome.tsx`, the JSX references **`routeFromLabel`**, **`routeToLabel`**, and **`isSyncingLocation`** without definitions in the same file scope visible to this inventory (GPS loading uses `gpsLoading` / `gpsErrorField`). That will break TypeScript until those identifiers are wired (e.g. `useMemo` labels via `getRowLabelForEndpoint`, and `disabled={gpsLoading.from || gpsLoading.to}`).

---

## 10. File index (where strings live)

| File | Role |
|------|------|
| `src/app/layout.tsx`, `src/app/page.tsx` | Metadata |
| `src/components/map/MashwarHome.tsx` | Primary AR/EN UI + checkpoint sheet |
| `src/components/map/MapView.tsx` | Map overlays, route cards, popups |
| `src/components/map/MashwarNaturalLanguageRouteModal.tsx` | NL + live intelligence UI |
| `src/components/map/NaturalLanguageRouteModal.tsx` | Mock NL (MapHome) |
| `src/components/map/RouteDetailsModal.tsx` | Route drill-down |
| `src/components/map/TradeoffExplainerModal.tsx` | Tradeoff explainer |
| `src/components/map/MapHome.tsx` | Alternate demo shell |
| `src/lib/config/map.ts` | Status alias map + demo coordinates (not all shown as prose) |
| `src/lib/services/checkpoints.ts`, `forecast.ts`, `heatmap.ts` | Thrown / surfaced error messages |
| `src/lib/types/map.ts` | DTO ↔ normalized field names (reference for mapping section) |

---

*End of inventory. For i18n extraction, treat each table cell as a candidate key; treat `STATUS_VISUALS` and service errors as high-priority bundles.*
