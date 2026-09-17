"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Check, Loader2, MapPin, Pencil, Users, Wallet } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { Hero } from "@/components/Hero";
import { Reveal, Stagger, StaggerItem, WordReveal } from "@/components/motion-primitives";
import { CertaintyBadge } from "@/components/CertaintyBadge";
import { certaintyFor, decisionSummary, isDisplayableDecision } from "@/lib/decisions-ui";
import { daysUntilTrip, fmtDay, tripDayIndex, tripWhen } from "@/lib/trip-dates";
import { readStayDecision } from "@/packages/contracts/stay";
import { useDestinationPhoto } from "@/features/places/application/useDestinationPhoto";
import { TripWeather } from "@/components/TripWeather";
import { ShareTrip } from "@/features/trip/ui/ShareTrip";
import { TripReviewPanel } from "@/features/workspace/ui/TripReviewPanel";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";

type SavedPlace = { status?: string; places?: { id: string; name: string; category?: string | null; address?: string | null } };
type ItineraryRow = { id: string; title: string; day_index: number };
type DecisionRow = { id: string; kind: string; value: Record<string, unknown>; source?: string };

export default function TripOverviewPage() {
  const { tripId, data } = useTripData();
  const router = useRouter();
  const trip = data?.trip;
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const saved = ((data?.savedPlaces ?? []) as SavedPlace[]).map((s) => s.places).filter(Boolean) as NonNullable<SavedPlace["places"]>[];
  const itinerary = (data?.itinerary ?? []) as ItineraryRow[];
  const decisions = (data?.decisions ?? []) as DecisionRow[];
  const lockedStay = readStayDecision(decisions);
  // Exclude decisions already shown elsewhere (the stay card below) or that are pure
  // internal bookkeeping (review email/dismiss tracking) — this generic list is for
  // everything else, not a second untranslated dump of every row in the table.
  const displayableDecisions = decisions.filter((d) => isDisplayableDecision(d.kind));
  const conversation = (data?.conversation ?? []) as Array<{ role: string; content: string }>;

  const destination = trip?.destination ?? "your destination";

  // A quick "where are we relative to this trip" read — future countdown, mid-trip day
  // count, or a wrapped-up note. Silent (null) whenever there isn't a start date to anchor it.
  const daysUntil = daysUntilTrip(trip?.start_date);
  const dayIndex = tripDayIndex(trip?.start_date);
  const tripStatus =
    daysUntil == null ? null
    : daysUntil > 1 ? `${daysUntil} days to go`
    : daysUntil === 1 ? "Tomorrow"
    : daysUntil === 0 ? "Starts today"
    : trip?.duration_days && dayIndex != null && dayIndex <= trip.duration_days ? `Day ${dayIndex} of ${trip.duration_days}`
    : trip?.duration_days ? "Trip complete"
    : null;

  const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const budget =
    typeof prefs.budget === "number" && prefs.budget > 0
      ? `$${prefs.budget}/day`
      : typeof prefs.budget === "string" && prefs.budget.trim()
        ? prefs.budget.trim()
        : "Not set";

  const stats = [
    { icon: CalendarDays, label: "Dates", value: tripWhen(trip?.start_date, trip?.end_date, trip?.duration_days) },
    { icon: Users, label: "Travellers", value: trip?.travelers ? String(trip.travelers) : "Not set" },
    { icon: Wallet, label: "Budget", value: budget },
    { icon: MapPin, label: "From", value: trip?.origin || "Not set" },
  ];

  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const knowsSoFar = [
    asList(prefs.likes).length > 0 ? `Likes: ${asList(prefs.likes).join(", ")}` : null,
    asList(prefs.dislikes).length > 0 ? `Avoids: ${asList(prefs.dislikes).join(", ")}` : null,
    str(prefs.pace) ? `Pace: ${str(prefs.pace)}` : null,
    str(prefs.groupType) ? `Group: ${str(prefs.groupType)}` : null,
    str(prefs.vibe) ? `Vibe: ${str(prefs.vibe)}` : null,
    asList(prefs.dietaryNeeds).length > 0 ? `Dietary: ${asList(prefs.dietaryNeeds).join(", ")}` : null,
  ].filter(Boolean) as string[];

  const openQuestions = [
    trip?.duration_days ? null : "How many days is the trip?",
    prefs.budget === undefined ? "What's a rough daily budget?" : null,
    str(prefs.pace) ? null : "How packed should the days be?",
    saved.length === 0 ? "Nothing saved yet — start with Discover or Roam." : null,
  ].filter(Boolean) as string[];

  const days = Array.from(new Set(itinerary.map((i) => i.day_index))).sort((a, b) => a - b).slice(0, 3);
  const recentAssistant = conversation.filter((m) => m.role === "assistant").slice(-3).reverse();
  // `undefined` while the Places lookup runs, `null` when there's no photo, else the URL.
  const destinationPhoto = useDestinationPhoto(tripId, trip?.destination ?? undefined, trip?.hero_photo_name);
  // Only mount the hero once we know which image it is — no stock-plate flash swapping to the real photo.
  const heroReady = Boolean(data) && destinationPhoto !== undefined;
  const heroImage = destinationPhoto || "/design/trip-hero.jpg";

  const startEditingName = () => {
    setNameDraft(trip?.name || destination);
    setEditingName(true);
  };

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name || name === trip?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to rename trip");
      announceWorkspaceChange("trip");
      router.refresh();
      setEditingName(false);
    } catch {
      notifyToast("Couldn't rename the trip. Try again.");
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="min-h-full">
      {heroReady ? (
        <Hero key={heroImage} image={heroImage} alt={`${destination}`} className="h-56 sm:h-72">
          {tripStatus && (
            <Reveal delay={0.12} className="absolute top-4 right-4 sm:top-5 sm:right-8">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 text-xs font-medium text-foreground shadow-soft backdrop-blur">
                <CalendarDays className="h-3.5 w-3.5 text-coral" /> {tripStatus}
              </span>
            </Reveal>
          )}
          <div className="absolute inset-x-0 bottom-0 px-5 pb-6 sm:px-8">
            <Reveal delay={0.12}>
              <div className="min-w-0">
                {editingName ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveName();
                    }}
                    className="flex max-w-md items-center gap-2"
                  >
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={() => void saveName()}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingName(false);
                      }}
                      disabled={savingName}
                      className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background/90 px-3 py-1.5 font-display text-3xl text-foreground shadow-soft backdrop-blur outline-none focus:border-primary"
                    />
                    <button
                      type="submit"
                      disabled={savingName}
                      aria-label="Save trip name"
                      className="shrink-0 rounded-full border border-border/60 bg-background/85 p-2 text-foreground shadow-soft backdrop-blur transition-[transform,background-color] hover:bg-background active:scale-[0.94] disabled:opacity-60"
                    >
                      {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                  </form>
                ) : (
                  <div className="group/name flex min-w-0 items-center gap-2">
                    <WordReveal text={trip?.name || destination} delay={0.24} className="truncate font-display text-4xl" />
                    <button
                      type="button"
                      onClick={startEditingName}
                      aria-label="Rename trip"
                      title="Rename trip"
                      className="shrink-0 rounded-full border border-border/60 bg-background/85 p-1.5 text-foreground opacity-0 shadow-soft backdrop-blur transition-opacity group-hover/name:opacity-100 group-focus-within/name:opacity-100 hover:bg-background"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
                  <MapPin className="h-3.5 w-3.5" /> {destination}
                </p>
              </div>
            </Reveal>
          </div>
        </Hero>
      ) : (
        <div className="relative h-56 overflow-hidden bg-muted sm:h-72">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-card" />
          <div className="absolute inset-x-0 bottom-0 px-5 pb-6 sm:px-8">
            <div className="h-9 w-2/3 max-w-sm animate-pulse rounded-lg bg-background/60" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-background/50" />
          </div>
        </div>
      )}

      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <StaggerItem key={s.label} className="h-full">
              <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card px-4 py-3 shadow-soft">
                <span className="absolute inset-y-0 left-0 w-[3px] bg-coral" />
                <p className="flex items-center gap-1.5 text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
                  <s.icon className="h-3 w-3 text-coral" /> {s.label}
                </p>
                <p className="mt-1.5 text-sm font-medium leading-snug">{s.value}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <div className="mt-9 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-8">
            <Reveal>
              <section>
                <h2 className="font-display text-xl">What we know so far</h2>
                {knowsSoFar.length > 0 ? (
                  <ul className="mt-4 space-y-3">
                    {knowsSoFar.map((k) => (
                      <li key={k} className="flex gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-relaxed text-ink-soft">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf" />
                        {k}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-4">
                    <p className="text-sm font-medium">Start shaping the trip</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Tell Roam where you&rsquo;re going, what matters to you, and how you want the days to feel.
                    </p>
                  </div>
                )}
              </section>
            </Reveal>

            {days.length > 0 && (
              <Reveal delay={0.08}>
                <section>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
                    <h2 className="font-display text-xl">Itinerary preview</h2>
                    <Link href={`/trips/${tripId}/itinerary`} className="shrink-0 text-xs font-medium text-primary">
                      Full itinerary
                    </Link>
                  </div>
                  <div className="mt-4 space-y-3">
                    {days.map((day) => (
                      <div key={day} className="rounded-2xl border border-border bg-card px-4 py-3">
                        <p className="text-sm font-medium">Day {day}</p>
                        <p className="mt-1.5 truncate text-xs text-muted-foreground">
                          {itinerary.filter((i) => i.day_index === day).map((i) => i.title).join(" · ") || "Nothing scheduled"}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </Reveal>
            )}

            <Reveal delay={0.12}>
              <section>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
                  <h2 className="font-display text-xl">Saved places</h2>
                  <Link href={`/trips/${tripId}/discover`} className="shrink-0 text-xs font-medium text-primary">
                    Discover more
                  </Link>
                </div>
                {saved.length > 0 ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {saved.slice(0, 6).map((p) => (
                      <Link
                        key={p.id}
                        href={`/trips/${tripId}/place/${p.id}`}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-accent"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[p.category?.replaceAll("_", " "), p.address].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-4">
                    <p className="text-sm font-medium">Nothing saved yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">Explore places that fit the way you want this trip to feel.</p>
                    <Link href={`/trips/${tripId}/discover`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                      Discover places <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </section>
            </Reveal>
          </div>

          <div className="min-w-0 space-y-6">
            {trip?.destination && (
              <Reveal delay={0.04}>
                {trip.destination && <TripWeather tripId={tripId} location={trip.destination} card />}
              </Reveal>
            )}

            <Reveal delay={0.05}>
              <TripReviewPanel tripId={tripId} />
            </Reveal>

            <Reveal delay={0.06}>
              <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <h2 className="font-display text-lg">Still unresolved</h2>
                {openQuestions.length > 0 ? (
                  <ul className="mt-3 space-y-2.5">
                    {openQuestions.map((q) => (
                      <li key={q} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                        {q}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Nothing pressing — keep planning.</p>
                )}
                <Link
                  href={`/trips/${tripId}/chat`}
                  className="btn-primary mt-5 w-full"
                >
                  Continue planning <ArrowRight className="h-4 w-4" />
                </Link>
              </section>
            </Reveal>

            {lockedStay && (
              <Reveal delay={0.09}>
                <Link
                  href={`/trips/${tripId}/stay/${encodeURIComponent(lockedStay.hotelId)}?checkin=${lockedStay.checkin}&checkout=${lockedStay.checkout}`}
                  className="block overflow-hidden rounded-2xl border border-leaf/30 bg-card shadow-soft transition-colors hover:bg-accent"
                >
                  {lockedStay.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI
                    <img src={lockedStay.thumbnail} alt={lockedStay.hotelName} width={480} height={160} className="h-32 w-full object-cover" />
                  )}
                  <div className="p-5">
                    <h2 className="eyebrow text-leaf">Your stay</h2>
                    <p className="mt-1 truncate font-display text-lg">{lockedStay.hotelName}</p>
                    <p className="truncate text-sm text-ink-soft">{lockedStay.roomName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fmtDay(lockedStay.checkin)} → {fmtDay(lockedStay.checkout)} · {lockedStay.nights} night{lockedStay.nights === 1 ? "" : "s"} ·{" "}
                      <span className="tabular-nums text-foreground">{lockedStay.totalAmount} {lockedStay.currency}</span>
                    </p>
                  </div>
                </Link>
              </Reveal>
            )}

            <Reveal delay={0.1}>
              <ShareTrip tripId={tripId} />
            </Reveal>

            {displayableDecisions.length > 0 && (
              <Reveal delay={0.12}>
                <section className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="font-display text-lg">Decisions</h2>
                  <ul className="mt-3 space-y-2">
                    {displayableDecisions.slice(0, 6).map((d) => (
                      <li key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border pb-2 last:border-0">
                        <div className="min-w-0">
                          <p className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase">{d.kind.replaceAll("_", " ")}</p>
                          <p className="truncate text-sm">{decisionSummary(d.kind, d.value)}</p>
                        </div>
                        <CertaintyBadge certainty={certaintyFor(d.source)} />
                      </li>
                    ))}
                  </ul>
                </section>
              </Reveal>
            )}

            {recentAssistant.length > 0 && (
              <Reveal delay={0.16}>
                <section className="rounded-2xl border border-dashed border-border p-5">
                  <h2 className="font-display text-lg">Recent assistant activity</h2>
                  <ul className="mt-3 space-y-3">
                    {recentAssistant.map((m, i) => (
                      <li key={i} className="line-clamp-2 text-sm leading-relaxed text-ink-soft">
                        {m.content.slice(0, 180)}
                      </li>
                    ))}
                  </ul>
                </section>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
