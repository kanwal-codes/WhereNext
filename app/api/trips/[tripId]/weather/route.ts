import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { weather as openWeather } from "@/packages/providers/openweather/client";
import { weather as googleWeather } from "@/packages/providers/google-weather/client";
import { research as tavilyResearch } from "@/packages/providers/tavily/client";
import { research as exaResearch } from "@/packages/providers/exa/client";
import { generateText } from "@/packages/ai/model-policy";
import { cached } from "@/lib/server/ttl-cache";

// Phase 5 (docs/overhaul/roadmap/phase-5-optional-improvements.md) — same opt-in pilot gating as
// the RETRIEVE handlers (weather.ts, research-web.ts): this route hits both providers directly
// (it predates the registry split) and must pick the same way, or the chat and this widget would
// silently disagree about which provider is "the" weather/research source mid-rollout.
// Named without a `use` prefix on purpose — these are plain feature-flag checks in a server
// route, not React hooks, but a `use`-prefixed function being *called* is exactly what trips
// ESLint's `react-hooks/rules-of-hooks` (it can't tell a real hook from a same-shaped plain
// function by name alone) — four real lint errors here from a name that only looked like a hook.
const googleWeatherPilotEnabled = () => Boolean(process.env.GOOGLE_WEATHER_API_KEY);
const exaPilotEnabled = () => Boolean(process.env.EXA_API_KEY);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY = 864e5;

/** A month name from an ISO date or from free text like "mid-October". */
function monthOf(startDate: string | null | undefined, datesText: unknown): string | null {
  if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) return MONTHS[Number(startDate.slice(5, 7)) - 1] ?? null;
  if (typeof datesText === "string") {
    const m = datesText.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
    if (m) return MONTHS.find((name) => name.toLowerCase().startsWith(m[1])) ?? null;
  }
  return null;
}

/** Clean 1–2 sentence "typical weather in <place> in <month>" line ending with a packing cue. */
async function seasonalSummary(place: string, month: string, signal?: AbortSignal): Promise<string | null> {
  let notes = "";
  if (process.env.TAVILY_API_KEY || exaPilotEnabled()) {
    try {
      const query = `typical weather in ${place} in ${month} — average temperature, rain, humidity, what to pack`;
      const hits = await (exaPilotEnabled() ? exaResearch(query, signal) : tavilyResearch(query, signal));
      notes = hits.map((h) => h.content).filter(Boolean).join("\n\n").slice(0, 3000);
    } catch {
      /* fall through */
    }
  }
  if (!notes) return null;
  if (!process.env.AI_GATEWAY_API_KEY) return notes.slice(0, 300);
  try {
    return (
      await generateText(
        "bulk",
        [
          {
            role: "system",
            content:
              "From the notes, write ONE or TWO sentences on what the weather is typically like at this destination in this month — a temperature range in °C and whether it's usually hot / mild / cold / wet / dry — then a short 'pack …' cue. It is TYPICAL for the time of year, not a forecast. Plain prose, no lists, no sources, British English.",
          },
          { role: "user", content: `${place}, ${month}:\n${notes}` },
        ],
        signal,
      )
    ).trim();
  } catch {
    return notes.slice(0, 300);
  }
}

/**
 * Weather sized to the trip:
 *  - trip starts within ~6 days  -> the live forecast (those are the trip's days)
 *  - trip is further out / only a month is known -> the TYPICAL weather for that month
 *  - no dates and no month -> nothing (kind "none")
 */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { limit: LIMITS.provider });
    const location = (new URL(request.url).searchParams.get("location") ?? "").trim();
    if (!location) return NextResponse.json({ error: "A location is required" }, { status: 400 });

    const [trip, prefs] = await Promise.all([
      createTripRepository(supabase).get(tripId),
      supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle(),
    ]);
    const start = (trip as { start_date?: string | null } | null)?.start_date ?? null;
    const end = (trip as { end_date?: string | null } | null)?.end_date ?? null;
    const daysUntilStart = start ? Math.round((Date.parse(start) - Date.now()) / DAY) : null;
    const tripOver = Boolean(end && Date.parse(end) < Date.now() - DAY);

    // --- forecast window: the trip is happening now or within the forecast reach
    if (!tripOver && daysUntilStart !== null && daysUntilStart <= 6) {
      const pilot = googleWeatherPilotEnabled();
      if (!pilot && !process.env.OPENWEATHER_API_KEY) return NextResponse.json({ kind: "none" });
      const provider = pilot ? "google-weather" : "openweather";
      const result = await cached(`weather:fc:${provider}:${location.toLowerCase()}`, 30 * 60_000, async () => {
        const fc = await (pilot ? googleWeather(location, request.signal) : openWeather(location, request.signal));
        return { summary: fc.summary, retrievedAt: fc.retrievedAt };
      }).catch(() => null);
      if (!result?.summary) return NextResponse.json({ kind: "none" });
      return NextResponse.json({ kind: "forecast", location, summary: result.summary, freshness: { provider, retrievedAt: result.retrievedAt } });
    }

    // --- seasonal: a month is known but the trip is too far out for a forecast
    const month = tripOver ? null : monthOf(start, (prefs.data?.data as Record<string, unknown> | undefined)?.dates);
    if (month) {
      // Only this branch runs web search + a model call on a miss (the forecast above is plain provider data),
      // so only this branch is held to the tighter per-person bucket.
      if (!(await withinRateLimit(`user-${LIMITS.enrich.bucket}:${user.id}`, LIMITS.enrich.max, 60 * 60_000))) return NextResponse.json({ kind: "none" });
      // The loader's result is shared across users, so it runs on its own signal: a disconnecting first
      // request used to abort the search and cache the fallback text for 24h.
      const sharedSignal = AbortSignal.timeout(20_000);
      const result = await cached(`weather:season:${location.toLowerCase()}:${month}`, 24 * 60 * 60_000, async () => {
        const summary = await seasonalSummary(location, month, sharedSignal);
        if (!summary) throw new Error("no seasonal summary"); // don't cache a miss for 24h
        return { summary, retrievedAt: new Date().toISOString() };
      }).catch(() => null);
      if (!result?.summary) return NextResponse.json({ kind: "none" });
      return NextResponse.json({ kind: "seasonal", location, month, summary: result.summary, freshness: { provider: "web", retrievedAt: result.retrievedAt } });
    }

    return NextResponse.json({ kind: "none" });
  } catch (error) {
    return tripAuthResponse(error) ?? NextResponse.json({ kind: "none" });
  }
}
