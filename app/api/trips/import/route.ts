import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/server/with-route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { safeFetch, readCapped, UnsafeUrlError } from "@/lib/server/safe-fetch";
import { htmlToText } from "@/lib/server/html-text";
import { tripImportResultSchema } from "@/packages/contracts/trip-import";
import { createBulkGateway } from "@/packages/ai/gateway";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { createPlaceRepository } from "@/features/places/infrastructure/placeRepository";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { createTrip } from "@/features/trip/application/createTrip";

const GEOCODE_CAP = 15;

const bodySchema = z.object({ url: z.string().trim().url().max(2000), tripId: z.string().uuid().optional() });

const EXTRACTOR = `You extract a trip plan from the text of a web page (a blog post, itinerary, or guide).
Return ONLY a JSON object:
  destination (string, the main city/region), suggestedName (short natural label),
  startDate / endDate ("YYYY-MM-DD", only if the page states real dates),
  places: [{ name, note? }]  — named venues, attractions, restaurants, neighbourhoods the page recommends (max 30),
  notes: [string]            — short planning tips the page makes that are not tied to one place (max 20)
Rules: only include what the page actually says. Never invent a place or a date. If there is no clear destination, set destination to "".`;

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste a valid link." }, { status: 400 });

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (parsed.data.tripId) await requireTripMember(parsed.data.tripId, { role: "editor" });

    let pageText: string;
    try {
      const response = await safeFetch(parsed.data.url, { signal: request.signal });
      if (!response.ok) return NextResponse.json({ error: "That page couldn’t be opened." }, { status: 422 });
      pageText = htmlToText(await readCapped(response));
    } catch (error) {
      if (error instanceof UnsafeUrlError) return NextResponse.json({ error: "That link can’t be imported." }, { status: 400 });
      throw error;
    }
    if (pageText.length < 200) return NextResponse.json({ error: "There wasn’t enough on that page to import." }, { status: 422 });

    const raw = await createBulkGateway().generateStructured(
      [{ role: "system", content: EXTRACTOR }, { role: "user", content: pageText }],
      request.signal,
    );
    const result = tripImportResultSchema.parse(raw);
    if (!result.destination) return NextResponse.json({ error: "Couldn’t tell where that trip is." }, { status: 422 });

    // Geocode the named places against the destination; keep only ones that resolve.
    const provider = new GooglePlacesProvider();
    const geocoded = (
      await Promise.all(
        result.places.slice(0, GEOCODE_CAP).map((p) =>
          provider.search(`${p.name} ${result.destination}`, request.signal).then((hits) => hits[0] ?? null, () => null),
        ),
      )
    ).filter((p): p is NonNullable<typeof p> => p !== null);

    const tripId = parsed.data.tripId
      ? parsed.data.tripId
      : (await createTrip(createTripRepository(supabase), user.id, {
          name: result.suggestedName,
          destination: result.destination,
          startDate: result.startDate,
          endDate: result.endDate,
          preferences: { interests: [] },
        } as Parameters<typeof createTrip>[2])).id;

    const places = createPlaceRepository(supabase, createSupabaseAdminClient());
    let saved = 0;
    for (const place of geocoded) {
      await places.save(tripId, place).then(() => (saved += 1), () => undefined);
    }

    return NextResponse.json({
      tripId,
      created: !parsed.data.tripId,
      imported: { destination: result.destination, name: result.suggestedName, placesFound: result.places.length, placesSaved: saved, notes: result.notes },
    }, { status: parsed.data.tripId ? 200 : 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Couldn’t read that page." }, { status: 422 });
    return tripAuthResponse(error) ?? fail(error, "That link couldn’t be imported. Try again in a moment.");
  }
}
