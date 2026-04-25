/** Normalize API `scope` strings for lookup in `checkpoint.panel.travelWindowScopes.*`. */
function normalizeScopeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

const SCOPE_ALIASES: Record<string, string> = {
  entering_leaving: "both",
  enteringandleaving: "both",
  in_and_out: "both",
  combined: "both",
  all: "both",
  "24": "24h",
  last24h: "24h",
  last_24_hours: "24h",
  rolling: "24h",
  day: "daily",
  days: "daily",
  week: "weekly",
};

const KNOWN_SCOPE_KEYS = new Set([
  "both",
  "entering",
  "leaving",
  "entering_only",
  "leaving_only",
  "24h",
  "daily",
  "weekly",
  "hourly",
  "peak",
  "off_peak",
]);

/**
 * Maps backend travel-window `scope` to `checkpoint.panel.travelWindowScopes.<key>`.
 * Unknown values are returned unchanged for display.
 */
export function travelWindowScopeDisplay(
  raw: string | null | undefined,
  tPanel: (key: string) => string,
): string {
  if (!raw?.trim()) {
    return "";
  }

  const trimmed = raw.trim();
  let key = normalizeScopeKey(trimmed);
  key = SCOPE_ALIASES[key] ?? key;

  if (!KNOWN_SCOPE_KEYS.has(key)) {
    return trimmed;
  }

  return tPanel(`travelWindowScopes.${key}`);
}
