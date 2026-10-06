import { after, NextResponse } from "next/server";
import { z } from "zod";
import { fail, withRoute } from "@/lib/server/with-route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enrichTripFromPrompt } from "@/lib/application/enrich-trip";
import { logger } from "@/lib/server/logger";
import { createTripInput } from "@/features/trip/domain/trip";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { createTrip } from "@/features/trip/application/createTrip";
import { clearRateLimits, withinRateLimit } from "@/lib/server/rate-limit";
import { LIMITS } from "@/lib/server/limits";
import { GUEST_IP_START_LIMIT, GUEST_TRIP_LIMIT, GUEST_WINDOW_MS, clientKey, guestDeviceCookie, guestDeviceId, guestKey, isGuest, newGuestDeviceId } from "@/lib/server/guest";

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(600),
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

  const charged: string[] = [];
  const refund = () => clearRateLimits(charged).catch(() => undefined);
  // A browser's first start has no cookie yet: give it its id now so this very trip is counted against it.
  const deviceId = guestDeviceId(request) ?? newGuestDeviceId();
  try {
    const supabase = await createSupabaseServerClient();
    let { data: { user } } = await supabase.auth.getUser();
    mark("session");

    // A guest gets ONE trip: counted per IP and per browser over the whole guest window, outliving the session, so a reload,
    // a new tab or cleared cookies does not hand back another. Each counter is charged only once the trip is really made:
    // a start that fails (anonymous sign-ins down, a database error) must not use up the visitor's only trip.
    if (!user || isGuest(user)) {
      const keys = [`guest-start:${clientKey(request)}`, guestKey.deviceTrips(deviceId)];
      const results = await Promise.all(keys.map((key) => withinRateLimit(key, key.startsWith("guest-start:") ? GUEST_IP_START_LIMIT : GUEST_TRIP_LIMIT, GUEST_WINDOW_MS, { failClosed: true })));
      charged.push(...keys.filter((_, i) => results[i]));
      if (results.some((ok) => !ok)) {
        await refund();
        return NextResponse.json({ error: "A guest gets one trip. Create a free account to keep planning.", code: "guest_busy" }, { status: 429 });
      }
    }
    if (user && !isGuest(user)) {
      // A signed-in user skipped every limit above, yet each call still creates a trip and schedules
      // a model call. Hold them to the same per-person model budget as /api/trips/parse (same key).
      if (!(await withinRateLimit(`user-${LIMITS.llm.bucket}:${user.id}`, LIMITS.llm.max, 60 * 60_000))) {
        return NextResponse.json({ error: "You’ve started a lot of trips this hour. Try again in a little while." }, { status: 429 });
      }
    }
    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.user) {
        await refund();
        return NextResponse.json({ error: "We couldn't start a guest session just now. Please try again in a moment, or create a free account.", code: "guest_unavailable" }, { status: 503 });
      }
      user = data.user;
    } else if (isGuest(user) && !(await withinRateLimit(guestKey.trips(user.id), GUEST_TRIP_LIMIT, GUEST_WINDOW_MS, { failClosed: true }))) {
      await refund();
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
    const response = NextResponse.json({ tripId: trip.id }, { status: 201, headers: { "server-timing": marks.join(", ") } });
    // Tag this browser once, so the free-message count follows it across guest sessions (see guestDeviceId).
    if (isGuest(user)) response.cookies.set(guestDeviceCookie(deviceId));
    return response;
  } catch (error) {
    await refund();
    return fail(error, "We couldn’t start that trip. Try again in a moment.");
  }
});
