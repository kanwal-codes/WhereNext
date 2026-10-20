"use client";

import React, { useState } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { EventSeed } from "@/components/TripPanelProvider";
import { EventCard } from "@/components/EventCard";
import type { NearbyEvent } from "@/lib/application/nearby-events";
import { cn, safeHref } from "@/lib/utils";
import { eventDayParts } from "@/lib/places-ui";
import { CINE_PILL_ACTION, CineCard, CineDate, CinePill } from "./CineCard";
import { PHONE_V2 } from "@/lib/phone-v2";
import { HoldHeight, ViewControls } from "./ListControls";
import { DEFAULT_EVENT_VIEW, applyEventView, eventControls, type EventView } from "./listViews";
import { Badge, cardWidth, CardOpenOverlay, Notice, SectionHeader, grid, prettyDate, rail, surface, textAction, type } from "./ui";
import { BlockHandlers, MAX_CHAT_CARDS } from "./blockShared";

type EventItem = Extract<AssistantBlock, { type: "events" }>["items"][number];

const relToTripLabel = (e: EventItem): string | null =>
  e.relToTrip === "in"
    ? "during your trip"
    : e.relToTrip === "before"
      ? `${e.offsetDays ?? ""} day${e.offsetDays === 1 ? "" : "s"} before your trip`
      : e.relToTrip === "after"
        ? `${e.offsetDays ?? ""} day${e.offsetDays === 1 ? "" : "s"} after your trip`
        : null;

const eventSeed = (e: EventItem): EventSeed => ({ name: e.title, url: e.url, source: e.source, imageUrl: e.imageUrl, date: e.date, venue: e.venue });

/** Same act at the same venue on several nights → one card with a date selector, not N cards. */
type EventOccurrence = { date?: string; url: string };

type EventGroup = { base: EventItem; dates: EventOccurrence[] };

/** Lowercased, accent- and punctuation-stripped, single-spaced. */
const alnum = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** Venue identity — the part before the first comma, spaces removed ("L'Olympia, Montreal" → "lolympia"). */
const venueKey = (v?: string) => alnum((v ?? "").split(",")[0]).replace(/\s+/g, "");

/** Act identity — the title with the venue name and connective noise stripped ("YEBBA at L Olympia" → "yebba"). */
function actKey(title: string, venue?: string): string {
  let t = alnum(title);
  const v = alnum((venue ?? "").split(",")[0]);
  if (v) t = t.split(v).join(" ");
  t = t.replace(/\b(at|live|in concert|concert|show|tour|presents?|the|with|feat|featuring|and friends)\b/g, " ");
  return t.replace(/\s+/g, "");
}

/** The calendar day of a date/datetime string, for comparing occurrences ("2026-10-26T20:00" → "2026-10-26"). */
const dayOf = (raw?: string) => (raw ?? "").slice(0, 10);

function groupEventOccurrences(items: EventItem[]): EventGroup[] {
  const map = new Map<string, EventGroup>();
  for (const item of items) {
    // Same act at the same venue, however the provider spelled the title, is one group.
    const key = `${actKey(item.title, item.venue) || alnum(item.title)}|${venueKey(item.venue)}`;
    const group = map.get(key);
    if (!group) {
      map.set(key, { base: item, dates: [{ date: item.date, url: item.url }] });
      continue;
    }
    // One occurrence per calendar day — a second provider (or a timed vs. date-only listing)
    // for the same night is not a new date.
    if (item.date && !group.dates.some((d) => dayOf(d.date) === dayOf(item.date))) group.dates.push({ date: item.date, url: item.url });
    // Prefer the richest occurrence as the card's face (image / in-window).
    if ((!group.base.imageUrl && item.imageUrl) || (item.relToTrip === "in" && group.base.relToTrip !== "in")) group.base = { ...item };
  }
  for (const group of map.values()) group.dates.sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)));
  return [...map.values()];
}

const fmtEventDate = (raw?: string) => {
  if (!raw) return "Date TBA";
  // A bare YYYY-MM-DD parses as UTC midnight — pin it to local so it doesn't slip a day back.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
};

