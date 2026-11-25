import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicTrip } from "@/lib/server/public-trip";
import { SharedTripView, tripTitle } from "@/components/SharedTripView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const trip = await loadPublicTrip((await params).slug);
  if (!trip) return { title: "Trip not found", robots: { index: false } };
  const title = tripTitle(trip);
  const description = trip.places.length
    ? `${trip.places.slice(0, 4).map((p) => p.name).join(" · ")}${trip.places.length > 4 ? " and more" : ""}`
    : `A trip plan for ${trip.destination}.`;
  return {
    title,
    description,
    // "Unlisted": anyone with the link can open it and link previews still read the tags below, but search engines do not index it.
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", images: [`/s/${(await params).slug}/map`] },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PublicTripPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trip = await loadPublicTrip(slug);
  if (!trip) notFound();
  return <SharedTripView trip={trip} slug={slug} />;
}
