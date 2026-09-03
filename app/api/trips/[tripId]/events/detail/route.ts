import { NextResponse } from "next/server";
import { z } from "zod";
import { eventDetailSchema, type EventDetail } from "@/packages/contracts/event";
import { eventDetail as ticketmasterDetail } from "@/packages/providers/ticketmaster/client";
import { research } from "@/packages/providers/tavily/client";
import { createBulkGateway } from "@/packages/ai/gateway";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { cached } from "@/lib/server/ttl-cache";

/** Turn the raw provider blurb + web snippets into a clean 2–4 sentence "about". Falls back to the raw text. */
async function summariseAbout(name: string, raw: string, signal?: AbortSignal): Promise<string | null> {
  const text = raw.trim();
  if (!text) return null;
  if (!(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.CEREBRAS_API_KEY)) return text.slice(0, 600);
  try {
    return (
      await createBulkGateway().generateText(
        [
          {
            role: "system",
            content:
              "Write a clean 2–4 sentence 'About' paragraph for an event, from the notes provided. Say what the event is, who's performing/involved, and what to expect. Plain prose only — no ticket prices, no 'buy now', no links, no lists, no headings, no source names. If the notes are too thin, write one honest sentence. British English.",
          },
          { role: "user", content: `Event: ${name}\n\nNotes:\n${text.slice(0, 3500)}` },
        ],
        signal,
      )
    ).trim();
  } catch {
    return text.slice(0, 600);
  }
}

/**
 * Full detail for one event card. Ticketmaster gives performers / price / on-sale
 * / blurb from its event endpoint; a web search fills in "what to expect", the
 * line-up and anything Ticketmaster (or Eventbrite) doesn't return.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    await requireTripMember(tripId);
    const q = new URL(request.url).searchParams;
    const name = (q.get("name") ?? "").trim();
    const url = (q.get("url") ?? "").trim();
    const source = (q.get("source") ?? "web").trim().toLowerCase();
    const venueHint = (q.get("venue") ?? "").trim();
    if (!name) return NextResponse.json({ error: "An event name is required" }, { status: 400 });

    const key = `event-detail:${source}:${(url || name).toLowerCase()}`;
    const detail = await cached<EventDetail>(key, 30 * 60_000, async () => {
      const tmConfigured = Boolean(process.env.TICKETMASTER_CONSUMER_KEY || process.env.TICKETMASTER_API_KEY);
      const webConfigured = Boolean(process.env.TAVILY_API_KEY);

      const [tmRes, webRes] = await Promise.allSettled([
        source === "ticketmaster" && tmConfigured && url ? ticketmasterDetail(url, request.signal) : Promise.resolve(null),
        webConfigured
          ? research(`${name} ${venueHint} event — line-up, performers, what to expect, reviews`, request.signal)
          : Promise.resolve([]),
      ]);

      const tm = tmRes.status === "fulfilled" ? tmRes.value : null;
      const web = webRes.status === "fulfilled" ? webRes.value : [];
      const rawAbout = [tm?.info, ...web.map((r) => r.content)].filter(Boolean).join("\n\n");
      const about = await summariseAbout(tm?.title || name, rawAbout, request.signal);

      return eventDetailSchema.parse({
        title: tm?.title || name,
        source,
        url: tm?.url ?? url ?? null,
        imageUrl: tm?.imageUrl ?? q.get("img") ?? null,
        date: tm?.date ?? q.get("date") ?? null,
        status: tm?.status ?? null,
        venueName: tm?.venue?.name ?? venueHint ?? null,
        venueAddress: tm?.venue?.address ?? null,
        latitude: tm?.venue?.latitude ?? null,
        longitude: tm?.venue?.longitude ?? null,
        performers: tm?.performers ?? [],
        genre: tm?.genre ?? null,
        priceRange: tm?.priceRange ?? null,
        onSale: tm?.onSale ?? null,
        promoter: tm?.promoter ?? null,
        about,
        pleaseNote: tm?.pleaseNote ?? null,
        seatmapUrl: tm?.seatmapUrl ?? null,
        sources: web.slice(0, 4).map((r) => ({ title: r.title, url: r.url })),
      } satisfies EventDetail);
    });

    return NextResponse.json({ detail });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Event details are unavailable right now");
  }
}
