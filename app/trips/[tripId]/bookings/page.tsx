"use client";

import Link from "next/link";
import { ArrowRight, BedDouble, CalendarCheck, Sparkles } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { EssentialsSurface } from "@/features/essentials/ui/EssentialsSurface";
import { Reveal, Tactile } from "@/components/motion-primitives";
import { readStayDecision } from "@/packages/contracts/stay";

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export default function BookingsPage() {
  const { tripId, data } = useTripData();
  const decisions = (data?.decisions ?? []) as Array<{ kind: string; value: Record<string, unknown> }>;
  const stay = readStayDecision(decisions);
  const destination = data?.trip?.destination ?? "your destination";

  return (
    <RouteScaffold
      eyebrow="Bookings & essentials"
      title="Before you go"
      description="What's locked in, and the practical checklist. For destination-specific essentials — visas, SIMs, customs — ask the assistant to build one."
    >
      <div className="space-y-8">
        <section>
          <h2 className="font-display text-lg">Your bookings</h2>
          {stay ? (
            <Reveal delay={0.04}>
              <Tactile lift={2} className="mt-3 block">
                <Link
                  href={`/trips/${tripId}/stay/${encodeURIComponent(stay.hotelId)}?checkin=${stay.checkin}&checkout=${stay.checkout}`}
                  className="flex items-center gap-4 overflow-hidden rounded-2xl border border-leaf/30 bg-card p-4 shadow-soft"
                >
                  {stay.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element -- external hotel image
                    <img src={stay.thumbnail} alt={stay.hotelName} width={96} height={96} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                  )}
                  <div className="min-w-0">
                    <p className="eyebrow inline-flex items-center gap-1.5 text-leaf"><BedDouble className="h-3.5 w-3.5" /> Stay</p>
                    <p className="mt-0.5 truncate font-medium">{stay.hotelName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {fmtDay(stay.checkin)} → {fmtDay(stay.checkout)} · {stay.nights} night{stay.nights === 1 ? "" : "s"} ·{" "}
                      <span className="tabular-nums text-foreground">{stay.totalAmount} {stay.currency}</span>
                    </p>
                  </div>
                </Link>
              </Tactile>
            </Reveal>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-5">
              <p className="text-sm font-medium">Nothing booked yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Lock a place to stay from the Stay tab, or ask the assistant to compare options.
              </p>
              <Link href={`/trips/${tripId}/stay`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                Find a stay <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg">
              <CalendarCheck className="h-4 w-4 text-coral" /> Checklist
            </h2>
          </div>
          <div className="mt-3">
            <EssentialsSurface tripId={tripId} initialCompleted={data?.essentials} />
          </div>
        </section>

        <Reveal delay={0.08}>
          <Tactile lift={2} className="block">
            <Link
              href={`/trips/${tripId}/chat?ask=${encodeURIComponent(`Build me a pre-trip essentials checklist for ${destination} — visas, SIM/eSIM, power plugs, currency, tipping, transit passes, safety, and anything else I should sort before I go.`)}`}
              className="flex items-start gap-3 rounded-2xl border border-coral/25 bg-gradient-to-br from-card to-coral-soft/40 p-5 shadow-soft"
            >
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
              <span>
                <span className="font-medium">Get a checklist for {destination}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Visas, eSIM, plugs, currency, transit passes — the assistant builds one for exactly where you&rsquo;re going.
                </span>
              </span>
            </Link>
          </Tactile>
        </Reveal>
      </div>
    </RouteScaffold>
  );
}
