"use client";

import type { ReactNode } from "react";
import { AlertCircle, BedDouble, Loader2, SearchX, SlidersHorizontal, WifiOff, X } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { StateMessage, stateButton } from "@/components/StateMessage";
import { fmtDay } from "@/lib/trip-dates";
import { cn } from "@/lib/utils";
import type { StaySearchError, StaySort } from "@/features/stays/domain/stay-search";

const pulse = "skeleton";

/** The stay list while it loads, in the shape of what replaces it (a wide photo, a name and a price, a line of facts), so nothing jumps when it arrives. */
export function StayResultSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 max-lg:gap-x-5 max-lg:gap-y-7">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="min-w-0">
          <Skeleton className="aspect-[16/10] rounded-3xl" />
          <div className="mt-3 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className={cn(pulse, "h-5 w-4/5 rounded-md")} />
              <div className={cn(pulse, "h-3.5 w-1/2 rounded-md")} />
            </div>
            <div className="space-y-2">
              <div className={cn(pulse, "ml-auto h-5 w-16 rounded-md")} />
              <div className={cn(pulse, "ml-auto h-3 w-20 rounded-md")} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

const ORDER: Record<StaySort, string> = { price: "Lowest price", price_desc: "Highest price", rating: "Best rated", stars: "Most stars" };

/**
 * One row saying what the screen is doing or what it found, the same on a phone and a desktop: the count on the left, the order on the right
 * (a "Filter" button on a phone, where it opens the sort and filter sheet; plain text on a desktop, which has its own menu).
 */
