"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarPlus, Check, Compass, Loader2, Undo2, ChevronDown, ChevronRight } from "lucide-react";
import type { AssistantBlock, PlaceCard } from "@/packages/contracts/assistant";
import { cn } from "@/lib/utils";
import { notifyToast } from "@/lib/application/toast";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { addStopsToItinerary, dayIndexFromLabel, itineraryTitle } from "@/features/conversation/application/addPlanToItinerary";
import { Widget, WidgetAction, WidgetPill } from "./Widget";
import { PlanStops } from "./PlanStops";
import { FactStrip } from "@/components/DetailKit";
import { ContentSwap } from "@/components/motion-primitives";
import { pointsFromItinerary } from "./mapPoints";
import { controlSecondary, prettyDates, textAction, type, MapButton } from "./ui";
import { BlockHandlers, normalize } from "./blockShared";

type ItineraryBlockData = Extract<AssistantBlock, { type: "itinerary" }>;

/** Give each stop an id that survives a reorder (title + which occurrence of that title) and apply the visitor's order.
 *  A stop keeps its own time ("Evening" stays on Dinner when it is moved first): nothing the plan said is rewritten for them. */
function orderedStops(stops: ItineraryBlockData["days"][number]["stops"], order: string[] | undefined) {
  const seen = new Map<string, number>();
  const withIds = stops.map((stop) => {
    const n = seen.get(stop.title) ?? 0;
    seen.set(stop.title, n + 1);
    return { ...stop, id: `${stop.title}#${n}` };
  });
  if (!order) return withIds;
  const rank = new Map(order.map((id, i) => [id, i] as const));
  return [...withIds].sort((a, b) => (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6));
}

/** Which order belongs to which plan: the trip plus a short fingerprint of its stops, so a regenerated plan starts fresh. */
function itineraryOrderKey(tripId: string, block: ItineraryBlockData): string {
  let hash = 5381;
  for (const ch of JSON.stringify(block.days.map((d) => [d.label, d.stops.map((s) => s.title)]))) hash = ((hash << 5) + hash + ch.charCodeAt(0)) | 0;
  return `roam-itinerary-order:${tripId}:${(hash >>> 0).toString(36)}`;
}

