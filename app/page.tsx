import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Landing } from "@/components/Landing";

export const metadata: Metadata = {
  title: "Where next? — plan a trip by talking about it",
  description:
    "A travel workspace where Roam asks, remembers and proposes options you confirm — every place, stay, flight and forecast backed by live data with source links.",
  openGraph: {
    title: "Where next?",
    description: "Talk your way to a trip: discover places, map the days, pick where you stay and build the itinerary together.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default async function HomePage() {
  let authed = false;
  try {
    const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
    authed = Boolean(user);
  } catch {
    /* Supabase unavailable — show the public landing. */
  }
  if (authed) redirect("/trips");
  return <Landing />;
}
