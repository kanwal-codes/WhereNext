"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Mic, Plus, Trash2 } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { HeroCarousel } from "@/components/HeroCarousel";
import { Reveal, Sheet, Stagger, StaggerItem, WordReveal } from "@/components/motion-primitives";
import { FeaturedTrip } from "@/components/trips/FeaturedTrip";
import { TripCard } from "@/components/trips/TripCard";
import type { TripSummary } from "@/components/trips/types";
import { RoamMark } from "@/features/roam/ui/RoamMark";
import { notifyToast } from "@/lib/application/toast";
import { matchesFilter, pickFeatured, sortForHome, tripCounts, tripStatus, type TripFilter } from "@/lib/trip-status";
import { useMediaQuery } from "@/lib/use-media-query";
import { useSpeechInput } from "@/lib/use-speech-input";
import { memberInitials } from "@/lib/member-initials";
import { cn } from "@/lib/utils";

const PROMPT_CHIPS = ["A relaxing weekend", "Somewhere new", "Reunite with friends"];

export type { TripSummary };

const EMPTY_PHOTOS = [
  { src: "/design/land-city.jpg", tilt: "-rotate-2" },
  { src: "/design/land-coast.jpg", tilt: "rotate-[7deg]" },
  { src: "/design/land-mountains.jpg", tilt: "-rotate-[12deg]" },
];

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
  // The hero is always a photograph (the shared carousel), so its words are always the on-photo set.
  const onPhoto = true;
  const wide = useMediaQuery("(min-width: 640px)");
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
  const canSend = !starting && prompt.trim().length > 0;
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
      <HeroCarousel className="h-[440px] rounded-b-3xl sm:h-[420px]">
        <div className="absolute inset-x-0 top-0">
          <Reveal>
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 pt-6 sm:px-8">
              <Link href="/" className="inline-flex items-center gap-2 transition-[opacity,transform] duration-200 hover:opacity-85 active:scale-[0.97]">
                <BrandMark variant="compact" className={cn("transition-shadow duration-700", onPhoto && "ring-1 ring-white/60")} />
                <BrandMark variant="text" className={cn("hidden transition-colors duration-700 sm:inline", onPhoto && "text-white")} />
              </Link>
              <Link
                href="/account"
                title={displayName}
                aria-label="Account"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border/60 bg-background/92 text-xs font-semibold text-foreground transition-opacity hover:opacity-70"
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
                className={cn("mx-auto max-w-2xl text-center font-display text-4xl leading-[1.15] transition-colors duration-700 sm:text-5xl", onPhoto && "text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.45)]")}
              />
              <p className={cn("mx-auto mt-3 max-w-xl text-center text-body leading-relaxed transition-colors duration-700 sm:text-base", onPhoto ? "font-medium text-white [text-shadow:0_1px_14px_rgba(0,0,0,0.65)]" : "text-ink-soft")}>
                Talk it through, and the plan builds itself alongside the conversation.
              </p>
            </Reveal>
            <Reveal delay={0.5}>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void startTrip();
                }}
                className="mx-auto mt-5 max-w-xl"
              >
                {/* One daisyUI input wraps the field and its buttons, so the whole pill takes the focus ring. */}
                <label className={cn("daisy-input daisy-input-lg h-14 w-full rounded-full border-border/60 pr-2 pl-5 shadow-lift transition-[background-color,border-color,box-shadow] focus-within:border-foreground/30 focus-within:shadow-[0_10px_34px_-10px_rgba(0,0,0,0.4)] focus-within:outline-transparent", onPhoto ? "bg-background" : "bg-background/90")}>
                  <input
                    ref={promptInputRef}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder={speech.listening ? "Listening…" : wide ? "A long weekend in Lisbon, or just a feeling you’re chasing…" : "Where to next?"}
                    aria-label="Tell Roam about your next trip"
                    disabled={starting}
                    className="grow text-base text-ellipsis text-foreground placeholder:text-muted-foreground disabled:opacity-60"
                  />
                  {speech.supported && (
                    <button
                      type="button"
                      onClick={speech.toggle}
                      aria-label={speech.listening ? "Stop dictation" : "Dictate"}
                      aria-pressed={speech.listening}
                      disabled={starting}
                      className={cn(
                        "daisy-btn daisy-btn-circle daisy-btn-ghost h-10 w-10 shrink-0 border-0 transition-colors disabled:opacity-40",
                        speech.listening ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Mic className={cn("h-4 w-4", speech.listening && "animate-pulse")} />
                    </button>
                  )}
                  <button
                    type="submit"
                    aria-label="Start planning"
                    title="Start planning"
                    disabled={!canSend}
                    className={cn(
                      "daisy-btn daisy-btn-circle h-10 w-10 shrink-0 border-0 shadow-none transition-[background-color,color,transform] active:scale-[0.94]",
                      canSend ? "bg-coral text-background" : "bg-foreground/8 text-muted-foreground",
                    )}
                  >
                    {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  </button>
                </label>
              </form>
              {promptError ? (
                <p role="alert" className="mx-auto mt-2 max-w-xl rounded-lg border border-destructive/30 bg-background/90 px-3 py-1.5 text-xs text-destructive backdrop-blur">
                  {promptError}
                </p>
              ) : (
                // One scrolling row on a phone (no ragged wrap), centred when it all fits.
                <div className="mx-auto mt-3 flex w-fit max-w-full snap-x gap-2 overflow-x-auto px-0.5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {PROMPT_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setPrompt(chip);
                        promptInputRef.current?.focus();
                      }}
                      className={cn(
                        "daisy-btn daisy-btn-sm h-9 shrink-0 snap-start rounded-full px-4 text-sm font-normal shadow-none transition-colors",
                        onPhoto
                          ? "border-white/30 bg-black/35 text-white hover:bg-black/50"
                          : "border-border/60 bg-background/75 text-ink-soft hover:bg-background/95 hover:text-foreground",
                      )}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </Reveal>
          </div>
        </div>
      </HeroCarousel>

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
            <div className="mt-8 grid items-center gap-10 overflow-hidden rounded-3xl border border-border/70 bg-card p-6 shadow-soft sm:p-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
              {/* A daisyUI stack: three inspiration photos fanned like postcards on a table. */}
              <div className="daisy-stack mx-auto h-64 w-full max-w-sm sm:h-72" aria-hidden>
                {EMPTY_PHOTOS.map((photo) => (
                  <div key={photo.src} className={cn("overflow-hidden rounded-2xl border border-border/60 shadow-lift", photo.tilt)}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- static brand photo */}
                    <img src={photo.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
              <div className="text-center lg:text-left">
                <RoamMark state="idle" size={72} label="Roam" className="mx-auto text-foreground lg:mx-0" />
                <h3 className="mt-5 font-display text-3xl leading-[1.1] tracking-tight text-balance sm:text-4xl">
                  Start with a place, or just a feeling about one.
                </h3>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground max-lg:mx-auto">
                  You only need a name and a destination. Dates, budget and who&rsquo;s coming can all come out of the conversation later. Or tell Roam what you&rsquo;re after in the box above.
                </p>
                <Link href="/trips/new" className="btn-primary mt-7">
                  Create your first trip <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
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
