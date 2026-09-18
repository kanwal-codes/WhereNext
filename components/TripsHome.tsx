"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Loader2, MapPin, Mic, Plus, Trash2, Users } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Hero } from "@/components/Hero";
import { Reveal, Sheet, Stagger, StaggerItem, Tactile, WordReveal } from "@/components/motion-primitives";
import { notifyToast } from "@/lib/application/toast";
import { tripWhen } from "@/lib/trip-dates";
import { useIsDarkMode } from "@/lib/use-dark-mode";
import { useSpeechInput } from "@/lib/use-speech-input";
import { memberInitials } from "@/lib/member-initials";
import { cn } from "@/lib/utils";

const PROMPT_CHIPS = ["A relaxing weekend", "Somewhere new", "Reunite with friends"];

export type TripSummary = {
  id: string;
  name: string;
  destination: string | null;
  origin: string | null;
  duration_days: number | null;
  start_date: string | null;
  end_date: string | null;
  travelers: number | null;
};

export function TripsHome({ trips, displayName }: { trips: TripSummary[]; displayName: string }) {
  const [list, setList] = useState(trips);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TripSummary | null>(null);
  const isDark = useIsDarkMode();

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

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <Reveal delay={0.55}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <h2 className="min-w-0 font-display text-xl">
              {list.length > 0 ? `${list.length} trip${list.length === 1 ? "" : "s"}` : "No trips yet"}
            </h2>
            <Link href="/trips/new" className="btn-primary w-fit shrink-0 sm:justify-self-end">
              <Plus className="h-4 w-4" /> Create new trip
            </Link>
          </div>
        </Reveal>

        {list.length === 0 ? (
          <Reveal>
            <div className="mt-8 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <h3 className="mx-auto max-w-md font-display text-2xl leading-snug">
                Start with a place, or just a feeling about one.
              </h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                You only need a name and a destination. Dates, budget, who&rsquo;s coming — all of
                that can come out of the conversation later.
              </p>
              <Link href="/trips/new" className="btn-primary mt-6">
                Create your first trip <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        ) : (
          <Stagger className="mt-7 grid gap-5 lg:grid-cols-2 xl:grid-cols-3" delay={0.1}>
            {list.map((trip) => (
              <StaggerItem key={trip.id}>
                <Tactile lift={4} className="group relative">
                  <Link
                    href={`/trips/${trip.id}`}
                    className="block h-full rounded-2xl border border-border bg-card p-6 shadow-soft"
                  >
                    <div className="min-w-0 pr-9">
                      <h3 className="truncate font-display text-2xl">{trip.name}</h3>
                      <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        {trip.destination || "Destination not set"}
                      </p>
                    </div>

                    <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                      <div className="col-span-2 min-w-0">
                        <dt className="flex items-center gap-1.5 text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
                          <CalendarDays className="h-3 w-3" /> Dates
                        </dt>
                        <dd className="mt-1 truncate">{tripWhen(trip.start_date, trip.end_date, trip.duration_days)}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
                          <Users className="h-3 w-3" /> Travellers
                        </dt>
                        <dd className="mt-1 truncate">{trip.travelers ?? "Not set"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
                          <MapPin className="h-3 w-3" /> From
                        </dt>
                        <dd className="mt-1 truncate">{trip.origin || "Not set"}</dd>
                      </div>
                    </dl>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(trip)}
                    disabled={deleting === trip.id}
                    aria-label={`Delete ${trip.name}`}
                    className="absolute top-4 right-4 rounded-full border border-border bg-background/90 p-1.5 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100 disabled:opacity-60"
                  >
                    {deleting === trip.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </Tactile>
              </StaggerItem>
            ))}
          </Stagger>
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
