import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { weather } from "@/packages/providers/openweather/client";
import { research } from "@/packages/providers/tavily/client";
import { createAiGateway } from "@/packages/ai/gateway";
import { cached } from "@/lib/server/ttl-cache";

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
  if (process.env.TAVILY_API_KEY) {
    try {
      const hits = await research(`typical weather in ${place} in ${month} — average temperature, rain, humidity, what to pack`, signal);
      notes = hits.map((h) => h.content).filter(Boolean).join("\n\n").slice(0, 3000);
    } catch {
      /* fall through */
    }
  }
  if (!notes) return null;
  if (!(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.CEREBRAS_API_KEY)) return notes.slice(0, 300);
  try {
    return (
      await createAiGateway().generateText(
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
    const { supabase } = await requireTripMember(tripId);
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
      if (!process.env.OPENWEATHER_API_KEY) return NextResponse.json({ kind: "none" });
      const result = await cached(`weather:fc:${location.toLowerCase()}`, 30 * 60_000, async () => {
        const fc = await weather(location, request.signal);
        return { summary: fc.summary, retrievedAt: fc.retrievedAt };
      }).catch(() => null);
      if (!result?.summary) return NextResponse.json({ kind: "none" });
      return NextResponse.json({ kind: "forecast", location, summary: result.summary, freshness: { provider: "openweather", retrievedAt: result.retrievedAt } });
    }

    // --- seasonal: a month is known but the trip is too far out for a forecast
    const month = tripOver ? null : monthOf(start, (prefs.data?.data as Record<string, unknown> | undefined)?.dates);
    if (month) {
      const result = await cached(`weather:season:${location.toLowerCase()}:${month}`, 24 * 60 * 60_000, async () => {
        const summary = await seasonalSummary(location, month, request.signal);
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
