import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPublicTrip, type PublicTrip } from "@/lib/server/public-trip";

export const dynamic = "force-dynamic";

function tripTitle(trip: PublicTrip): string {
  const len = trip.durationDays ? `${trip.durationDays} day${trip.durationDays === 1 ? "" : "s"} in ` : "";
  return `${len}${trip.destination}`.trim();
}

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
    openGraph: { title, description, type: "website", images: [`/s/${(await params).slug}/map`] },
    twitter: { card: "summary_large_image", title, description },
  };
}

function byDay(items: PublicTrip["itinerary"]): Array<{ day: number; items: string[] }> {
  const map = new Map<number, string[]>();
  for (const i of items) map.set(i.dayIndex, [...(map.get(i.dayIndex) ?? []), i.title]);
  return [...map.entries()].sort(([a], [b]) => a - b).map(([day, items]) => ({ day, items }));
}

const fmt = (iso: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" }) : null);

export default async function PublicTripPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trip = await loadPublicTrip(slug);
  if (!trip) notFound();

  const days = byDay(trip.itinerary);
  const hasMap = trip.itinerary.some((i) => i.latitude) || trip.places.some((p) => p.latitude);
  const dateLine = fmt(trip.startDate) && fmt(trip.endDate) ? `${fmt(trip.startDate)} – ${fmt(trip.endDate)}` : null;

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Shared trip</p>
      <h1 className="mt-2 font-display text-3xl leading-tight">{trip.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {tripTitle(trip)}
        {dateLine ? ` · ${dateLine}` : ""}
      </p>

      {hasMap && (
        // eslint-disable-next-line @next/next/no-img-element -- proxied static map, no next/image loader for it
        <img src={`/s/${slug}/map`} alt={`Map of ${trip.destination}`} width={640} height={360} className="mt-6 w-full rounded-2xl border border-border object-cover" />
      )}

      {days.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg">Itinerary</h2>
          <ol className="mt-3 space-y-4">
            {days.map(({ day, items }) => (
              <li key={day}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Day {day}</p>
                <ul className="mt-1 space-y-1">
                  {items.map((title, i) => (
                    <li key={i} className="text-sm">{title}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}

      {trip.places.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg">Saved places</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {trip.places.map((p, i) => (
              <li key={i} className="rounded-xl border border-border bg-card px-3 py-2">
                <p className="text-sm font-medium">{p.name}</p>
                {p.address && <p className="truncate text-xs text-muted-foreground">{p.address}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {days.length === 0 && trip.places.length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground">This trip doesn’t have an itinerary yet.</p>
      )}

      <div className="mt-12 rounded-2xl border border-border bg-card p-5 text-center">
        <p className="text-sm font-medium">Planning a trip of your own?</p>
        <Link href="/trips/new" className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Plan your own
        </Link>
      </div>
    </main>
  );
}