export function StayStatusLine({ loading, slow, deepening, error, hasResult, count, total, filtered, sort, checkin, checkout, onOrder }: {
  loading: boolean; slow: boolean; deepening: boolean; error: StaySearchError | null; hasResult: boolean; count: number; total: number | undefined; filtered: boolean; sort: StaySort; checkin: string; checkout: string; onOrder?: () => void;
}) {
  // The dates are not shown elsewhere on a phone (the header pill opens them), so the line says them.
  const when = checkin && checkout ? <span className="sm:hidden"> · {fmtDay(checkin)} – {fmtDay(checkout)}</span> : null;
  let text: ReactNode = null;
  let busy = false;
  let showOrder = false;
  if (loading) {
    // The skeleton below is the message; words only when the wait gets long.
    busy = slow;
    text = slow ? "Still looking. Hotel sites are slow right now." : null;
  } else if (deepening) {
    busy = true;
    text = "Looking further for stays that match…";
  } else if (hasResult && !error && count > 0) {
    showOrder = true;
    text = filtered && total ? <><b className="font-semibold text-foreground">{count}</b> of {total} stays{when}</> : <><b className="font-semibold text-foreground">{count}</b> {count === 1 ? "stay" : "stays"}{when}</>;
  }
  const order = showOrder && (onOrder ? (
    <button type="button" onClick={onOrder} className="-my-2 -mr-2 inline-flex items-center gap-1 rounded-full px-2 py-2 text-sm font-medium text-ink-soft transition-colors active:bg-muted">
      <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
      Filter
      {filtered && <span aria-hidden className="size-1.5 rounded-full bg-coral" />}
    </button>
  ) : (
    <span className="text-sm text-muted-foreground">{ORDER[sort]}</span>
  ));
  return (
    <div className="relative flex min-h-6 items-center justify-between gap-3 pt-0.5">
      <p role="status" aria-live="polite" className="flex min-w-0 items-center gap-2 text-sm text-ink-soft">
        {busy && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
        <span className="min-w-0">{text}</span>
      </p>
      {order}
    </div>
  );
}

type Chip = { key: string; label: string; onRemove: () => void };

const starsLabel = (stars: number[]) => {
  const s = [...stars].sort((a, b) => a - b);
  const run = s.every((n, i) => i === 0 || n === s[i - 1]! + 1);
  return run && s.length > 1 ? `${s[0]}–${s[s.length - 1]} stars` : s.length === 1 ? `${s[0]} ${s[0] === 1 ? "star" : "stars"}` : `${s.slice(0, -1).join(", ")} & ${s[s.length - 1]} stars`;
};

/** "CA$150–200": the currency written once. */
const rangeLabel = (a: number, b: number, money: (n: number) => string) => {
  const from = money(a);
  const sign = from.replace(/[\d.,\s\u00a0]/g, "");
  const to = money(b);
  return sign && to.startsWith(sign) ? `${from}–${to.slice(sign.length)}` : `${from}–${to}`;
};

/** Every choice narrowing the list, as a chip you can take off: what the search bar understood, shown, and undoable. */
export function ActiveFilters({ priceMin, priceMax, stars, refundable, boards, propertyTypes, near, money, on }: {
  priceMin: number | null; priceMax: number | null; stars: number[]; refundable: boolean; boards: string[]; propertyTypes: string[]; near: string; money: (n: number) => string;
  on: { price: () => void; stars: () => void; refundable: () => void; board: (b: string) => void; type: (t: string) => void; near: () => void; all: () => void };
}) {
  const chips: Chip[] = [];
  if (near.trim()) chips.push({ key: "near", label: `Near ${near.trim()}`, onRemove: on.near });
  if (priceMin || priceMax) chips.push({ key: "price", label: priceMin && priceMax ? `${rangeLabel(priceMin, priceMax, money)} a night` : priceMax ? `Up to ${money(priceMax)} a night` : `From ${money(priceMin!)} a night`, onRemove: on.price });
  if (stars.length) chips.push({ key: "stars", label: starsLabel(stars), onRemove: on.stars });
  if (refundable) chips.push({ key: "refundable", label: "Free cancellation", onRemove: on.refundable });
  for (const b of boards) chips.push({ key: `b:${b}`, label: b, onRemove: () => on.board(b) });
  for (const t of propertyTypes) chips.push({ key: `t:${t}`, label: t, onRemove: () => on.type(t) });
  if (chips.length === 0) return null;
  // On a phone the header pill already says the place (and the cross beside it takes the search off), so the place chip is for a desktop only.
  const onlyNear = chips.length === 1 && chips[0]!.key === "near";
  return (
    <div role="group" aria-label="What is narrowing these stays" className={cn("no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0", onlyNear && "max-lg:hidden")}>
      {chips.map((c) => (
        <button key={c.key} type="button" onClick={c.onRemove} aria-label={`Remove: ${c.label}`} data-active="true" className={cn("btn-chip shrink-0 gap-1.5 pr-2.5", c.key === "near" && "max-lg:hidden")}>
          {c.label}
          <X className="size-3.5 opacity-70" aria-hidden />
        </button>
      ))}
      {chips.length > 1 && (
        <button type="button" onClick={on.all} className="shrink-0 px-2 text-sm font-medium text-ink-soft underline underline-offset-2">Clear all</button>
      )}
    </div>
  );
}

const secondary = stateButton.secondary;
const primary = stateButton.primary;

/** No stays to show, and what to do about it: which of the reader’s choices is the cause decides what is offered. */
export function StayEmpty({ filtered, priced, near, total, checkin, checkout, onClear, onClearPrice, onWiden, onDates }: {
  filtered: boolean; priced: boolean; near: string; total: number; checkin: string; checkout: string; onClear: () => void; onClearPrice: () => void; onWiden: () => void; onDates: () => void;
}) {
  const dates = checkin && checkout ? `${fmtDay(checkin)} – ${fmtDay(checkout)}` : "these dates";
  if (filtered && total > 0) {
    return (
      <StateMessage icon={SearchX} title="No stays match those filters" actions={<><button type="button" onClick={onClear} className={primary}>Clear filters</button>{priced && <button type="button" onClick={onClearPrice} className={secondary}>Remove price limit</button>}</>}>
        {total} {total === 1 ? "stay is" : "stays are"} available for {dates}. Loosen a filter to see {total === 1 ? "it" : "them"}.
      </StateMessage>
    );
  }
  if (near.trim()) {
    return (
      <StateMessage icon={SearchX} title={`Nothing near ${near.trim()}`} actions={<><button type="button" onClick={onWiden} className={primary}>Search the whole city</button><button type="button" onClick={onDates} className={secondary}>Change dates</button></>}>
        No stays came back there for {dates}.
      </StateMessage>
    );
  }
  return (
    <StateMessage icon={BedDouble} title="No stays for those dates" actions={<button type="button" onClick={onDates} className={primary}>Change dates</button>}>
      Nothing came back for {dates}. Other dates, or a wider area, often have rooms.
    </StateMessage>
  );
}

/** The search could not be answered and there is nothing earlier to show: why, and the one thing to do. */
export function StayError({ error, onRetry }: { error: StaySearchError; onRetry: () => void }) {
  const offline = error.kind === "offline";
  return (
    <StateMessage icon={offline ? WifiOff : AlertCircle} title={offline ? "You’re offline" : "We couldn’t load stays"} actions={<button type="button" onClick={onRetry} className={primary}>Try again</button>}>
      {offline ? "Reconnect and the hotels will load." : "The hotel sites aren’t answering right now. Try again in a moment."}
    </StateMessage>
  );
}

/** A refresh failed but the earlier list is still here: it stays, and says so. */
export function StayStaleBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mb-5 flex items-center gap-3 rounded-2xl bg-muted px-4 py-3 text-sm">
      <AlertCircle className="size-4 shrink-0 text-caution" aria-hidden />
      <span className="min-w-0 flex-1 text-pretty">Couldn’t refresh prices. Showing the last ones we had.</span>
      <button type="button" onClick={onRetry} className="shrink-0 rounded-full px-3 py-1.5 font-semibold underline underline-offset-2 active:bg-background">Try again</button>
    </div>
  );
}
