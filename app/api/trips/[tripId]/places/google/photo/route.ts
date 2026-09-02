import { NextResponse } from "next/server";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function authorized(tripId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const member = await supabase.from("trip_members").select("trip_id").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle();
  return Boolean(member.data);
}

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = (await params).tripId;
    if (!(await authorized(tripId))) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const name = new URL(request.url).searchParams.get("name") ?? "";
    if (!/^places\/[^/]+\/photos\/[^/]+$/.test(name)) return NextResponse.json({ error: "Invalid Google photo name" }, { status: 400 });
    const response = await fetch(new GooglePlacesProvider().photoUrl(name), { signal: request.signal });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !response.body || !contentType.toLowerCase().startsWith("image/")) return NextResponse.json({ error: "Place photo is unavailable" }, { status: 503 });
    return new Response(response.body, { headers: { "content-type": contentType, "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Place photo is unavailable" }, { status: 503 }); }
}
