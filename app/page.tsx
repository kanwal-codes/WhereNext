import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LandingNext } from "@/components/landing/LandingNext";
import { TripsHome } from "@/components/TripsHome";
import { loadTripsIndex } from "@/lib/server/trips-index";
import { homeAirportFromHeaders } from "@/lib/landing/nearest-airport";

export const metadata: Metadata = {
  title: "Where Next — AI Trip Planner for Group Travel",
  description:
    "Plan trips together with Roam. Discover places, compare stays and flights, and build an itinerary everyone can agree on — all in one calm workspace.",
  openGraph: {
    title: "Where Next — AI Trip Planner for Group Travel",
    description:
      "Plan trips together with Roam. Discover places, compare stays and flights, and build an itinerary everyone can agree on.",
    type: "website",
  },
  alternates: { canonical: "/" },
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
  if (!data) return <LandingNext homeCode={homeAirportFromHeaders(await headers())} />;
  if (data.trips.length === 0) redirect("/trips/new");
  return <TripsHome trips={data.trips} displayName={data.displayName} userId={data.userId} />;
}
