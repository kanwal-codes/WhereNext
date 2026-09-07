import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createOrder } from "@/packages/providers/duffel/client";
import { bookFlightInput, toBooking } from "@/packages/contracts/booking";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    if (!process.env.DUFFEL_API_KEY) return NextResponse.json({ error: "Flight booking is not configured" }, { status: 503 });
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

    const result = await supabase
      .from("bookings")
      .upsert(
        { trip_id: tripId, kind: "flight", provider: "duffel", status: order.status, provider_reference: order.orderId, confirmation_code: order.bookingReference, currency: order.totalCurrency, total_amount: order.totalAmount, raw: order.raw, idempotency_key: input.idempotencyKey },
        { onConflict: "trip_id,idempotency_key" },
      )
      .select("id,kind,provider,status,provider_reference,confirmation_code,currency,total_amount,created_at")
      .single();
    if (result.error) throw result.error;
    invalidateWorkspace(tripId);
    return NextResponse.json({ booking: toBooking(result.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid booking request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Booking failed — the offer may have expired, try searching again");
  }
}
