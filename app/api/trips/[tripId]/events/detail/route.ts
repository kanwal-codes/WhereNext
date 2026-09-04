import { NextResponse } from "next/server";
import { z } from "zod";
import { eventDetailSchema, type EventDetail } from "@/packages/contracts/event";
import { eventDetail as ticketmasterDetail, eventDetailBySearch, ticketmasterIdFromUrl, type TicketmasterEventDetail } from "@/packages/providers/ticketmaster/client";
import { research } from "@/packages/providers/tavily/client";
import { createBulkGateway } from "@/packages/ai/gateway";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { cached } from "@/lib/server/ttl-cache";

const tmConfigured = () => Boolean(process.env.TICKETMASTER_CONSUMER_KEY || process.env.TICKETMASTER_API_KEY);
const webConfigured = () => Boolean(process.env.TAVILY_API_KEY);
const aiConfigured = () => Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.CEREBRAS_API_KEY || process.env.GEMINI_API_KEY);

/** Ticketmaster's `pleaseNote` is often just bilingual terms-and-conditions boilerplate — drop that. */
function usefulNote(note: string | null | undefined): string | null {
  const t = (note ?? "").trim();
  if (!t) return null;
  if (t.length > 180 && /(terms and conditions|code of conduct|privacy policy|politique de confidentialit)/i.test(t)) return null;
  return t;
}

/** "City, Country" from a formatted address. */
function cityFrom(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.slice(-2).join(", ") || null;
}

/**
 * Find the Ticketmaster event behind this card. A TM url gives it directly; otherwise
 * (Eventbrite / PredictHQ / a web hit) search TM by name + city and match on the title.
 */
async function resolveTicketmaster(
  name: string,
  url: string,
  venueHint: string,
  dateHint: string,
  signal?: AbortSignal,
): Promise<TicketmasterEventDetail | null> {
  if (!tmConfigured()) return null;
  // Try the direct id first; the by-id endpoint 404s for a lot of the app's own cards, so
  // fall back to matching the event in a keyword search (same rich payload, resolvable id).
  const byId = /^https?:/i.test(url) && ticketmasterIdFromUrl(url) ? await ticketmasterDetail(url, signal).catch(() => null) : null;
  if (byId) return byId;
  const lastPart = venueHint.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return eventDetailBySearch(name, lastPart, dateHint, signal).catch(() => null);
}

const enrichmentSchema = z.object({
  about: z.string().max(700).nullable(),
  whatToExpect: z.string().max(700).nullable(),
  lineupNote: z.string().max(300).nullable(),
  ageInfo: z.string().max(120).nullable(),
  doorsTime: z.string().max(40).nullable(),
});

/** One structured pass over provider + web notes → the polished fields the page renders. */
async function enrich(
  name: string,
  known: { genre?: string | null; venue?: string | null; date?: string | null; performers: string[] },
  notes: string,
  signal?: AbortSignal,
): Promise<z.infer<typeof enrichmentSchema>> {
  const empty = { about: null, whatToExpect: null, lineupNote: null, ageInfo: null, doorsTime: null };
  const text = notes.trim();
  if (!text || !aiConfigured()) return empty;
  try {
    const raw = await createBulkGateway().generateStructured(
      [
        {
          role: "system",
          content:
            'You clean messy event notes into a JSON object. Keys: "about", "whatToExpect", "lineupNote", "ageInfo", "doorsTime". ' +
            '"about" = 2–4 plain sentences on what the event is and who is performing/involved. ' +
            '"whatToExpect" = 1–3 sentences on the practical night: format, running time, set times, support acts order, atmosphere — only what the notes actually support. ' +
            '"lineupNote" = one sentence naming support acts / who else is on the bill, or null. ' +
            '"ageInfo" = the age policy verbatim if stated (e.g. "18+"), else null. "doorsTime" = doors/entry time if stated (e.g. "7:00 PM"), else null. ' +
            "Use British English. No ticket prices, no links, no source names, no marketing language, no headings, no lists. " +
            "If the notes are too thin for a field, set it to null — never pad or guess. Output ONLY the JSON object.",
        },
        {
          role: "user",
          content:
            `Event: ${name}\n` +
            `Genre: ${known.genre ?? "unknown"} · Venue: ${known.venue ?? "unknown"} · Date: ${known.date ?? "unknown"}\n` +
            `Billed acts: ${known.performers.join(", ") || "unknown"}\n\nNotes:\n${text.slice(0, 4000)}`,
        },
      ],
      signal,
    );
    return enrichmentSchema.parse(raw);
  } catch {
    // Fall back to a trimmed raw blurb rather than nothing.
    return { ...empty, about: text.slice(0, 500) || null };
  }
}

