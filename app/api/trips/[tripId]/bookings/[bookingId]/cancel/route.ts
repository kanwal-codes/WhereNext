import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { cancelOrder } from "@/packages/providers/duffel/client";
import { cancelBooking } from "@/packages/providers/liteapi/client";
import { toBooking } from "@/packages/contracts/booking";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";
import { logger } from "@/lib/server/logger";

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string; bookingId: string }> }) {
  try {
    const { tripId, bookingId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor", registered: true });

    const existing = await supabase
      .from("bookings")
      .select("id,kind,provider,status,provider_reference,confirmation_code,currency,total_amount,created_at,raw")
      .eq("trip_id", tripId)
      .eq("id", bookingId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (existing.data.status === "cancelled") return NextResponse.json({ booking: toBooking(existing.data) });
    if (!existing.data.provider_reference) return NextResponse.json({ error: "This booking has no provider reference to cancel" }, { status: 409 });

    const raw = (existing.data.raw ?? {}) as Record<string, unknown>;
    // Set before calling the provider, distinct from the "cancelled with provider" log below —
    // this survives even if the provider call itself never completes, so a retry can tell
    // "never asked" apart from "asked before, response lost" (see the retry branch below).
    const alreadyRequested = Boolean(raw.cancel_requested_at);
    if (!alreadyRequested) {
      const flagged = await supabase.from("bookings").update({ raw: { ...raw, cancel_requested_at: new Date().toISOString() } }).eq("id", bookingId);
      if (flagged.error) throw flagged.error;
    }

    try {
      if (existing.data.provider === "duffel") await cancelOrder(existing.data.provider_reference, request.signal);
      else await cancelBooking(existing.data.provider_reference, request.signal);
    } catch (providerError) {
      // A first attempt failing here is a real cancellation failure — safe to just report and
      // let the user retry, nothing has been persisted as cancelled yet. But a retry that
      // already flagged cancel_requested_at on a prior attempt most likely means the provider
      // already cancelled it and is now rejecting the redundant confirm call — treat that as
      // success rather than looping the user through the same failure forever.
      if (!alreadyRequested) throw providerError;
      logger.warn({ err: providerError, tripId, bookingId, provider: existing.data.provider }, "cancel retry: provider rejected re-cancellation, treating as already cancelled");
    }

    // The provider has now committed the cancellation (or already had, per the retry branch
    // above) — log before the write below so a failed write is still detectable for manual
    // reconciliation instead of silently leaving the booking stuck showing "confirmed".
    logger.info({ tripId, bookingId, provider: existing.data.provider, providerReference: existing.data.provider_reference }, "booking cancelled with provider, persisting");

    let result;
    try {
      result = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", bookingId)
        .select("id,kind,provider,status,provider_reference,confirmation_code,currency,total_amount,created_at")
        .single();
      if (result.error) throw result.error;
    } catch (writeError) {
      logger.error({ err: writeError, tripId, bookingId, provider: existing.data.provider }, "booking cancelled with provider but failed to persist — needs manual reconciliation");
      return NextResponse.json({ error: "This was cancelled with the provider, but we couldn't update the trip — refresh in a moment before trying again." }, { status: 500 });
    }
    invalidateWorkspace(tripId);
    return NextResponse.json({ booking: toBooking(result.data) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Cancellation failed — try again in a moment");
  }
}