/** One date → that date. Several nights → a "Mon, Oct 26 – Tue, Oct 27" span (+ "· N dates" past two). */
function formatEventDates(dates: EventOccurrence[]): string {
  const days = [...new Set(dates.map((d) => dayOf(d.date)).filter(Boolean))].sort();
  if (days.length === 0) return "Date TBA";
  if (days.length === 1) return fmtEventDate(days[0]);
  const range = `${fmtEventDate(days[0])} – ${fmtEventDate(days[days.length - 1])}`;
  return days.length > 2 ? `${range} · ${days.length} dates` : range;
}

/** A popular event that also lands inside the trip earns a proper card, not a list row. */
const isFeaturedEvent = (e: EventItem): boolean =>
  e.relToTrip === "in" && ((typeof e.rank === "number" && e.rank >= 60) || Boolean(e.imageUrl));

const Ticket = ({ href, children = "Tickets", label }: { href: string; children?: React.ReactNode; label?: string }) => (
  <a href={safeHref(href)} target="_blank" rel="noreferrer noopener" aria-label={label} className={cn(textAction, "whitespace-nowrap")}>
    {children} <ArrowUpRight className="size-3.5" aria-hidden />
  </a>
);

function FeaturedEventCard({ group, onOpen }: { group: EventGroup; onOpen?: (seed: EventSeed) => void }) {
  const event = group.base;
  const rel = relToTripLabel(event);
  const active = group.dates[0] ?? { date: event.date, url: event.url };
  const open = () => onOpen?.({ ...eventSeed(event), url: active.url, date: active.date });
  const major = typeof event.rank === "number" && event.rank >= 65;
  const day = eventDayParts(active.date);
  return (
    <CineCard
      label={`Open ${event.title}`}
      onOpen={onOpen ? open : undefined}
      src={event.imageUrl}
      alt={event.title}
      glyph={CalendarDays}
      topLeft={day ? <CineDate month={day.month} day={day.day} /> : undefined}
      topRight={major ? <CinePill>Major event</CinePill> : undefined}
      eyebrow={event.venue}
      title={event.title}
      pills={
        <>
          <CinePill>{active.date ? formatEventDates(group.dates) : "Date to be announced"}</CinePill>
          {rel && <CinePill tone={event.relToTrip === "in" ? "positive" : "glass"}>{rel}</CinePill>}
        </>
      }
      action={
        // The details page has the tickets link; where it cannot open (no handler), the card still goes straight to tickets.
        onOpen ? (
          <button type="button" onClick={open} aria-label={`Details: ${event.title}`} className={CINE_PILL_ACTION}>
            Details <ArrowUpRight className="size-4" aria-hidden />
          </button>
        ) : (
          <a href={safeHref(active.url)} target="_blank" rel="noreferrer noopener" aria-label={`Tickets: ${event.title}`} className={CINE_PILL_ACTION}>
            Tickets <ArrowUpRight className="size-4" aria-hidden />
          </a>
        )
      }
    />
  );
}

function EventRow({ group, onOpen }: { group: EventGroup; onOpen?: (seed: EventSeed) => void }) {
  const event = group.base;
  const rel = relToTripLabel(event);
  const active = group.dates[0] ?? { date: event.date, url: event.url };
  const open = () => onOpen?.({ ...eventSeed(event), url: active.url, date: active.date });
  return (
    <div className="relative flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/40">
      {onOpen && <CardOpenOverlay label={`Open ${event.title}`} onOpen={open} />}
      <div className="min-w-0 space-y-1">
        <p className={cn(type.body, "flex flex-wrap items-center gap-x-2 gap-y-1 font-medium")}>
          <span className="min-w-0 break-words">{event.title}</span>
          {typeof event.rank === "number" && event.rank >= 65 && <Badge tone="brand">Major event</Badge>}
        </p>
        <p className={cn(type.meta, "flex min-w-0 items-center gap-1.5")}>
          <span className="shrink-0">{formatEventDates(group.dates)}</span>
          {event.venue && <><span aria-hidden className="opacity-50">·</span><span className="truncate">{event.venue}</span></>}
        </p>
        {rel && <Badge tone={event.relToTrip === "in" ? "positive" : "neutral"} className={cn(PHONE_V2 && event.relToTrip === "in" && "max-lg:hidden")}>{rel}</Badge>}
      </div>
      <div className="relative z-10 flex shrink-0 flex-col items-end gap-3">
        <Ticket href={active.url} label={`Tickets: ${event.title}`} />
        {onOpen && (
          <button type="button" onClick={open} className={cn(textAction, "text-muted-foreground", PHONE_V2 && "max-lg:hidden")}>
            Details
          </button>
        )}
      </div>
    </div>
  );
}