/**
 * Full detail for one event card. Ticketmaster is the backbone (line-up, price,
 * on-sale window, doors, seat map); two targeted web searches fill in what it
 * doesn't return, and one AI pass turns the pile of notes into clean prose.
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
    const dateHint = (q.get("date") ?? "").trim();
    if (!name) return NextResponse.json({ error: "An event name is required" }, { status: 400 });

    const key = `event-detail:v2:${(url || `${name}|${venueHint}`).toLowerCase()}`;
    const detail = await cached<EventDetail>(key, 30 * 60_000, async () => {
      const tm = await resolveTicketmaster(name, url, venueHint, dateHint, request.signal);

      const title = tm?.title || name;
      const venue = tm?.venue?.name || venueHint || null;
      const date = tm?.date || dateHint || null;
      const performers = tm?.performers ?? [];

      const [lineupRes, expectRes] = await Promise.allSettled([
        webConfigured()
          ? research(`${title} ${venue ?? ""} ${date ?? ""} — full line-up, support acts, set times, doors open`.trim(), request.signal)
          : Promise.resolve([]),
        webConfigured()
          ? research(`${title} ${venue ?? ""} — what to expect, running time, format, age restriction, fan reviews`.trim(), request.signal)
          : Promise.resolve([]),
      ]);
      const lineupWeb = lineupRes.status === "fulfilled" ? lineupRes.value : [];
      const expectWeb = expectRes.status === "fulfilled" ? expectRes.value : [];
      const web = [...lineupWeb, ...expectWeb];

      const notes = [tm?.info, usefulNote(tm?.pleaseNote), ...web.map((r) => r.content)].filter(Boolean).join("\n\n");
      const ai = await enrich(title, { genre: tm?.genre, venue, date, performers }, notes, request.signal);

      const ticketOptions: EventDetail["ticketOptions"] = [];
      const primaryUrl = tm?.url || (source !== "web" && url ? url : null);
      if (primaryUrl) ticketOptions.push({ label: `Buy on ${tm?.url ? "Ticketmaster" : source}`, url: primaryUrl });
      if (tm?.url && url && url !== tm.url && /^https?:/i.test(url)) ticketOptions.push({ label: `Also on ${source}`, url });
      ticketOptions.push({
        label: "Search all sellers",
        url: `https://www.google.com/search?q=${encodeURIComponent(`${title} ${venue ?? ""} tickets`.trim())}`,
      });

      return eventDetailSchema.parse({
        title,
        source: tm?.url ? "ticketmaster" : source,
        url: primaryUrl,
        imageUrl: tm?.imageUrl ?? q.get("img") ?? null,
        date,
        doorsTime: tm?.doorsTime ?? ai.doorsTime ?? null,
        status: tm?.status ?? null,
        venueName: venue,
        venueAddress: tm?.venue?.address ?? null,
        city: tm?.venue?.city ?? cityFrom(tm?.venue?.address) ?? cityFrom(venueHint),
        latitude: tm?.venue?.latitude ?? null,
        longitude: tm?.venue?.longitude ?? null,
        performers,
        lineupNote: ai.lineupNote,
        genre: tm?.genre ?? null,
        priceRange: tm?.priceRange ?? null,
        onSale: tm?.onSale ?? null,
        promoter: tm?.promoter ?? null,
        ageInfo: tm?.ageInfo ?? ai.ageInfo ?? null,
        about: ai.about,
        whatToExpect: ai.whatToExpect,
        pleaseNote: usefulNote(tm?.pleaseNote),
        seatmapUrl: tm?.seatmapUrl ?? null,
        ticketOptions: ticketOptions.slice(0, 4),
        sources: web.slice(0, 5).map((r) => ({ title: r.title, url: r.url })),
      } satisfies EventDetail);
    });

    return NextResponse.json({ detail });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Event details are unavailable right now");
  }
}
