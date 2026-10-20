import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withRoute, fail } from "@/lib/server/with-route";
import { cached } from "@/lib/server/ttl-cache";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";

/** City/region typeahead for the profile's dream destination, e.g. `?query=Kyo`. */
export const GET = withRoute(async (request: Request) => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!(await withinRateLimit(`autocomplete:${user.id}`, 60, 60_000))) {
      return NextResponse.json({ error: "Too many searches. Try again in a moment." }, { status: 429 });
    }
    const query = new URL(request.url).searchParams.get("query")?.trim();
    if (!query || query.length < 2) return NextResponse.json({ suggestions: [] });
    const suggestions = await cached(`places:autocomplete:${query.toLowerCase()}`, 60_000, () => new GooglePlacesProvider().autocompleteRegions(query, request.signal));
    return NextResponse.json({ suggestions });
  } catch (error) {
    return fail(error, "Destination search unavailable");
  }
});
