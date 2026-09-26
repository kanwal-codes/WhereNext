import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LandingNext } from "@/components/landing/LandingNext";
import { TripsHome } from "@/components/TripsHome";
import { loadTripsIndex } from "@/lib/server/trips-index";

export const metadata: Metadata = {
  title: "Where next? Plan a trip by talking about it",
  description:
    "A travel workspace where Roam asks, remembers and proposes options you confirm. Every place, stay, flight and forecast is backed by live data with source links.",
  openGraph: {
    title: "Where next?",
    description: "Talk your way to a trip: discover places, map the days, pick where you stay and build the itinerary together.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default async function HomePage() {
  // Was `getUser()` here to decide "redirect to /trips or not", then `/trips` doing its own
  // `getUser()` + trips query again after the redirect landed — two sequential Supabase round
  // trips (plus the redirect's own network hop) for what a signed-in visitor experiences as one
  // click. `loadTripsIndex` does the real check once; a signed-in visitor renders straight into
  // the same `TripsHome` `/trips` would show, no redirect needed. `/trips` stays a real,
  // independently-loading route of its own — sign-in flows and other code link to it directly.
  let data: Awaited<ReturnType<typeof loadTripsIndex>> = null;
  try {
    data = await loadTripsIndex(await createSupabaseServerClient());
  } catch {
    /* Supabase unavailable — show the public landing. */
  }
  if (!data) return <LandingNext />;
  if (data.trips.length === 0) redirect("/trips/new");
  return <TripsHome trips={data.trips} displayName={data.displayName} />;
}
