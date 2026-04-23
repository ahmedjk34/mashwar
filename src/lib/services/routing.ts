import { validateRoutePoint } from "@/lib/config/map";
import type {
  LngLatCoordinate,
  NormalizedRoutes,
  RoutePath,
  RoutePathDto,
  RoutingRequest,
  RoutingResponseDto,
} from "@/lib/types/map";

function getGeoApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_GEO_API_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      "NEXT_PUBLIC_GEO_API_URL is required to fetch routing data.",
    );
  }

  return baseUrl.replace(/\/+$/, "");
}

function toFiniteNumber(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return 0;
}

function normalizeCoordinates(value: unknown): LngLatCoordinate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      return [];
    }

    const lng = Number(coordinate[0]);
    const lat = Number(coordinate[1]);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return [];
    }

    return [[lng, lat] as LngLatCoordinate];
  });
}

function normalizeRoutePath(path: RoutePathDto): RoutePath | null {
  const coordinates = normalizeCoordinates(path.points?.coordinates);
  if (coordinates.length < 2) {
    return null;
  }

  return {
    distance: toFiniteNumber(path.distance),
    time: toFiniteNumber(path.time),
    points: {
      type: "LineString",
      coordinates,
    },
    instructions: Array.isArray(path.instructions) ? path.instructions : [],
    ascend:
      path.ascend === undefined || path.ascend === null
        ? undefined
        : toFiniteNumber(path.ascend),
    descend:
      path.descend === undefined || path.descend === null
        ? undefined
        : toFiniteNumber(path.descend),
  };
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    if (payload?.message) {
      return payload.message;
    }
  } catch {
    return `Routing request failed with status ${response.status}.`;
  }

  return `Routing request failed with status ${response.status}.`;
}

export async function getRoute(
  request: RoutingRequest,
): Promise<NormalizedRoutes> {
  validateRoutePoint(request.startPoint);
  validateRoutePoint(request.endPoint);

  const endpoint = `${getGeoApiBaseUrl()}/api/routing`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    const payload = (await response.json()) as RoutingResponseDto;
    if (!Array.isArray(payload.paths)) {
      throw new Error("Routing API must return a paths array.");
    }

    const normalizedPaths = payload.paths
      .map((path) => normalizeRoutePath(path))
      .filter((path): path is RoutePath => path !== null);

    return {
      mainRoute: normalizedPaths[0] ?? null,
      alternativeRoutes: normalizedPaths.slice(1, 3),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Unable to load route data from the configured Geo API.");
  }
}
