import { hotelPhotoSrc } from "@/lib/hotel-photo";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import type { PublicTrip } from "@/lib/server/public-trip";

export function tripTitle(trip: PublicTrip): string {
  const len = trip.durationDays ? `${trip.durationDays} day${trip.durationDays === 1 ? "" : "s"} in ` : "";
  return `${len}${trip.destination}`.trim();
}

function byDay(items: PublicTrip["itinerary"]): Array<{ day: number; items: string[] }> {
  const map = new Map<number, string[]>();
  for (const i of items) map.set(i.dayIndex, [...(map.get(i.dayIndex) ?? []), i.title]);
  return [...map.entries()].sort(([a], [b]) => a - b).map(([day, items]) => ({ day, items }));
}

const fmt = (iso: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" }) : null);

export function SharedTripView({ trip, slug }: { trip: PublicTrip; slug: string }) {
  const days = byDay(trip.itinerary);
  const hasMap = trip.itinerary.some((i) => i.latitude) || trip.places.some((p) => p.latitude);
  const dateLine = fmt(trip.startDate) && fmt(trip.endDate) ? `${fmt(trip.startDate)} – ${fmt(trip.endDate)}` : null;

  const stopCount = trip.itinerary.length;
  const photo = hotelPhotoSrc(trip.stay?.thumbnail ?? null);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/" className="inline-flex items-center gap-2 text-sm" aria-label="Where Next home">
          <BrandMark variant="compact" />
          <BrandMark variant="text" />
        </Link>
        <Link href="/trips/new" className="btn-primary-sm">Plan your own</Link>
      </header>

      <div className="mx-auto max-w-3xl px-5 pb-20">
        {/* The opening shot: the stay's photograph when there is one, a warm wash when there is not. */}
        <section
          className="relative isolate flex min-h-[26rem] flex-col justify-end overflow-hidden rounded-3xl border border-border shadow-soft sm:min-h-[30rem]"
          style={
            photo
              ? undefined
              : {
                  backgroundImage:
                    "radial-gradient(120% 90% at 18% 8%, color-mix(in oklab, var(--coral) 24%, transparent), transparent 62%), radial-gradient(90% 80% at 90% 100%, color-mix(in oklab, var(--cat-see) 14%, transparent), transparent 70%)",
                  backgroundColor: "var(--surface)",
                }
          }
        >
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI
            <img src={photo} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          )}
          {photo && <div aria-hidden className="scrim-v absolute inset-0 -z-10" />}
          <span className="photo-chip landing-rise absolute top-5 left-5" style={{ "--i": 0 } as React.CSSProperties}>
            <span aria-hidden className="size-1.5 rounded-full bg-coral" />
            Shared trip
          </span>
          <div className={`relative p-6 sm:p-9 ${photo ? "text-white" : "text-foreground"}`}>
            <h1 className="landing-rise font-display text-5xl leading-[1.02] font-medium tracking-[-0.03em] text-balance sm:text-6xl" style={{ "--i": 1 } as React.CSSProperties}>
              {trip.name}
            </h1>
            <p className={`landing-rise mt-3 text-lg ${photo ? "text-white/85" : "text-ink-soft"}`} style={{ "--i": 2 } as React.CSSProperties}>
              {tripTitle(trip)}
              {dateLine ? ` · ${dateLine}` : ""}
            </p>
            {(days.length > 0 || trip.places.length > 0) && (
              <div
                className={`landing-rise mt-6 inline-flex divide-x overflow-hidden rounded-2xl border text-left ${photo ? "glass-photo divide-white/20" : "divide-border border-border bg-background/70 backdrop-blur-md"}`}
                style={{ "--i": 3 } as React.CSSProperties}
              >
                {[
                  trip.durationDays ? { v: String(trip.durationDays), l: trip.durationDays === 1 ? "day" : "days" } : null,
                  stopCount ? { v: String(stopCount), l: stopCount === 1 ? "stop" : "stops" } : null,
                  trip.places.length ? { v: String(trip.places.length), l: trip.places.length === 1 ? "place" : "places" } : null,
                ]
                  .filter((s): s is { v: string; l: string } => s !== null)
                  .map((s) => (
                    <div key={s.l} className="px-5 py-3">
                      <div className="font-display text-2xl leading-none font-medium tabular-nums">{s.v}</div>
                      <div className={`mt-1 text-xs ${photo ? "text-white/70" : "text-muted-foreground"}`}>{s.l}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>

        {hasMap && (
          // eslint-disable-next-line @next/next/no-img-element -- proxied static map, no next/image loader for it
          <img src={`/s/${slug}/map`} alt={`Map of ${trip.destination}`} width={640} height={360} className="rise mt-6 w-full rounded-3xl border border-border object-cover shadow-soft" />
        )}

        {days.length > 0 && (
          <section className="mt-14">
            <h2 className="rise font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl">The plan</h2>
            <ol className="mt-6 space-y-4">
              {days.map(({ day, items }) => (
                <li key={day} className="rise relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
                  <span aria-hidden className="pointer-events-none absolute -top-3 right-4 font-display text-8xl leading-none font-medium text-foreground/[0.06] tabular-nums">
                    {String(day).padStart(2, "0")}
                  </span>
                  <p className="eyebrow">Day {day}</p>
                  <ul className="relative mt-3 space-y-2.5">
                    {items.map((title, i) => (
                      <li key={i} className="flex items-start gap-3 text-body leading-snug">
                        <span aria-hidden className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-coral" />
                        {title}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        )}

        {trip.stay && (
          <section className="rise mt-14 overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
            <div className="p-6 sm:p-7">
              <p className="eyebrow">Staying at</p>
              <p className="mt-2 font-display text-2xl leading-snug font-medium tracking-[-0.02em]">{trip.stay.hotelName}</p>
              {trip.stay.roomName && <p className="mt-0.5 text-sm text-ink-soft">{trip.stay.roomName}</p>}
              <p className="mt-3 text-sm text-muted-foreground tabular-nums">
                {fmt(trip.stay.checkin)} → {fmt(trip.stay.checkout)} · {trip.stay.nights} night{trip.stay.nights === 1 ? "" : "s"}
              </p>
            </div>
          </section>
        )}

        {trip.places.length > 0 && (
          <section className="mt-14">
            <h2 className="rise font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl">Saved places</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {trip.places.map((p, i) => (
                <li key={i} className="rise flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-soft">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-coral-soft text-coral-ink shadow-hairline">
                    <MapPin className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{p.name}</p>
                    {p.address && <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.address}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {days.length === 0 && trip.places.length === 0 && !trip.stay && (
          <p className="mt-10 text-center text-sm text-muted-foreground">This trip doesn’t have an itinerary yet.</p>
        )}

        {/* The closing shot: an invitation, not a footer. */}
        <section className="rise relative mt-16 overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground shadow-lift sm:px-10">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ backgroundImage: "radial-gradient(80% 90% at 50% 0%, color-mix(in oklab, var(--coral) 38%, transparent), transparent 70%)" }}
          />
          <div className="relative">
            <h2 className="font-display text-3xl leading-tight font-medium tracking-[-0.03em] text-balance sm:text-4xl">Planning a trip of your own?</h2>
            <p className="mx-auto mt-3 max-w-sm text-base text-primary-foreground/75 text-pretty">Tell Roam where you’re thinking of going. The plan builds itself as you talk.</p>
            <Link href="/trips/new" className="mt-7 inline-flex items-center gap-2 rounded-full bg-background px-6 py-3 text-sm font-medium text-foreground shadow-soft transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.98]">
              Plan your own <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        <p className="mt-10 text-center text-xs text-muted-foreground">Made with Where Next</p>
      </div>
    </main>
  );
}
