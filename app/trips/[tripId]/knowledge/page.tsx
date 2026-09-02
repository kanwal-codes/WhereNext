"use client";

import Link from "next/link";
import { useTripData } from "@/components/TripDataProvider";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/motion-primitives";
import { TripContextSurface } from "@/features/workspace/ui/TripContextSurface";
import { BudgetSurface } from "@/features/budget/ui/BudgetSurface";
import type { Trip } from "@/features/trip/domain/trip";

type SavedPlace = { places?: { id: string; name: string; category?: string | null; address?: string | null } };

export default function KnowledgePage() {
  const { tripId, data } = useTripData();
  const trip = (data?.trip as Trip) ?? null;
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const saved = ((data?.savedPlaces ?? []) as SavedPlace[]).map((s) => s.places).filter(Boolean) as NonNullable<SavedPlace["places"]>[];

  const asList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const undecided = [
    trip?.duration_days ? null : "Trip length",
    prefs.budget === undefined ? "Daily budget" : null,
    str(prefs.pace) ? null : "Daily pace",
    str(prefs.groupType) ? null : "Who's travelling",
    saved.length === 0 ? "Any saved places" : null,
  ].filter(Boolean) as string[];

  const constraints = [
    ...asList(prefs.dislikes).map((d) => `Avoid: ${d}`),
    ...asList(prefs.dietaryNeeds).map((d) => `Dietary: ${d}`),
  ];

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <PageHeader
        eyebrow="Trip knowledge"
        title="What the assistant remembers"
        description="All of it is editable. If something here is wrong, the plan built on top of it is wrong too."
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Reveal>
          <TripContextSurface
            tripId={tripId}
            trip={trip}
            initialMemory={data?.preferences}
            initialDecisions={data?.decisions}
          />
        </Reveal>

        <div className="space-y-6">
          <Reveal delay={0.04}>
            <BudgetSurface
              tripId={tripId}
              durationDays={trip?.duration_days}
              travelers={trip?.travelers}
              initialBudget={(data?.preferences as Record<string, unknown> | undefined)?.budget}
            />
          </Reveal>

          <Reveal delay={0.06}>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <h2 className="font-display text-lg">Saved places</h2>
              <p className="mt-1 text-xs text-muted-foreground">{saved.length} on the trip right now.</p>
              {saved.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {saved.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/trips/${tripId}/place/${p.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {(p.category ?? "").replaceAll("_", " ")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Nothing saved yet.</p>
              )}
            </section>
          </Reveal>

          <Reveal delay={0.1}>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <h2 className="font-display text-lg">Constraints</h2>
              <p className="mt-1 text-xs text-muted-foreground">Hard edges the plan has to respect.</p>
              {constraints.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {constraints.map((c) => (
                    <li key={c} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                      {c}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">None captured yet.</p>
              )}
            </section>
          </Reveal>

          <Reveal delay={0.14}>
            <section className="rounded-2xl border border-dashed border-border p-5">
              <h2 className="font-display text-lg">Still undecided</h2>
              <p className="mt-1 text-xs text-muted-foreground">Raised only when they start to matter.</p>
              {undecided.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {undecided.map((q) => (
                    <li key={q} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                      {q}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Nothing outstanding.</p>
              )}
            </section>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
