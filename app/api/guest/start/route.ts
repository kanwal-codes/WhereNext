import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, withRoute } from "@/lib/server/with-route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseTripPrompt } from "@/lib/application/parse-trip";
import { createTripInput } from "@/features/trip/domain/trip";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { createTrip } from "@/features/trip/application/createTrip";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { DAY_MS, GUEST_IP_START_LIMIT, GUEST_WINDOW_MS, clientKey, isGuest } from "@/lib/server/guest";

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(600),
  /** Cloudflare Turnstile token, when the site has one configured (Supabase verifies it). */
  captchaToken: z.string().max(4096).optional(),
  idempotencyKey: z.string().trim().min(1).max(120).optional(),
});

/**
 * The landing page's "just start talking" door. Creates a real draft trip — under an anonymous
 * Supabase session if the visitor has no account — and returns its id; the client then opens the
 * normal trip chat with their sentence as the first message. When the visitor later saves the
 * trip, that same user is upgraded in place, so nothing has to be moved or replayed.
 */
export const POST = withRoute(async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Tell Roam a little about the trip." }, { status: 400 });

  try {
    const supabase = await createSupabaseServerClient();
    let { data: { user } } = await supabase.auth.getUser();

    if (!user || isGuest(user)) {
      // Every guest trip costs a model call to read the sentence, and a fresh session per browser
      // is free to make — so the ceiling is per IP, and it fails closed.
      if (!(await withinRateLimit(`guest-start:${clientKey(request)}`, GUEST_IP_START_LIMIT, DAY_MS, { failClosed: true }))) {
        return NextResponse.json({ error: "That's a lot of new trips for one day. Sign in to keep going.", code: "guest_busy" }, { status: 429 });
      }
    }
    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously({ options: { captchaToken: parsed.data.captchaToken } });
      if (error || !data.user) {
        return NextResponse.json({ error: "We couldn't open a guest session. Sign up to start planning.", code: "guest_unavailable" }, { status: 503 });
      }
      user = data.user;
    } else if (isGuest(user) && !(await withinRateLimit(`guest-trips:${user.id}`, 3, GUEST_WINDOW_MS, { failClosed: true }))) {
      return NextResponse.json({ error: "Save your trip to start another one.", code: "guest_limit" }, { status: 403 });
    }

    const fields = await parseTripPrompt(parsed.data.prompt, request.signal);
    const candidate = createTripInput.safeParse({
      name: fields.name || "New trip",
      destination: fields.destination ?? null,
      origin: fields.origin,
      durationDays: fields.durationDays,
      startDate: fields.startDate,
      endDate: fields.endDate,
      travelerCount: fields.travelerCount,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    // An inconsistent read of the sentence (end before start) shouldn't cost the visitor the trip.
    const input = candidate.success ? candidate.data : createTripInput.parse({ name: fields.name || "New trip", destination: fields.destination ?? null });

    const trip = await createTrip(createTripRepository(supabase), user.id, input);
    return NextResponse.json({ tripId: trip.id }, { status: 201 });
  } catch (error) {
    return fail(error, "We couldn’t start that trip. Try again in a moment.");
  }
});
