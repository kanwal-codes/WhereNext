import { NextResponse } from "next/server";
import { fail } from "@/lib/server/with-route";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Every trip you own, plus its itinerary and locked-in decisions, as one JSON file. */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const trips = await supabase.from("trips").select("*").eq("owner_id", user.id);
    if (trips.error) throw trips.error;
    const tripIds = (trips.data ?? []).map((t) => t.id as string);

    const [itinerary, decisions, places] = await Promise.all([
      tripIds.length ? supabase.from("trip_itinerary_items").select("*").in("trip_id", tripIds) : Promise.resolve({ data: [], error: null }),
      tripIds.length ? supabase.from("trip_decisions").select("*").in("trip_id", tripIds) : Promise.resolve({ data: [], error: null }),
      tripIds.length ? supabase.from("trip_places").select("*,places(*)").in("trip_id", tripIds) : Promise.resolve({ data: [], error: null }),
    ]);

    const body = JSON.stringify(
      { exportedAt: new Date().toISOString(), trips: trips.data ?? [], itinerary: itinerary.data ?? [], decisions: decisions.data ?? [], savedPlaces: places.data ?? [] },
      null,
      2,
    );
    return new NextResponse(body, {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="where-next-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return fail(error, "Your data couldn’t be exported right now.");
  }
}