/** "Day 4", "Day 4 and Day 5", "Day 4, Day 5 and Day 6". */
const joinDays = (labels: string[]) => (labels.length < 2 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`);

/** Said once on the plan, in plain words: these days were asked for, and there is nothing more to put in them yet. Not an error. */
function OpenDaysNotice({ labels, onFollowup }: { labels: string[]; onFollowup?: (prompt: string) => void }) {
  const names = joinDays(labels);
  return (
    <div className="flex items-start gap-3 border-b border-border bg-muted/50 px-4 py-3" role="note">
      <Compass className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 space-y-1.5">
        <p className={cn(type.body, "font-medium")}>{labels.length === 1 ? `${names} is open` : `${names} are open`}</p>
        <p className={cn(type.meta)}>That is everything I could find that fits this trip so far, so I have left {labels.length === 1 ? "it" : "them"} free rather than pad {labels.length === 1 ? "it" : "them"} out.</p>
        {onFollowup && (
          <button type="button" onClick={() => onFollowup(`Find more things to do for ${names}`)} className={cn(textAction, "pt-0.5")}>
            Find more for {names} <ArrowRight className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

export function ItineraryBlockView({ block: sourceBlock, tripId, onOpenPlace, onOpenPanel, onFollowup, replyText }: { block: ItineraryBlockData; tripId: string; replyText?: string } & Pick<BlockHandlers, "onOpenPlace" | "onOpenPanel" | "onFollowup">) {
  const orderKey = itineraryOrderKey(tripId, sourceBlock);
  // The visitor's own order, kept on this device like the checklist's ticks; a failing store only means it resets.
  const [orders, setOrders] = useState<Record<number, string[]>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(orderKey);
      setOrders(raw ? (JSON.parse(raw) as Record<number, string[]>) : {});
    } catch {
      setOrders({});
    }
  }, [orderKey]);
  const reorderDay = (dayIndex: number, ids: string[]) =>
    setOrders((current) => {
      const next = { ...current, [dayIndex]: ids };
      try {
        localStorage.setItem(orderKey, JSON.stringify(next));
      } catch {
        /* unavailable */
      }
      return next;
    });
  // Everything below (the map, "Open day", "Add whole plan") reads the plan in the order it is now in.
  const block = useMemo(() => ({ ...sourceBlock, days: sourceBlock.days.map((d, di) => ({ ...d, stops: orderedStops(d.stops, orders[di]) })) }), [sourceBlock, orders]);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<"idle" | "adding" | "added">("idle");
  const { guest, openGate } = useGuest();
  const multi = block.days.length > 1;
  const day = block.days[Math.min(active, block.days.length - 1)];
  const totalStops = block.days.reduce((n, d) => n + d.stops.length, 0);
  const openLabels = block.days.filter((d) => d.open).map((d) => d.label);
  // The reply above already says this sentence; repeating it inside the card is noise.
  const introIsRepeat = Boolean(block.intro && replyText && normalize(replyText).includes(normalize(block.intro).slice(0, 60)));
  const title = itineraryTitle(block.title, block.days.length) ?? (multi ? undefined : day.label);

  async function addAll() {
    if (guest) return openGate("add a plan to your itinerary");
    if (status !== "idle") return;
    setStatus("adding");
    // Days go in together (a day's own stops stay in order), so a long plan lands in seconds instead of one stop at a time.
    const results = await Promise.all(block.days.map((d, i) => addStopsToItinerary(tripId, dayIndexFromLabel(d.label, i + 1), d.stops)));
    const failures = results.reduce((total, n) => total + n, 0);
    if (failures === totalStops) {
      setStatus("idle");
      notifyToast("Couldn’t add the plan to your itinerary. Try again.", "error");
    } else {
      setStatus("added");
      notifyToast(failures ? `Added the plan — ${failures} stop${failures === 1 ? "" : "s"} didn’t save.` : "Added the whole plan to your itinerary.", failures ? "info" : "success");
    }
  }

  const dayIndex = Math.min(active, block.days.length - 1);
  const mapPoints = pointsFromItinerary(block);
  return (
    <Widget
      glyph="plan"
      tone="coral"
      eyebrow={block.intro && !introIsRepeat ? block.intro : `Plan · ${block.days.length} day${block.days.length === 1 ? "" : "s"}`}
      title={title ?? "Plan"}
      status={
        <>
          {onOpenPanel && mapPoints.length > 0 && <MapButton onClick={() => onOpenPanel({ kind: "map", title: `${title ?? "Plan"} on the map`, points: mapPoints })} />}
          <button
            type="button"
            onClick={() => void addAll()}
            disabled={status !== "idle" || totalStops === 0}
            className={cn(controlSecondary, status === "added" && "border-transparent bg-secondary text-foreground")}
          >
            {status === "adding" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : status === "added" ? <Check className="size-3.5" aria-hidden /> : <CalendarPlus className="size-3.5" aria-hidden />}
            {status === "added" ? "Added to itinerary" : "Add whole plan"}
          </button>
        </>
      }
      foot={day.open ? "This day is open: yours to wander" : undefined}
      action={onOpenPanel && !day.open ? <WidgetAction wide onClick={() => onOpenPanel({ kind: "day", block, dayIndex })}>Open {day.label}</WidgetAction> : undefined}
    >
      {openLabels.length > 0 && <div className="mt-3"><OpenDaysNotice labels={openLabels} onFollowup={onFollowup} /></div>}
      {multi && block.days.length > 12 && (
        <div className="flex items-center gap-2 px-4 pt-4 @[34rem]:px-[1.375rem]">
          <label className="relative flex-1">
            <span className="sr-only">Day</span>
            <select
              value={dayIndex}
              onChange={(event) => setActive(Number(event.target.value))}
              className="h-11 w-full appearance-none rounded-2xl border border-border bg-surface pr-9 pl-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {block.days.map((d, i) => <option key={i} value={i}>{d.label}{d.subtitle ? ` · ${d.subtitle}` : ""}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          </label>
          <button type="button" aria-label="Previous day" disabled={dayIndex === 0} onClick={() => setActive(dayIndex - 1)} className={cn(controlSecondary, "size-11 px-0 disabled:opacity-40")}><ChevronRight className="size-4 rotate-180" aria-hidden /></button>
          <button type="button" aria-label="Next day" disabled={dayIndex === block.days.length - 1} onClick={() => setActive(dayIndex + 1)} className={cn(controlSecondary, "size-11 px-0 disabled:opacity-40")}><ChevronRight className="size-4" aria-hidden /></button>
        </div>
      )}
      {multi && block.days.length <= 12 && (
        <>
        <div role="tablist" aria-label="Days" className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-4 @[34rem]:px-[1.375rem]">
          {block.days.map((d, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={cn(
                "min-w-[6.5rem] flex-1 rounded-xl border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                i === active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground hover:border-ink/25",
              )}
            >
              <span className="block font-display text-base leading-tight font-medium">{d.label}</span>
              <span className={cn("mt-0.5 block truncate text-xs", i === active ? "text-primary-foreground/70" : "text-muted-foreground")}>{d.subtitle ?? (d.open ? "Open" : `${d.stops.length} stop${d.stops.length === 1 ? "" : "s"}`)}</span>
            </button>
          ))}
        </div>
        {block.days.length > 4 && <p className="px-4 pt-2 text-xs text-muted-foreground @[34rem]:px-[1.375rem]">{day.label} of {block.days.length} · swipe for the rest</p>}
        </>
      )}
      <ContentSwap swapKey={String(active)}>
      <div role="tabpanel" className="px-4 pt-5 pb-4 @[34rem]:px-[1.375rem]">
        {day.subtitle && multi === false && <p className={cn(type.meta, "mb-4")}>{day.subtitle}</p>}
        {day.open && <p className={cn(type.body, "rounded-2xl border border-dashed border-border px-4 py-8 text-center text-ink-soft")}>Nothing lined up for {day.label} yet. It is yours to wander, or ask for more ideas above.</p>}
        {!day.open && (
          <PlanStops
            stops={day.stops}
            variant="plan"
            onReorder={day.stops.length > 1 ? (ids) => reorderDay(dayIndex, ids) : undefined}
            onOpenPlace={onOpenPlace ? (stop) => onOpenPlace({ providerId: stop.placeId!, name: stop.title } as PlaceCard) : undefined}
          />
        )}
      </div>
      </ContentSwap>
    </Widget>
  );
}

type TripSummaryBlockData = Extract<AssistantBlock, { type: "trip_summary" }>;

/** The saved trip at a glance: the figures it is judged on, then the rest as label and value. */
export function TripSummaryBlockView({ block }: { block: TripSummaryBlockData }) {
  const unset = (value: string) => (value === "Not set" ? <span className="font-normal text-muted-foreground">{value}</span> : value);
  return (
    <Widget glyph="trip" tone="coral" eyebrow="Your trip" title={block.title}>
      {block.facts.length > 0 && <FactStrip className="mt-3 rounded-none border-0 border-t border-border bg-transparent shadow-none" facts={block.facts.map((fact) => ({ ...fact, value: unset(fact.label === "Dates" ? prettyDates(fact.value) : fact.value) }))} />}
      {block.rows.length > 0 && (
        <dl className="divide-y divide-border border-t border-border px-4 @[34rem]:px-[1.125rem]">
          {block.rows.map((row) => (
            <div key={row.label} className="flex min-h-11 items-center justify-between gap-4 py-2">
              <dt className={cn(type.meta, "shrink-0")}>{row.label}</dt>
              <dd className={cn(type.body, "min-w-0 text-right font-medium", /^(not chosen yet|nothing planned yet)$/i.test(row.value) && "font-normal text-muted-foreground")}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Widget>
  );
}

type TripUpdateBlockData = Extract<AssistantBlock, { type: "trip_update" }>;

const isDateField = (field: string, value: string | null) => field === "dates" || (value ? /\d{4}-\d{2}-\d{2}/.test(value) : false);

const showChange = (field: string, value: string | null) => (value === null || /^(|null|undecided|not set)$/i.test(value.trim()) ? "Not set" : isDateField(field, value) ? prettyDates(value) : value);

/** A visible receipt for a trip fact the assistant just changed on the user's explicit say-so.
 *  Applied immediately, never gated behind a confirm dialog — but shown plainly, with a one-tap
 *  Undo that re-sends the reverse statement through the same chat pipeline. */
export function TripUpdateBlockView({ block, onFollowup }: { block: TripUpdateBlockData } & Pick<BlockHandlers, "onFollowup">) {
  const count = block.changes.length;
  return (
    <Widget
      glyph="update"
      tone="sage"
      eyebrow="Trip updated"
      title={count === 1 ? (showChange(block.changes[0].field, block.changes[0].to) === "Not set" && block.changes[0].from ? `${block.changes[0].label} cleared` : `${block.changes[0].label} updated`) : `${count} changes saved`}
    >
      <ul aria-label="Trip changes" className="mt-3 divide-y divide-border border-t border-border">
        {block.changes.map((change, i) => {
          const from = showChange(change.field, change.from);
          const to = showChange(change.field, change.to);
          return (
            <li key={i} className="flex items-center gap-3.5 px-4 py-3 @[34rem]:px-[1.125rem]">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-positive-soft text-positive" aria-hidden><Check className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="eyebrow">{change.label}</p>
                <p className="mt-0.5 text-[0.9375rem] leading-snug">
                  {from !== "Not set" && <span className="text-muted-foreground line-through decoration-muted-foreground/50">{from}</span>}
                  {from !== "Not set" && to !== "Not set" && <ArrowRight className="mx-1.5 inline size-3.5 align-[-2px] text-muted-foreground" aria-label="to" />}
                  {from !== "Not set" && to === "Not set" ? <WidgetPill className="ml-2 h-5">Cleared</WidgetPill> : <span className="font-medium text-foreground">{to}</span>}
                </p>
              </div>
              {change.undoPrompt && (
                <button type="button" onClick={() => onFollowup(change.undoPrompt!)} className={cn(controlSecondary, "h-9 shrink-0 px-3.5")}>
                  <Undo2 className="size-3.5" aria-hidden /> Undo
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Widget>
  );
}
