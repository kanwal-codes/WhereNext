"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Mic, Plus, Trash2 } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Hero } from "@/components/Hero";
import { Reveal, Sheet, Stagger, StaggerItem, WordReveal } from "@/components/motion-primitives";
import { FeaturedTrip } from "@/components/trips/FeaturedTrip";
import { TripCard } from "@/components/trips/TripCard";
import type { TripSummary } from "@/components/trips/types";
import { RoamMark } from "@/features/roam/ui/RoamMark";
import { notifyToast } from "@/lib/application/toast";
import { matchesFilter, pickFeatured, sortForHome, tripCounts, tripStatus, type TripFilter } from "@/lib/trip-status";
import { useIsDarkMode } from "@/lib/use-dark-mode";
import { useSpeechInput } from "@/lib/use-speech-input";
import { memberInitials } from "@/lib/member-initials";
import { cn } from "@/lib/utils";

const PROMPT_CHIPS = ["A relaxing weekend", "Somewhere new", "Reunite with friends"];

export type { TripSummary };

const FILTER_TABS: Array<{ key: TripFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "undated", label: "Planning" },
  { key: "past", label: "Past" },
];

export function TripsHome({ trips, displayName }: { trips: TripSummary[]; displayName: string }) {
  const [list, setList] = useState(trips);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TripSummary | null>(null);
  const isDark = useIsDarkMode();
  // "Today" for the whole screen, fixed for the life of the mount so nothing shifts under the reader.
  const [now] = useState(() => Date.now());
  const [filter, setFilter] = useState<TripFilter>("all");
  const counts = useMemo(() => tripCounts(list, now), [list, now]);
  // If the last trip of a kind is deleted while its tab is open, fall back to All rather than an empty tab.
  const activeFilter: TripFilter = counts[filter] > 0 ? filter : "all";
  const visible = useMemo(
    () => sortForHome(list, now).filter((trip) => matchesFilter(tripStatus(trip, now), activeFilter)),
    [list, now, activeFilter],
  );
  const featured = useMemo(() => pickFeatured(visible, now), [visible, now]);
  const rest = useMemo(() => visible.filter((trip) => trip.id !== featured?.id), [visible, featured]);
  const tabs = FILTER_TABS.filter((tab) => tab.key === "all" || counts[tab.key] > 0);
  const showTabs = list.length > 3 && tabs.length > 2;

  const [prompt, setPrompt] = useState("");
  const [starting, setStarting] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const promptBase = useRef("");
  const promptInputRef = useRef<HTMLInputElement>(null);
  // Stable for the life of this mount, so a retry after a dropped response re-uses the same
  // attempt instead of the server creating a second blank trip.
  const startIdempotencyKey = useRef(crypto.randomUUID());
  const speech = useSpeechInput({
    onStart: () => { promptBase.current = prompt.trim() ? `${prompt.trim()} ` : ""; },
    onResult: (text) => setPrompt(promptBase.current + text),
    onError: (message) => notifyToast(message, "error"),
  });

  async function startTrip() {
    const text = prompt.trim();
    if (!text || starting) return;
    setStarting(true);
    setPromptError(null);
    try {
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ destination: null, idempotencyKey: startIdempotencyKey.current }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.trip?.id) throw new Error();
      // `?ask=` is the same param a place's "ask the assistant" link uses — ConversationSurface
      // already pre-fills and focuses the composer with it, so the chat picks up exactly where
      // this left off instead of landing empty.
      window.location.assign(`/trips/${body.trip.id}/chat?ask=${encodeURIComponent(text)}`);
    } catch {
      setPromptError("We couldn’t start that trip. Try again in a moment.");
      setStarting(false);
    }
  }

  async function removeTrip(trip: TripSummary) {
    setPendingDelete(null);
    setDeleting(trip.id);
    const response = await fetch(`/api/trips/${trip.id}`, { method: "DELETE" });
    setDeleting(null);
    if (response.ok) {
      setList((current) => current.filter((t) => t.id !== trip.id));
      notifyToast(`"${trip.name}" deleted.`, "success");
    } else {
      notifyToast("That trip couldn’t be deleted. Try again.", "error");
    }
  }

  return (
    <div className="min-h-screen">
      <Hero image={isDark ? "/design/trip-hero-night.jpg" : "/design/trip-hero.jpg"} alt="Warm rooftops at dusk" className="h-[440px] sm:h-[420px]">
        <div className="absolute inset-x-0 top-0">
          <Reveal>
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 pt-6 sm:px-8">
              <Link href="/" className="inline-flex items-center gap-2">
                <BrandMark variant="compact" />
                <BrandMark variant="text" className="hidden sm:inline" />
              </Link>
              <Link
                href="/account"
                title={displayName}
                aria-label="Account"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border/60 bg-background/85 text-xs font-semibold text-foreground backdrop-blur transition-opacity hover:opacity-70"
              >
                {memberInitials(displayName)}
              </Link>
            </div>
          </Reveal>
        </div>

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-6xl px-5 pb-8 sm:px-8">
            <Reveal delay={0.2}>
              <WordReveal
                text="Trips you're thinking about."
                delay={0.3}
                className="mx-auto max-w-2xl text-center font-display text-4xl leading-[1.15] sm:text-5xl"
              />
              <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-ink-soft">
                Talk it through, and the plan builds itself alongside the conversation.
              </p>
            </Reveal>
            <Reveal delay={0.5}>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void startTrip();
                }}
                className="mx-auto mt-4 flex max-w-xl items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-2.5 py-2 shadow-lift backdrop-blur transition-shadow focus-within:ring-2 focus-within:ring-ring/25 sm:mt-5"
              >
                <input
                  ref={promptInputRef}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={speech.listening ? "Listening…" : "A long weekend in Lisbon, or just a feeling you’re chasing…"}
                  aria-label="Tell Roam about your next trip"
                  disabled={starting}
                  className="min-w-0 flex-1 bg-transparent px-1.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
                />
                {speech.supported && (
                  <button
                    type="button"
                    onClick={speech.toggle}
                    aria-label={speech.listening ? "Stop dictation" : "Dictate"}
                    aria-pressed={speech.listening}
                    disabled={starting}
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors disabled:opacity-40",
                      speech.listening ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-border/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Mic className={cn("h-4 w-4", speech.listening && "animate-pulse")} />
                  </button>
                )}
                <button
                  type="submit"
                  aria-label="Start planning"
                  title="Start planning"
                  disabled={starting || !prompt.trim()}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-[transform,opacity] active:scale-[0.94] disabled:opacity-35"
                >
                  {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                </button>
              </form>
              {promptError ? (
                <p role="alert" className="mx-auto mt-2 max-w-xl rounded-lg border border-destructive/30 bg-background/90 px-3 py-1.5 text-xs text-destructive backdrop-blur">
                  {promptError}
                </p>
              ) : (
                <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
                  {PROMPT_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setPrompt(chip);
                        promptInputRef.current?.focus();
                      }}
                      className="rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-ink-soft backdrop-blur transition-colors hover:bg-background/90 hover:text-foreground"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </Reveal>
          </div>
        </div>
      </Hero>

      <div className="mx-auto max-w-6xl px-5 pt-12 pb-20 sm:px-8">
        <Reveal delay={0.55}>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            <div className="flex min-w-0 items-center gap-3">
              <h2 className="font-display text-3xl tracking-tight">{list.length > 0 ? "Your trips" : "No trips yet"}</h2>
              {list.length > 0 && <span className="daisy-badge daisy-badge-ghost tabular-nums">{list.length}</span>}
            </div>
            <Link href="/trips/new" className="btn-primary w-fit shrink-0">
              <Plus className="h-4 w-4" /> Create new trip
            </Link>
          </div>
          {showTabs && (
            <div role="tablist" aria-label="Filter trips" className="daisy-tabs daisy-tabs-box daisy-tabs-sm mt-5 w-fit max-w-full overflow-x-auto bg-muted">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={cn("daisy-tab gap-2 transition-[color,box-shadow]", activeFilter === tab.key ? "daisy-tab-active shadow-soft" : "text-muted-foreground hover:text-foreground")}
                >
                  {tab.label}
                  <span className="text-xs text-muted-foreground tabular-nums">{counts[tab.key]}</span>
                </button>
              ))}
            </div>
          )}
        </Reveal>

        {list.length === 0 ? (
          <Reveal>
            <div className="mt-10 flex flex-col items-center px-6 py-16 text-center">
              <RoamMark state="idle" size={120} label="Roam" className="text-foreground" />
              <h3 className="mx-auto mt-6 max-w-md font-display text-3xl leading-snug tracking-tight text-balance">
                Start with a place, or just a feeling about one.
              </h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                You only need a name and a destination. Dates, budget and who&rsquo;s coming can all come out of the conversation later.
              </p>
              <Link href="/trips/new" className="btn-primary mt-7">
                Create your first trip <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        ) : (
          <div key={activeFilter}>
            {featured && (
              <Reveal delay={0.1}>
                <div className="mt-8">
                  <FeaturedTrip
                    trip={featured}
                    status={tripStatus(featured, now)}
                    deleting={deleting === featured.id}
                    onDelete={() => setPendingDelete(featured)}
                  />
                </div>
              </Reveal>
            )}
            {rest.length > 0 && (
              <Stagger
                className={cn("mt-6 grid gap-5 sm:grid-cols-2", rest.length === 1 || rest.length === 2 || rest.length === 4 ? "lg:grid-cols-2" : "lg:grid-cols-3")}
                delay={0.2}
              >
                {rest.map((trip) => (
                  <StaggerItem key={trip.id}>
                    <TripCard trip={trip} status={tripStatus(trip, now)} deleting={deleting === trip.id} onDelete={() => setPendingDelete(trip)} />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        )}
      </div>

      <Sheet open={!!pendingDelete} onClose={() => setPendingDelete(null)} ariaLabel="Delete trip" side="center">
        <div className="space-y-4 p-6">
          <div>
            <h3 className="font-display text-xl">Delete this trip?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {pendingDelete && (
                <>
                  <span className="font-medium text-foreground">&ldquo;{pendingDelete.name}&rdquo;</span> and everything in it —
                  itinerary, saved places, decisions — will be removed. This can’t be undone.
                </>
              )}
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-accent active:scale-[0.98]"
            >
              Keep trip
            </button>
            <button
              type="button"
              onClick={() => pendingDelete && void removeTrip(pendingDelete)}
              className="btn-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete trip
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
