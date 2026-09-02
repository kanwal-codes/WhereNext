import { NextResponse } from "next/server";
import { staticMapUrl } from "@/packages/providers/mapbox/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function authorized(tripId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const member = await supabase.from("trip_members").select("trip_id").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle();
  return Boolean(member.data);
}

/** Parse `?markers=lng,lat|lng,lat` into validated [lng,lat] pairs. */
function parseMarkers(raw: string): Array<[number, number]> {
  return raw
    .split("|")
    .map((pair) => pair.split(",").map(Number))
    .filter((p): p is [number, number] => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);
}

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = (await params).tripId;
    if (!(await authorized(tripId))) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const search = new URL(request.url).searchParams;
    const markers = parseMarkers(search.get("markers") ?? "");
    const width = Number(search.get("w")) || 640;
    const height = Number(search.get("h")) || 420;
    const response = await fetch(staticMapUrl(markers, { width, height }), { signal: request.signal });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !response.body || !contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "Map image is unavailable" }, { status: 503 });
    }
    return new Response(response.body, { headers: { "content-type": contentType, "cache-control": "private, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "Map image is unavailable" }, { status: 503 });
  }
}
