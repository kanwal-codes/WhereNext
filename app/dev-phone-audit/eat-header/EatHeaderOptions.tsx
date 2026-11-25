"use client";

import type { ReactNode } from "react";
import { Pencil, SlidersHorizontal, Users } from "lucide-react";
import { AnswerText } from "@/components/AnswerText";
import { FilterPills, type FilterPill } from "@/components/FilterPills";
import { StandaloneHeader } from "@/components/StandaloneHeader";
import { RoutePill } from "@/features/transport/ui/RoutePill";
import { cn } from "@/lib/utils";

const ANSWER = "I searched for Indian restaurants in Portugal. Lisbon has the largest Indian food scene there, especially around Martim Moniz, so naming a city or area would narrow the results.";
const PILLS: FilterPill[] = [
  { key: "open", label: "Open at 8:00 PM", on: true, onPress: () => undefined },
  { key: "sort", label: "Sort: Roam’s pick", on: false, title: "Sort by", body: () => null },
  { key: "type", label: "Type", on: false, title: "Type", body: () => null },
  { key: "price", label: "Price", on: false, title: "Price", body: () => null },
];

/** What the pill says when the ask set a party, a day and a time, and a place. */
const DETAILS = "Table for 4 · Sat 8 PM";

const pillBase = "relative flex h-11 w-fit max-w-full items-center overflow-hidden rounded-full bg-muted px-5 text-center font-display text-body font-semibold tracking-[-0.01em] transition-transform active:scale-[0.985]";
const circle = "grid size-11 place-items-center rounded-full bg-muted text-foreground transition-transform active:scale-[0.94]";

function Frame({ letter, title, note, children }: { letter: string; title: string; note: string; children: ReactNode }) {
  return (
    <figure className="w-[393px] shrink-0">
      <div className="overflow-hidden rounded-[2rem] bg-background px-4 pt-5 pb-6 shadow-lift ring-1 ring-border">
        {children}
        <AnswerText body={ANSWER} />
        <div className="mt-6"><FilterPills pills={PILLS} filterCount={0} onFilters={() => undefined} /></div>
      </div>
      <figcaption className="mt-4 px-1">
        <p className="font-display text-lg font-semibold tracking-[-0.01em]">{letter} · {title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{note}</p>
      </figcaption>
    </figure>
  );
}

/** Five ways to head the Eat results once an ask has set a place, a party, a day and a time. For design review: nothing here does anything. */
export function EatHeaderOptions() {
  return (
    <main className="min-h-dvh bg-[#ece8e1] px-6 py-10">
      <h1 className="font-display text-3xl font-medium tracking-[-0.02em]">Eat results: the header after an ask</h1>
      <p className="mt-2 max-w-[62ch] text-ink-soft">Same ask in every frame: “Indian restaurants in Portugal, table for four, Saturday at 8”. Each frame shows the header, the answer and the first row of pills.</p>
      <div className="mt-8 flex flex-wrap items-start gap-8">
        <Frame letter="A" title="Today" note="A place pill, and the party, day and time in a second pill under it. Two controls that open the same sheet.">
          <StandaloneHeader><button type="button" className={pillBase}>Portugal</button></StandaloneHeader>
          <button type="button" className="mb-3 inline-flex min-h-10 w-fit max-w-full items-center gap-2 rounded-full bg-muted px-4 text-sm font-medium"><Users className="size-4 shrink-0 text-ink-soft" aria-hidden />Table for 4 · Sat, Nov 28 · 8:00 PM</button>
        </Frame>

        <Frame letter="B" title="One pill, two lines" note="The Flights route pill: what the ask set in small type, the place in bold. One control; tapping it opens the sheet with all of it filled in.">
          <StandaloneHeader><RoutePill from={DETAILS} to="Portugal" loading={false} onOpen={() => undefined} /></StandaloneHeader>
        </Frame>

        <Frame letter="C" title="One pill, one line" note="Place and details together in a single line of the same weight. Compact; the place stops standing out.">
          <StandaloneHeader><button type="button" className={pillBase}><span className="truncate">Portugal<span className="font-normal text-ink-soft"> · 4 · Sat 8 PM</span></span></button></StandaloneHeader>
        </Frame>

        <Frame letter="D" title="Place pill, edit button" note="The pill only says where. A round button on the right (like the heart elsewhere) opens the sheet to edit the party, day and time.">
          <StandaloneHeader trailing={<button type="button" aria-label="Edit search" className={circle}><SlidersHorizontal className="size-[1.125rem]" aria-hidden /></button>}>
            <button type="button" className={pillBase}>Portugal</button>
          </StandaloneHeader>
        </Frame>

        <Frame letter="E" title="No pill, just an edit button" note="The header is the back arrow and an edit button, and nothing else. The answer text carries the place. The quietest; the place is not on the screen once the text scrolls away.">
          <StandaloneHeader trailing={<button type="button" aria-label="Edit search" className={circle}><Pencil className="size-[1.125rem]" aria-hidden /></button>}>
            <span aria-hidden />
          </StandaloneHeader>
        </Frame>
      </div>
      <p className={cn("mt-10 max-w-[62ch] text-sm text-ink-soft")}>Before any ask, the pill reads “Where to?” with a magnifier in all five, as on Flights and Stays.</p>
    </main>
  );
}
