import { NextResponse } from "next/server";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";

/** The cover photograph for a trip's destination: `{ photoName }`, or null when nothing suitable exists. */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    await requireTripMember(tripId);
    const destination = new URL(request.url).searchParams.get("destination")?.trim();
    if (!destination) return NextResponse.json({ photoName: null });
    return NextResponse.json({ photoName: await new GooglePlacesProvider().coverPhoto(destination, request.signal) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Cover photo unavailable");
  }
}
