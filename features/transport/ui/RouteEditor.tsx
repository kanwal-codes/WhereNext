"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDownUp, Loader2 } from "lucide-react";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { MicButton } from "@/components/ComposerButtons";
import { SuggestionRow } from "@/components/SuggestionRow";
import { notifyToast } from "@/lib/application/toast";
import { useSpeechInput } from "@/lib/use-speech-input";
import { readRouteAsk, routeAskIsEmpty } from "@/lib/application/route-ask";
import { todayLocal } from "@/lib/application/travel-time";
import { shortPlace, type useRouteAsk } from "../application/useRouteAsk";
import type { useTransportSearch } from "../application/useTransportSearch";

const field = "h-12 w-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70";

/** True when what was typed in To says more than a place: another end, a way of travelling, a day, a time or a party. */
const isSentence = (text: string) => {
  const said = readRouteAsk(text, todayLocal());
  return !routeAskIsEmpty(said) && Boolean(said.from || said.modes || said.date || said.time || said.travellers || said.more);
};

/**
 * The inside of the pill once it opens: one field that asks "Where to?" and takes a place or a whole sentence ("flights Toronto to Montreal Dec 1-14"),
 * then "Where from?" once there is a destination. With both there it is the two rows with the swap, to change either end. When something is still
 * missing it asks, with one-tap answers (your home city, your hotel, the cities of a country). When both ends are set the search starts and the
 * editor closes by itself; the settled search is what the sheet below shows.
 */
