import { NextResponse } from "next/server";
import { DAILY_TRIP_TURN_LIMIT, DAILY_TURN_LIMIT } from "@/packages/ai/model-policy";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { GUEST_IP_TURN_LIMIT, GUEST_TURN_LIMIT, GUEST_WINDOW_MS, clientKey, guestDeviceId, guestKey } from "@/lib/server/guest";

/** The answer to send instead of running the turn when any of its rate limits is used up, or null when it may run. */
export async function turnLimitRefusal(input: { request: Request; userId: string; tripId: string; guest: boolean }): Promise<NextResponse | null> {
  const { request, userId, tripId, guest } = input;
  // Every limit is checked at once (each is a round trip to the rate limiter), then the first one that failed, in the
  // order they used to be checked, decides the answer. The message that hits a limit is still never saved.
  const device = guest ? guestDeviceId(request) : null;
  const checks: Array<{ pass: Promise<boolean>; refuse: () => NextResponse }> = [
    {
      pass: withinRateLimit(`ai-turn:${userId}`, DAILY_TURN_LIMIT, 24 * 60 * 60_000),
      refuse: () => NextResponse.json({ error: "You've hit today's limit for assistant messages. Try again tomorrow." }, { status: 429 }),
    },
    // Per-user limits don't add up to a per-trip ceiling — a group trip's members each get their
    // own budget above, so nothing bounded the trip's total cost until now.
    {
      pass: withinRateLimit(`ai-turn-trip:${tripId}`, DAILY_TRIP_TURN_LIMIT, 24 * 60 * 60_000),
      refuse: () => NextResponse.json({ error: "This trip has hit today's shared assistant limit. Try again tomorrow." }, { status: 429 }),
    },
  ];
  // Guests (anonymous sessions) get a handful of free messages, enforced here — never only in
  // the browser. All three counters fail closed: this is the one unauthenticated door to paid model/tool calls.
  if (guest) {
    checks.push({
      pass: withinRateLimit(`guest-ip-turns:${clientKey(request)}`, GUEST_IP_TURN_LIMIT, GUEST_WINDOW_MS, { failClosed: true }),
      refuse: () => NextResponse.json({ error: "Roam is busy right now. Save your trip and pick it up from your account.", code: "guest_busy" }, { status: 429 }),
    });
    // The free messages belong to the browser, not the session: a reload deletes the guest user (and its counter), and
    // this one outlives that.
    if (device) {
      checks.push({
        pass: withinRateLimit(guestKey.deviceTurns(device), GUEST_TURN_LIMIT, GUEST_WINDOW_MS, { failClosed: true }),
        refuse: () => NextResponse.json({ error: "Save your trip to keep planning with Roam.", code: "guest_limit" }, { status: 403 }),
      });
    }
    checks.push({
      pass: withinRateLimit(guestKey.turns(userId), GUEST_TURN_LIMIT, GUEST_WINDOW_MS, { failClosed: true }),
      refuse: () => NextResponse.json({ error: "Save your trip to keep planning with Roam.", code: "guest_limit" }, { status: 403 }),
    });
  }
  const passed = await Promise.all(checks.map((check) => check.pass));
  const refused = checks.find((_, index) => !passed[index]);
  return refused ? refused.refuse() : null;
}
