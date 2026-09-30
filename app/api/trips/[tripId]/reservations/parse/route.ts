import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { generateStructured } from "@/packages/ai/model-policy";
import { resolveCurrency } from "@/lib/currency";
import { MAX_CONFIRMATION_CHARS, extractedReservationSchema, extractionPrompt, toDraft } from "@/lib/reservation-draft";

/**
 * Reads a pasted confirmation and returns a DRAFT reservation for the form. It saves nothing and
 * the traveller reviews every field before anything is stored.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { role: "editor" });
    const parsed = z.object({ text: z.string().trim().min(10).max(MAX_CONFIRMATION_CHARS) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Paste the confirmation text (up to 8,000 characters)." }, { status: 400 });
    if (!(await withinRateLimit(`reservation-parse:${user.id}`, 20, 60 * 60_000))) {
      return NextResponse.json({ error: "That's a lot of confirmations. Try again in a little while." }, { status: 429 });
    }
    const [trip, prefs] = await Promise.all([
      supabase.from("trips").select("start_date").eq("id", tripId).maybeSingle(),
      supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle(),
    ]);
    const startDate = (trip.data?.start_date as string | null | undefined) ?? null;
    const extracted = await generateStructured(
      "bulk",
      [
        { role: "system", content: extractionPrompt(startDate) },
        { role: "user", content: `Confirmation text:\n"""\n${parsed.data.text}\n"""` },
      ],
      extractedReservationSchema,
      request.signal,
    );
    return NextResponse.json({ draft: toDraft(extracted, resolveCurrency((prefs.data?.data ?? null) as Record<string, unknown> | null)) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Couldn't read that confirmation. You can still fill it in by hand.");
  }
}
