export function getGeoApiBaseUrl(context: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_GEO_API_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      `NEXT_PUBLIC_GEO_API_URL is required to fetch ${context}.`,
    );
  }

  return baseUrl.replace(/\/+$/, "");
}
