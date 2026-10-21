"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Mic } from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { BrandMark } from "@/components/BrandMark";
import { HeroCarousel } from "@/components/HeroCarousel";
import { Reveal, WordReveal } from "@/components/motion-primitives";
import { useStartTrip } from "@/components/trips/useStartTrip";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const PROMPT_CHIPS = ["A relaxing weekend", "Somewhere new", "Reunite with friends"];

/** The photograph across the top: the brand and account, the headline, and the box where a trip starts (typed, picked from a suggestion, or dictated). */
export function TripsHero({ displayName, start }: { displayName: string; start: ReturnType<typeof useStartTrip> }) {
  const { prompt, setPrompt, starting, promptError, promptInputRef, canSend, speech, startTrip } = start;
  const wide = useMediaQuery("(min-width: 640px)");
  return (
    <HeroCarousel className={cn("h-[480px] rounded-b-3xl sm:h-[420px]", "max-lg:h-[26rem]")}>
      <div className="absolute inset-x-0 top-0">
        <Reveal>
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 pt-6 sm:px-8">
            <Link href="/" prefetch={false} className="inline-flex items-center gap-2 max-lg:min-h-11 transition-[opacity,transform] duration-200 hover:opacity-85 active:scale-[0.97]">
              <BrandMark variant="compact" className="ring-1 ring-white/60 transition-shadow duration-700" />
              <BrandMark variant="text" className="hidden text-white transition-colors duration-700 sm:inline" />
            </Link>
            <AccountMenu displayName={displayName} />
          </div>
        </Reveal>
      </div>

      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto max-w-6xl px-5 pb-14 sm:px-8 sm:pb-8">
          <Reveal delay={0.2}>
            <WordReveal
              text="Trips you’re thinking about."
              delay={0.3}
              className="mx-auto max-w-2xl text-center font-display text-4xl leading-[1.15] text-white transition-colors duration-700 [text-shadow:0_2px_24px_rgba(0,0,0,0.45)] sm:text-5xl"
            />
            <p className="mx-auto mt-3 max-w-xl text-center text-body leading-relaxed font-medium text-white transition-colors duration-700 [text-shadow:0_1px_14px_rgba(0,0,0,0.65)] sm:text-base">
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
              <label className="daisy-input daisy-input-lg h-14 w-full rounded-full border-border/60 bg-background pr-2 pl-5 shadow-lift transition-[background-color,border-color,box-shadow] focus-within:border-foreground/30 focus-within:shadow-[0_10px_34px_-10px_rgba(0,0,0,0.4)] focus-within:outline-transparent">
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
                      "daisy-btn daisy-btn-circle daisy-btn-ghost h-10 w-10 max-lg:h-11 max-lg:w-11 shrink-0 border-0 transition-colors disabled:opacity-40",
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
                    "daisy-btn daisy-btn-circle h-10 w-10 max-lg:h-11 max-lg:w-11 shrink-0 border-0 shadow-none transition-[background-color,color,transform] active:scale-95",
                    canSend ? "bg-coral text-background" : "bg-foreground/8 text-muted-foreground",
                  )}
                >
                  {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                </button>
              </label>
            </form>
            {promptError ? (
              <p role="alert" className="mx-auto mt-2 max-w-xl rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-destructive">
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
                    className="daisy-btn daisy-btn-sm h-9 shrink-0 snap-start rounded-full border-white/30 bg-black/35 px-4 text-sm font-normal text-white shadow-none transition-colors hover:bg-black/50"
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
  );
}
