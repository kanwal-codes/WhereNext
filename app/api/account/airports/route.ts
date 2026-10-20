import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withRoute, fail } from "@/lib/server/with-route";
import { cached } from "@/lib/server/ttl-cache";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { flightPlaces } from "@/lib/server/flight-search";
import { serpConfigured } from "@/packages/providers/serpapi/client";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";

type Suggestion = { placeId: string; text: string; secondaryText: string | null; fullText: string; types: string[] };

/** Airports to pick a home airport from, as `?query=pear`. `placeId` is the airport's three-letter code. */
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

    const suggestions = await cached<Suggestion[]>(`account:airports:${query.toLowerCase()}`, 60_000, async () => {
      // Google Places searches airports as airports ("pearson" finds Toronto Pearson), and names them with their code in brackets.
      const found = await new GooglePlacesProvider().autocompleteAirports(query, request.signal).catch(() => []);
      const fromPlaces = found.flatMap((s): Suggestion[] => {
        const code = /\(([A-Z]{3})\)\s*$/.exec(s.fullText)?.[1] ?? /\(([A-Z]{3})\)/.exec(s.text)?.[1];
        return code ? [{ ...s, placeId: code, secondaryText: [code, s.secondaryText].filter(Boolean).join(" · ") }] : [];
      });
      if (fromPlaces.length > 0 || !serpConfigured()) return fromPlaces;
      // Nothing there (a bare code, say): Google Flights' own suggestions, airports only.
      const places = await flightPlaces(query, request.signal);
      return places
        .filter((p) => p.kind === "airport")
        .map((p): Suggestion => ({ placeId: p.id, text: p.label, secondaryText: [p.id, p.detail].filter(Boolean).join(" · "), fullText: p.label, types: ["airport"] }))
        .slice(0, 7);
    });
    return NextResponse.json({ suggestions });
  } catch (error) {
    return fail(error, "Airport search unavailable");
  }
});
