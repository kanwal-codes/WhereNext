import { NextResponse } from "next/server";
import { z } from "zod";
import { routeMapUrl } from "@/packages/providers/mapbox/client";
import { withRoute } from "@/lib/server/with-route";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { clientKey } from "@/lib/server/guest";

const point = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const color = z.string().regex(/^#?[0-9a-fA-F]{6}$/);
const body = z.object({
  lines: z.array(z.object({ points: z.array(point).min(2).max(120), color, width: z.number().min(1).max(12), opacity: z.number().min(0).max(1).optional() })).min(1).max(16),
  pins: z.array(z.object({ at: point, color })).max(2),
  size: z.object({ width: z.number().min(200).max(900), height: z.number().min(100).max(600) }),
});

/** The map under a route card, drawn by Mapbox from the route lines the card already has. Keeps the token server-side. */
export const POST = withRoute(async (request) => {
  // Every miss is a metered Static Images call on the operator's token, and guests can reach this.
  if (!(await withinRateLimit(`route-map:${clientKey(request)}`, 240, 60 * 60_000))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  if (!process.env.MAPBOX_ACCESS_TOKEN) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid map request" }, { status: 400 });
  const { lines, pins, size } = parsed.data;

  const response = await fetch(routeMapUrl(lines, pins, size), { signal: request.signal });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !response.body || !contentType.toLowerCase().startsWith("image/")) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  return new Response(response.body, { headers: { "content-type": contentType, "cache-control": "private, max-age=3600" } });
});