type EventsBlockData = Extract<AssistantBlock, { type: "events" }>;

export function EventsBlockView({ block, tripId, preview, onOpenEvent, onOpenCollection }: { block: EventsBlockData; tripId: string; preview: boolean } & Pick<BlockHandlers, "onOpenEvent" | "onOpenCollection">) {
  const [view, setView] = useState<EventView>(DEFAULT_EVENT_VIEW);
  const items = applyEventView(block.items, view);
  const filtersOn = view.duringTrip || view.venue !== null;
  const { sorts, filters } = eventControls(block.items, view, setView);
  const controls = (
    <ViewControls
      bordered={false}
      label="events"
      noun="events"
      sorts={sorts}
      sort={view.sort}
      onSort={(id) => setView({ ...view, sort: id as EventView["sort"] })}
      filters={filters}
      shown={items.length}
      total={block.items.length}
      onClear={() => setView({ ...DEFAULT_EVENT_VIEW, sort: view.sort })}
    />
  );
  const none = items.length === 0 && <p className={cn(type.body, "py-6 text-center text-muted-foreground")}>No events match those filters.</p>;

  if (!preview) {
    return (
      <div className="flex flex-col gap-3">
        {controls}
        <HoldHeight frozen={filtersOn}>
          {none}
          <div className={grid}>
            {items.map((event) => (
              <EventCard key={`${event.url}|${event.date ?? ""}`} tripId={tripId} event={event as NearbyEvent} />
            ))}
          </div>
        </HoldHeight>
      </div>
    );
  }
  const groups = groupEventOccurrences(items);
  const visibleGroups = groups.slice(0, MAX_CHAT_CARDS);
  const featured = visibleGroups.filter((g) => isFeaturedEvent(g.base)).slice(0, 3);
  const featuredSet = new Set(featured);
  const rest = visibleGroups.filter((g) => !featuredSet.has(g));
  const freshnessNote = <Notice>Dates and availability can change — check the ticket page before you buy.</Notice>;
  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title="Events"
        onSeeAll={groups.length > MAX_CHAT_CARDS && onOpenCollection ? () => onOpenCollection("All events", { ...block, items }) : undefined}
      />
      {block.window && (
        <p className={type.meta}>Checked against your trip · {prettyDate(block.window.start)} – {prettyDate(block.window.end)}</p>
      )}
      {controls}
      <HoldHeight frozen={filtersOn} className="flex flex-col gap-3">
        {none}
        {featured.length > 0 && (
          <div className={rail}>
            {featured.map((group, groupIndex) => (
              <div key={`${group.base.title}-${groupIndex}`} className={cn(cardWidth(featured.length), "shrink-0 snap-start")}>
                <FeaturedEventCard group={group} onOpen={onOpenEvent} />
              </div>
            ))}
          </div>
        )}
        {rest.length > 0 ? (
          <div className={cn(surface, "overflow-hidden")}>
            {featured.length > 0 && <h4 className={cn(type.body, "border-b border-border bg-muted/40 px-4 py-2.5 font-medium")}>More on while you&rsquo;re there</h4>}
            <div className="divide-y divide-border">
              {rest.map((group, groupIndex) => (
                <EventRow key={`${group.base.title}-${groupIndex}`} group={group} onOpen={onOpenEvent} />
              ))}
            </div>
            <div className="border-t border-border px-4 py-3">{freshnessNote}</div>
          </div>
        ) : (
          items.length > 0 && freshnessNote
        )}
      </HoldHeight>
    </div>
  );
}
