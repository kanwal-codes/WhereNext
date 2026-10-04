import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TripsHome } from "@/components/TripsHome";
import { loadTripsIndex } from "@/lib/server/trips-index";

export const metadata = { title: "Your trips — Where next?" };

// Same view as `/` — kept so post-sign-in links to `/trips` resolve directly.
export default async function TripsIndexPage() {
  let data: Awaited<ReturnType<typeof loadTripsIndex>> = null;
  try {
    data = await loadTripsIndex(await createSupabaseServerClient());
  } catch {
    /* Supabase unavailable — fall through to the sign-in redirect. */
  }
  if (!data) redirect("/sign-in");
  // First trip not made yet (fresh signup, or the last one just got deleted) — skip the
  // empty list and go straight to the conversation starter instead of a click-through card.
  if (data.trips.length === 0) redirect("/trips/new");
  return <TripsHome trips={data.trips} displayName={data.displayName} />;
}
