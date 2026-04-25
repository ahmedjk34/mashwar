import { NextResponse } from "next/server";

import { getUpstreamMapTileUrlTemplate } from "@/lib/config/map";

export const runtime = "nodejs";

type TileRouteContext = {
  params: Promise<{
    z: string;
    x: string;
    y: string;
  }>;
};

function normalizeTileY(rawY: string): string {
  return rawY.endsWith(".png") ? rawY.slice(0, -4) : rawY;
}

function isValidTileCoordinate(value: string): boolean {
  return /^\d+$/.test(value);
}

function buildUpstreamTileUrl(z: string, x: string, y: string): string {
  const template = getUpstreamMapTileUrlTemplate();
  return template.replace("{z}", z).replace("{x}", x).replace("{y}", y);
}

export async function GET(_: Request, context: TileRouteContext) {
  const { z, x, y: rawY } = await context.params;
  const y = normalizeTileY(rawY);

  if (
    !isValidTileCoordinate(z) ||
    !isValidTileCoordinate(x) ||
    !isValidTileCoordinate(y)
  ) {
    return NextResponse.json({ error: "Invalid tile coordinates." }, { status: 400 });
  }

  const upstreamResponse = await fetch(buildUpstreamTileUrl(z, x, y), {
    cache: "force-cache",
  });

  if (!upstreamResponse.ok) {
    return new NextResponse(null, { status: upstreamResponse.status });
  }

  const contentType = upstreamResponse.headers.get("content-type") ?? "image/png";
  const cacheControl =
    upstreamResponse.headers.get("cache-control") ??
    "public, max-age=3600, s-maxage=3600";

  return new NextResponse(upstreamResponse.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    },
  });
}
