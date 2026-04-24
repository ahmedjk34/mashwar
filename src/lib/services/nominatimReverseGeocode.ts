const NOMINATIM_REVERSE =
  "https://nominatim.openstreetmap.org/reverse?format=json";

function truncateDisplayName(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxChars)}…`;
}

/**
 * Reverse-geocode via Nominatim (browser: respect usage policy, low volume).
 * Returns a short Arabic-friendly display string (truncated).
 */
export async function reverseGeocodeShortLabel(
  lat: number,
  lng: number,
  maxChars = 22,
): Promise<string | null> {
  const url = new URL(NOMINATIM_REVERSE);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Language": "ar,en",
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    display_name?: string;
    error?: string;
  };

  if (data.error || !data.display_name) {
    return null;
  }

  return truncateDisplayName(data.display_name, maxChars);
}
