import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createOrder } from "@/packages/providers/duffel/client";
import { bookFlightInput, toBooking } from "@/packages/contracts/booking";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";
import { logger } from "@/lib/server/logger";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { role: "editor", registered: true });
    if (!process.env.DUFFEL_API_KEY) return NextResponse.json({ error: "Flight booking is not configured" }, { status: 503 });
    // A leaked/forwarded invite link (editor role, no email binding, unlimited redemption) is
    // otherwise a blank check against the trip owner's connected provider account.
    if (!(await withinRateLimit(`book:${user.id}`, 20, 60 * 60_000))) {
      return NextResponse.json({ error: "Too many booking attempts. Try again in a while." }, { status: 429 });
    }
    const input = bookFlightInput.parse(await request.json());

    // Check before calling Duffel, not after — a retry (double-click, timed-out first
    // attempt) must never place a second real order just to have it overwritten by the upsert.
    // ponytail: no lock between this check and the insert below, so two requests within the
    // same instant can still both book — add a DB advisory lock if double-booking is ever seen.
    const existing = await supabase
      .from("bookings")
      .select("id,kind,provider,status,provider_reference,confirmation_code,currency,total_amount,created_at")
      .eq("trip_id", tripId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return NextResponse.json({ booking: toBooking(existing.data) }, { status: 200 });

    const order = await createOrder(input.offerId, input.passengers.map((p) => p.id), input.passengers, request.signal);

    // The provider has now committed a real order. Log its reference before the write below —
    // if that write fails, this log line is the only record that a real order exists and needs
    // manual reconciliation instead of being silently retried into a duplicate.
    logger.info({ tripId, provider: "duffel", providerReference: order.orderId, idempotencyKey: input.idempotencyKey }, "flight ordered with provider, persisting");

    let result;
    try {
      // `bookings` is read-only for members (migration 0047): the ledger of real provider orders is
      // written by the server only, after requireTripMember(editor, registered). A plain insert, not
      // an upsert: if a concurrent request with the same idempotency key already recorded a booking,
      // overwriting its provider_reference would orphan that real order.
      const admin = createSupabaseAdminClient();
      const inserted = await admin
        .from("bookings")
        .insert(
          { trip_id: tripId, kind: "flight", provider: "duffel", status: order.status, provider_reference: order.orderId, confirmation_code: order.bookingReference, currency: order.totalCurrency, total_amount: order.totalAmount, raw: order.raw, idempotency_key: input.idempotencyKey },
        )
        .select("id,kind,provider,status,provider_reference,confirmation_code,currency,total_amount,created_at")
        .single();
      if (inserted.error && inserted.error.code === "23505") {
        logger.error({ tripId, provider: "duffel", providerReference: order.orderId, idempotencyKey: input.idempotencyKey }, "second provider booking for an idempotency key already recorded — needs manual reconciliation");
        const first = await admin.from("bookings").select("id,kind,provider,status,provider_reference,confirmation_code,currency,total_amount,created_at").eq("trip_id", tripId).eq("idempotency_key", input.idempotencyKey).single();
        if (first.error) throw first.error;
        return NextResponse.json({ booking: toBooking(first.data) }, { status: 200 });
      }
      if (inserted.error) throw inserted.error;
      result = inserted;
    } catch (writeError) {
      // A real order exists with the provider (reference logged above) but we failed to record
      // it — the idempotency check on a retry would find nothing and order a second one. Tell
      // the user not to retry instead of inviting exactly that.
      logger.error({ err: writeError, tripId, provider: "duffel", providerReference: order.orderId }, "flight ordered with provider but failed to persist — needs manual reconciliation");
      return NextResponse.json({ error: "Your flight may already be booked with the provider — contact support before trying again." }, { status: 500 });
    }
    invalidateWorkspace(tripId);
    return NextResponse.json({ booking: toBooking(result.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid booking request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Booking failed — the offer may have expired, try searching again");
  }
}
