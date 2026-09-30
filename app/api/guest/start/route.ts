import { after, NextResponse } from "next/server";
import { z } from "zod";
import { fail, withRoute } from "@/lib/server/with-route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enrichTripFromPrompt } from "@/lib/application/enrich-trip";
import { logger } from "@/lib/server/logger";
import { createTripInput } from "@/features/trip/domain/trip";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { createTrip } from "@/features/trip/application/createTrip";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { DAY_MS, GUEST_IP_START_LIMIT, GUEST_WINDOW_MS, clientKey, guestKey, isGuest } from "@/lib/server/guest";

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
  const marks: string[] = [];
  let last = performance.now();
  const mark = (name: string) => {
    const now = performance.now();
    marks.push(`${name};dur=${Math.round(now - last)}`);
    last = now;
  };
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Tell us a little about the trip." }, { status: 400 });

  try {
    const supabase = await createSupabaseServerClient();
    let { data: { user } } = await supabase.auth.getUser();
    mark("session");

    if (!user || isGuest(user)) {
      // Every guest trip costs a model call to read the sentence, and a fresh session per browser
      // is free to make — so the ceiling is per IP, and it fails closed.
      if (!(await withinRateLimit(`guest-start:${clientKey(request)}`, GUEST_IP_START_LIMIT, DAY_MS, { failClosed: true }))) {
        return NextResponse.json({ error: "You've started a few trips today. Create a free account to keep planning.", code: "guest_busy" }, { status: 429 });
      }
    }
    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously({ options: { captchaToken: parsed.data.captchaToken } });
      if (error || !data.user) {
        return NextResponse.json({ error: "We couldn't start a guest session just now. Please try again in a moment, or create a free account.", code: "guest_unavailable" }, { status: 503 });
      }
      user = data.user;
    } else if (isGuest(user) && !(await withinRateLimit(guestKey.trips(user.id), 3, GUEST_WINDOW_MS, { failClosed: true }))) {
      return NextResponse.json({ error: "Create a free account to start another trip.", code: "guest_limit" }, { status: 403 });
    }

    mark("guest");

    // The trip is created blank and the visitor goes straight to the chat. Reading the sentence
    // with the model used to sit right here and cost several seconds of a busy button; it now
    // runs after the response and fills only what is still empty (Roam's first turn reads the
    // same sentence too, so the chat never waits on it).
    const input = createTripInput.parse({ name: "Untitled trip", idempotencyKey: parsed.data.idempotencyKey });
    const trip = await createTrip(createTripRepository(supabase), user.id, input, { opener: false });
    after(() =>
      enrichTripFromPrompt(supabase, trip.id, parsed.data.prompt).catch((err) =>
        logger.warn({ err, tripId: trip.id }, "couldn't read a guest trip's sentence; the trip stays blank"),
      ),
    );
    mark("create-trip");
    return NextResponse.json({ tripId: trip.id }, { status: 201, headers: { "server-timing": marks.join(", ") } });
  } catch (error) {
    return fail(error, "We couldn’t start that trip. Try again in a moment.");
  }
});
