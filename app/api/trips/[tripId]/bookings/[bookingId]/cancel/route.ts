import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail } from "@/lib/server/with-route";
import { cancelOrder } from "@/packages/providers/duffel/client";
import { cancelBooking } from "@/packages/providers/liteapi/client";
import { toBooking } from "@/packages/contracts/booking";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";
import { logger } from "@/lib/server/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Only a provider error that says the order is ALREADY cancelled may be treated as success on a
// retry. Any other error (rejection, 429/5xx, timeout, open breaker) means the booking is still
// live and must not be recorded as cancelled.
const ALREADY_CANCELLED = /already[\s_-]*cancel|cancel[\s_-]*already|order_already/i;

export const POST = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string; bookingId: string }> }) => {
  try {
    const { tripId, bookingId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor", registered: true });
    // `bookings` is read-only for members (migration 0047): the ledger of real provider orders is
    // written by the server only, after the role check above.
    const admin = createSupabaseAdminClient();

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
      const flagged = await admin.from("bookings").update({ raw: { ...raw, cancel_requested_at: new Date().toISOString() } }).eq("id", bookingId).eq("trip_id", tripId);
      if (flagged.error) throw flagged.error;
    }

    try {
      if (existing.data.provider === "duffel") await cancelOrder(existing.data.provider_reference, request.signal);
      else await cancelBooking(existing.data.provider_reference, request.signal);
    } catch (providerError) {
      // A first attempt failing here is a real cancellation failure — safe to just report and
      // let the user retry, nothing has been persisted as cancelled yet. A retry whose earlier
      // attempt got as far as asking the provider may find the order already cancelled and the
      // provider rejecting the redundant call — but ONLY that specific answer counts as success.
      // Treating every provider error as "already cancelled" recorded still-live, chargeable
      // bookings as cancelled.
      const message = providerError instanceof Error ? providerError.message : String(providerError);
      if (!alreadyRequested || !ALREADY_CANCELLED.test(message)) throw providerError;
      logger.warn({ err: providerError, tripId, bookingId, provider: existing.data.provider }, "cancel retry: provider reports the order is already cancelled");
    }

    // The provider has now committed the cancellation (or already had, per the retry branch
    // above) — log before the write below so a failed write is still detectable for manual
    // reconciliation instead of silently leaving the booking stuck showing "confirmed".
    logger.info({ tripId, bookingId, provider: existing.data.provider, providerReference: existing.data.provider_reference }, "booking cancelled with provider, persisting");

    let result;
    try {
      result = await admin
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", bookingId)
        .eq("trip_id", tripId)
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
});