export function RouteEditor({ tripId, near, t, ask, chips, onClose, toRef, fromRef }: {
  tripId: string;
  near?: [number, number];
  t: ReturnType<typeof useTransportSearch>;
  ask: ReturnType<typeof useRouteAsk>;
  /** Where the trip usually leaves from or stays, as the first answers to "where from?". */
  chips: { home: string; stay: string; destination: string };
  onClose: () => void;
  toRef: React.RefObject<HTMLInputElement | null>;
  fromRef: React.RefObject<HTMLInputElement | null>;
}) {
  const reduce = useReducedMotion();
  const { from, to, setFrom, setTo } = t;
  const { waiting, reading, note } = ask;
  const showFrom = Boolean(from.trim() || to.trim() || waiting);
  // A place picked from the suggestions needs no reading; a sentence does.
  const decide = (text: string, row: "from" | "to") => {
    if (row === "to" && !isSentence(text) && !waiting) {
      setTo(text);
      return ask.pick(text, "to");
    }
    if (row === "from" && waiting?.need !== "city") {
      setFrom(text);
      return ask.pick(text, "from");
    }
    ask.submit(text, row);
  };

  // Say it instead of typing it: what is heard goes into the To field as it comes, and is read as soon as dictation stops.
  const latestTo = useRef(to);
  latestTo.current = to;
  const speech = useSpeechInput({ onStart: () => setTo(""), onResult: (text) => setTo(text), onError: (message) => notifyToast(message, "error") });
  const toggleMic = () => {
    if (!speech.listening) return speech.toggle();
    speech.stop();
    window.setTimeout(() => { if (latestTo.current.trim()) decide(latestTo.current, "to"); }, 300);
  };
  const showMic = speech.supported && !(from.trim() && to.trim());

  // The cursor follows the question: To until there is one, then whichever end is missing.
  const need = waiting ? (waiting.need === "city" ? waiting.side : waiting.need) : null;
  const lastNeed = useRef<string | null>(null);
  useEffect(() => {
    const key = need ?? "";
    if (lastNeed.current === key) return;
    lastNeed.current = key;
    if (need) window.setTimeout(() => (need === "from" ? fromRef.current : toRef.current)?.focus(), 60);
  }, [need, fromRef, toRef]);

  const rowFor = (row: "from" | "to") => (
    <DestinationCombobox
      tripId={tripId}
      scope="places"
      near={near}
      inputRef={row === "from" ? fromRef : toRef}
      ariaLabel={row === "from" ? "From" : "To"}
      value={row === "from" ? from : to}
      onChange={(v) => { (row === "from" ? setFrom : setTo)(v); ask.setNote(""); }}
      onSelect={(text) => decide(text, row)}
      enter="free"
      quietFocus
      selectOnFocus
      onEnter={() => decide(row === "from" ? from : to, row)}
      placeholder={row === "to" && speech.listening ? "Listening…" : waiting?.need === "city" && waiting.side === row ? `A city in ${waiting.place}` : row === "from" ? "Where from?" : "Where to?"}
      inputClassName={`${field} pr-11`}
    />
  );

  const prompt = waiting
    ? waiting.need === "city" ? { title: `Which city in ${waiting.place}?`, answers: waiting.options.map((o) => ({ label: o, place: o })) }
      : waiting.need === "from" ? { title: "Where are you leaving from?", answers: [chips.stay && { label: "My hotel", place: chips.stay }, chips.home && { label: shortPlace(chips.home), place: chips.home }, chips.destination && { label: shortPlace(chips.destination), place: chips.destination }].filter(Boolean) as Array<{ label: string; place: string }> }
      : { title: "Where do you want to go?", answers: [chips.stay && { label: "My hotel", place: chips.stay }, chips.destination && { label: shortPlace(chips.destination), place: chips.destination }].filter(Boolean) as Array<{ label: string; place: string }> }
    : null;
  const answers = (prompt?.answers ?? []).filter((a, i, all) => a.place.toLowerCase() !== (waiting?.side === "from" ? to : from).trim().toLowerCase() && all.findIndex((b) => b.place === a.place) === i);

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      // Escape closes the editor everywhere but inside an open list of suggestions, which takes it first.
      onKeyDown={(e) => { if (e.key === "Escape" && !e.defaultPrevented) onClose(); }}
    >
      <div className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-3 rounded-2xl bg-surface px-4 py-1 ring-1 ring-border transition-shadow focus-within:bg-card focus-within:ring-2 focus-within:ring-ink/80">
        <AnimatePresence initial={false}>
          {showFrom && (
            <motion.div key="from" className="col-span-2 grid grid-cols-subgrid items-center overflow-visible" initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={reduce ? undefined : { opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
              <span className="grid place-items-center" aria-hidden="true"><span className={`size-3 rounded-full bg-coral-fill ring-4 ring-coral-soft ${need === "from" ? "motion-safe:animate-pulse" : ""}`} /></span>
              <div className="min-w-0">{rowFor("from")}</div>
              <span aria-hidden="true" className="col-span-2 ml-[0.7rem] h-px bg-border" style={{ marginRight: "3rem" }} />
            </motion.div>
          )}
        </AnimatePresence>
        <span className="grid place-items-center" aria-hidden="true"><span className={`size-3 rounded-[3px] bg-primary ${need === "to" ? "motion-safe:animate-pulse ring-4 ring-ink/10" : ""}`} /></span>
        <div className="relative min-w-0">
          {rowFor("to")}
          {showMic && <div className="absolute right-[-0.75rem] top-1/2 -translate-y-1/2"><MicButton listening={speech.listening} onToggle={toggleMic} /></div>}
        </div>
        {showFrom && from.trim() && to.trim() && (
          <button
            type="button"
            aria-label="Swap start and end"
            onClick={() => { const a = to; const b = from; setFrom(a); setTo(b); ask.reset(); void t.search({ from: a, to: b, force: true }); onClose(); }}
            className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-ink-soft shadow-soft transition-[transform,color] duration-150 hover:text-foreground active:scale-[0.97]"
          >
            <ArrowDownUp className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="min-h-6" role="status" aria-live="polite">
        {reading && <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Reading that…</p>}
        {!reading && note && <p className="mt-3 text-sm text-ink-soft">{note}</p>}
        {!reading && !note && !waiting && !showFrom && <p className="mt-3 text-sm leading-snug text-muted-foreground">Or say it all, like “Toronto to Montreal by train, Dec 1”.</p>}
      </div>

      <AnimatePresence initial={false}>
        {prompt && (
          <motion.div key={prompt.title} initial={reduce ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <p className="mt-3 text-sm font-medium">{prompt.title}</p>
            {answers.length > 0 && (
              <SuggestionRow bleed className="mt-2">
                {answers.map((a) => (
                  <button key={a.label} type="button" className="btn-chip whitespace-nowrap max-lg:h-10" onClick={() => ask.pick(a.place, waiting!.side)}>{a.label}</button>
                ))}
              </SuggestionRow>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
