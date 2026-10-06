import type { Metadata } from "next";
import { headers } from "next/headers";
import { homeAirportFromHeaders } from "@/lib/landing/nearest-airport";
import { LandingNext } from "@/components/landing/LandingNext";

export const metadata: Metadata = {
  title: "Where next? Plan a trip by talking about it",
  robots: { index: false, follow: false },
};

export default async function LandingNextPage() {
  return <LandingNext homeCode={homeAirportFromHeaders(await headers())} />;
}
