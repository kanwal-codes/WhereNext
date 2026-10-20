import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withRoute, fail } from "@/lib/server/with-route";
import { cached } from "@/lib/server/ttl-cache";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";

/** The Google photo name for a destination like "Kyoto, Japan" (null when it has none), for the profile picture. */
export const GET = withRoute(async (request: Request) => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!(await withinRateLimit(`destination-photo:${user.id}`, 20, 60_000))) {
      return NextResponse.json({ error: "Too many lookups. Try again in a moment." }, { status: 429 });
    }
    const query = new URL(request.url).searchParams.get("query")?.trim();
    if (!query || query.length > 160) return NextResponse.json({ error: "Destination required" }, { status: 400 });
    const photoName = await cached(`account:destination-photo:${query.toLowerCase()}`, 24 * 60 * 60_000, async () => {
      const places = await new GooglePlacesProvider().search(query, request.signal, 5);
      return places.find((p) => p.photoNames?.[0])?.photoNames?.[0] ?? null;
    });
    return NextResponse.json({ photoName });
  } catch (error) {
    return fail(error, "That destination's photo is unavailable right now");
  }
});
