import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TripsHome, type TripSummary } from "@/components/TripsHome";

// Same view as `/` — kept so post-sign-in links to `/trips` resolve directly.
export default async function TripsIndexPage() {
  let userId: string | null = null;
  let trips: TripSummary[] = [];
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    if (userId) {
      const result = await supabase
        .from("trips")
        .select("id,name,destination,origin,duration_days,start_date,end_date,travelers")
        .order("updated_at", { ascending: false });
      if (result.error) throw result.error;
      trips = (result.data ?? []) as TripSummary[];
    }
  } catch {
    /* Supabase unavailable — fall through to the sign-in redirect. */
  }
  if (!userId) redirect("/sign-in");
  // First trip not made yet (fresh signup, or the last one just got deleted) — skip the
  // empty list and go straight to the conversation starter instead of a click-through card.
  if (trips.length === 0) redirect("/trips/new");
  return <TripsHome trips={trips} />;
}
