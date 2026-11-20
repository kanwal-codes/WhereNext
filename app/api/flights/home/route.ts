import { NextResponse } from "next/server";
import { requireUser, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail } from "@/lib/server/with-route";

/**
 * Where this person probably flies from, for the Flights search's "From": the home city on their profile, else the city their request
 * comes from (Vercel's IP header). `{ place: null }` when neither is known: the field is then left for them to fill in.
 */
export const GET = withRoute(async (request: Request) => {
  try {
    const { supabase, user } = await requireUser();
    const profile = await Promise.resolve()
      .then(() => supabase.from("profiles").select("data").eq("id", user.id).maybeSingle())
      .then((r) => (r.data?.data ?? {}) as Record<string, unknown>, () => ({}) as Record<string, unknown>);
    const home = typeof profile.homeCity === "string" ? profile.homeCity.trim() : "";
    let place = home;
    if (!place) {
      const city = request.headers.get("x-vercel-ip-city");
      try { place = city ? decodeURIComponent(city).trim() : ""; } catch { place = ""; }
    }
    return NextResponse.json({ place: place || null });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Home place unavailable");
  }
});
