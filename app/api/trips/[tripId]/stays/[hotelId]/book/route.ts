import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { liteApiConfigured, prebookRate, bookStay } from "@/packages/providers/liteapi/client";
import { bookStayInput, toBooking } from "@/packages/contracts/booking";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";
import { logger } from "@/lib/server/logger";
import { withinRateLimit } from "@/lib/server/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { role: "editor" });
    if (!liteApiConfigured()) return NextResponse.json({ error: "Stay booking is not configured" }, { status: 503 });
    // A leaked/forwarded invite link (editor role, no email binding, unlimited redemption) is
    // otherwise a blank check against the trip owner's connected provider account.
    if (!(await withinRateLimit(`book:${user.id}`, 20, 60 * 60_000))) {
      return NextResponse.json({ error: "Too many booking attempts. Try again in a while." }, { status: 429 });
    }
    const input = bookStayInput.parse(await request.json());

    // Check before calling LiteAPI, not after — a retry (double-click, timed-out first
    // attempt) must never place a second real booking just to have it overwritten by the upsert.
    // ponytail: no lock between this check and the insert below — add a DB advisory lock if
    // double-booking is ever seen.
    const existing = await supabase
      .from("bookings")
      .select("id,kind,provider,status,provider_reference,confirmation_code,currency,total_amount,created_at")
      .eq("trip_id", tripId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return NextResponse.json({ booking: toBooking(existing.data) }, { status: 200 });

    const { prebookId } = await prebookRate(input.offerId, request.signal);
    const booking = await bookStay(prebookId, input.guests, request.signal);

    // The provider has now committed a real reservation. Log its reference before the write
    // below — if that write fails, this log line is the only record that a real booking exists
    // and needs manual reconciliation instead of being silently retried into a duplicate.
    logger.info({ tripId, provider: "liteapi", providerReference: booking.bookingId, idempotencyKey: input.idempotencyKey }, "stay booked with provider, persisting");

    let result;
    try {
      result = await supabase
        .from("bookings")
        .upsert(
          { trip_id: tripId, kind: "stay", provider: "liteapi", status: booking.status.toLowerCase() === "confirmed" ? "confirmed" : "pending", provider_reference: booking.bookingId, confirmation_code: booking.confirmationCode, currency: booking.currency, total_amount: booking.totalAmount, raw: booking.raw, idempotency_key: input.idempotencyKey },
          { onConflict: "trip_id,idempotency_key" },
        )
        .select("id,kind,provider,status,provider_reference,confirmation_code,currency,total_amount,created_at")
        .single();
      if (result.error) throw result.error;
    } catch (writeError) {
      // A real reservation exists with the provider (reference logged above) but we failed to
      // record it — the idempotency check on a retry would find nothing and book a second one.
      // Tell the user not to retry instead of inviting exactly that.
      logger.error({ err: writeError, tripId, provider: "liteapi", providerReference: booking.bookingId }, "stay booked with provider but failed to persist — needs manual reconciliation");
      return NextResponse.json({ error: "Your stay may already be booked with the provider — contact support before trying again." }, { status: 500 });
    }
    invalidateWorkspace(tripId);
    return NextResponse.json({ booking: toBooking(result.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid booking request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Booking failed — the rate may no longer be available, try searching again");
  }
}
