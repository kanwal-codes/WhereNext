import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { searchStays } from "@/packages/providers/liteapi/client";
import { cached } from "@/lib/server/ttl-cache";

const DAY = 864e5;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Resolve check-in/out: honour valid future dates, otherwise a 3-night stay ~6 weeks out. */
function resolveDates(checkin: string | null, checkout: string | null) {
  const today = iso(Date.now());
  const assumed = !checkin || checkin <= today;
  const ci = assumed ? iso(Date.now() + 42 * DAY) : checkin!;
  const co = !assumed && checkout && checkout > ci ? checkout : iso(Date.parse(ci) + 3 * DAY);
  return { checkin: ci, checkout: co, assumed };
}

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = (await params).tripId;
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const member = await supabase.from("trip_members").select("trip_id").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle();
    if (!member.data) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

    if (!process.env.LITEAPI_KEY) return NextResponse.json({ error: "Stay search is not configured" }, { status: 503 });

    const trip = await createTripRepository(supabase).get(tripId);
    if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

    const search = new URL(request.url).searchParams;
    const location = (search.get("location") || trip.destination).trim();
    const adults = Math.max(1, Math.min(Number(search.get("adults")) || trip.travelers || 2, 8));
    const { checkin, checkout, assumed } = resolveDates(search.get("checkin"), search.get("checkout"));

    const key = `stays-tab:${location}:${checkin}:${checkout}:${adults}`;
    const result = await cached(key, 5 * 60_000, async () => {
      const hits = await new GooglePlacesProvider().search(location, request.signal).catch(() => null);
      const anchor = hits?.[0];
      const out = await searchStays(
        anchor
          ? { latitude: anchor.latitude, longitude: anchor.longitude, checkin, checkout, adults }
          : { city: location, checkin, checkout, adults },
        request.signal,
      );
      return { ...out, retrievedAt: new Date().toISOString() };
    });

    return NextResponse.json({
      location,
      checkin,
      checkout,
      assumedDates: assumed,
      nights: result.nights,
      options: result.options,
      freshness: { provider: "liteapi", retrievedAt: result.retrievedAt, cacheTtlSeconds: 300 },
    });
  } catch {
    return NextResponse.json({ error: "Stay search is unavailable right now" }, { status: 503 });
  }
}
