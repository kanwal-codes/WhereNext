"use client";

import React, { useState } from "react";
import {
  ArrowUpRight,
  BedDouble,
  CalendarPlus,
  Car,
  Check,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudSun,
  Coffee,
  Compass,
  Droplets,
  Footprints,
  Landmark,
  Loader2,
  MapPin,
  Martini,
  Moon,
  Plane,
  Sparkles,
  Star,
  Phone,
  Globe,
  RefreshCw,
  Sun,
  TicketCheck,
  TrainFront,
  Umbrella,
  Wallet,
} from "lucide-react";
import type { AssistantBlock, PlaceCard, StayCardItem, TrustLabel } from "@/packages/contracts/assistant";
import type { Place } from "@/packages/contracts/place";
import type { EventSeed } from "@/components/TripPanelProvider";
import { AddToTripControl } from "@/features/trip/ui/AddToTripControl";
import { ExternalLink } from "@/components/ExternalLink";
import { EventPoster } from "@/components/EventPoster";
import { EventCard, type NearbyEvent } from "@/components/EventCard";
import { CompareView } from "@/components/CompareView";
import { BlurImage } from "@/components/motion-primitives";
import { cn, safeHref } from "@/lib/utils";
import { mutate } from "@/lib/client/mutation-queue";
import { notifyToast } from "@/lib/application/toast";
import { formatClockTime, parseClockTime } from "@/lib/application/clock-time";
import { portableProxyPhotoUrl } from "../portable-photo-url";

export type BlockHandlers = {
  /** The trip these blocks belong to — card actions write against it. */
  tripId: string;
  onFollowup: (prompt: string) => void;
  /** When set, the card head opens this place in the chat side-panel. */
  onOpenPlace?: (place: PlaceCard) => void;
  /** When set, a stay card opens the hotel (rooms + details) in the chat side-panel. */
  onOpenStay?: (stay: StayCardItem, dates: { checkin: string; checkout: string }) => void;
  /** When set, an event card/row opens the full event view in the chat side-panel. */
  onOpenEvent?: (seed: EventSeed) => void;
  /** Opens the complete result set in the shared side panel. */
  onOpenCollection?: (title: string, block: AssistantBlock) => void;
};

const MAX_CHAT_CARDS = 4;
const cleanSectionTitle = (value?: string) => value
  ? value.trim().replace(/^./, (letter) => letter.toUpperCase())
  : undefined;

function ResultBand({ title, onSeeAll }: { title?: string; onSeeAll?: () => void }) {
  if (!title && !onSeeAll) return null;
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-l-2 border-coral pl-3">
      {title ? <h3 className="min-w-0 truncate font-display text-sm">{title}</h3> : <span />}
      {onSeeAll && (
        <button
          type="button"
          aria-label={`See all${title ? ` ${title}` : " results"}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSeeAll();
          }}
          className="relative z-10 shrink-0 cursor-pointer text-xs font-medium text-foreground underline-offset-4 hover:underline"
        >
          See all &rarr;
        </button>
      )}
    </div>
  );
}

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

const MajorEventPill = () => (
  <span className="w-fit shrink-0 self-start rounded-full bg-coral-soft px-1.5 py-0.5 text-[10px] font-medium text-coral">Major event</span>
);

/** Drop the card-only fields so what's left is a plain provider Place. */
const toPlace = ({ photoUrl: _photo, trust: _trust, distanceToLocked: _distance, ...place }: PlaceCard): Place => place;

const TRUST_LABEL: Record<TrustLabel, string> = {
  verified: "Verified",
  sourced: "From the web",
  estimated: "Estimated",
  assumption: "Assumption",
  unavailable: "Unavailable",
};

const card = "rounded-2xl border border-border bg-card shadow-soft";
// A full-card click target. Sits behind the card content (z-0); real actions live in a
// `relative z-10` row so they still receive their own clicks. Keeps card markup non-nested.
const CardOpenOverlay = ({ label, onOpen }: { label: string; onOpen: () => void }) => (
  <button
    type="button"
    aria-label={label}
    onClick={onOpen}
    className="absolute inset-0 z-0 rounded-2xl transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
  />
);
const rowDivider = "border-b border-border last:border-b-0";
const iconBtn = "btn-chip";
const freshness = "mt-2 text-[11px] text-muted-foreground";
// Left edge aligns with the message text; the row still scrolls sideways. No negative
// margin — the chat column has no padding to bleed into, which left the first card clipped.
const carousel = "flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain no-scrollbar pb-2.5";
// The full collection panel (preview=false) has real room to breathe — lay cards out in a
// grid that reflows to the panel's own width instead of one endless scrolling row. Sized off
// the container, not the viewport, since the panel can be a narrow drawer or full-screen.
const grid = "grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3";

function fmtTime(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function PlaceCardView({
  place,
  tripId,
  onOpenPlace,
}: { place: PlaceCard; tripId: string } & Pick<BlockHandlers, "onOpenPlace">) {
  const portablePhoto = portableProxyPhotoUrl(place.photoUrl);
  const head = (
    <>
      {portablePhoto ? (
        <BlurImage src={portablePhoto} alt={place.name} width={320} height={160} className="h-32 w-full rounded-t-2xl object-cover" />
      ) : (
        <div className="grid h-32 w-full place-items-center rounded-t-2xl bg-muted text-muted-foreground">
          <MapPin className="h-6 w-6 opacity-40" />
        </div>
      )}
      <h4 className="px-3.5 pt-3.5 font-display text-base leading-tight">{place.name}</h4>
    </>
  );

  return (
    // `overflow-hidden` is on the photo itself (`rounded-t-2xl` above), not this card — on the
    // same box as `shadow-soft`, it was clipping off the shadow's own soft, diffuse layer,
    // leaving only the tight 1px contact line and reading flat instead of gently lifted.
    <article className={cn(card, "group relative flex h-full flex-col")}>
      {onOpenPlace && <CardOpenOverlay label={`Open ${place.name}`} onOpen={() => onOpenPlace(place)} />}
      {head}
      <div className="flex flex-1 flex-col gap-2 px-3.5 pt-2 pb-3.5">
        {typeof place.rating === "number" && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3 w-3 fill-current text-coral" />
            <span className="text-foreground">{place.rating}</span>
            {place.userRatingCount ? <span>({place.userRatingCount.toLocaleString()})</span> : null}
          </p>
        )}
        {place.distanceToLocked && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0 text-coral" /> {place.distanceToLocked}
          </p>
        )}
        {(place.phone || place.websiteUri) && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {place.phone && <a href={`tel:${place.phone}`} className="inline-flex items-center gap-1 hover:text-foreground"><Phone className="h-3 w-3" />{place.phone}</a>}
            {place.websiteUri && <a href={safeHref(place.websiteUri)} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-foreground"><Globe className="h-3 w-3" />Website</a>}
          </div>
        )}
        {(place.openNow !== undefined || place.openingHours?.length || place.wheelchairAccessible !== undefined || place.reviewSummary) && (
          <div className="space-y-1 text-[11px] text-muted-foreground">
            {place.openNow !== undefined && <p>{place.openNow ? "Open now" : "Closed now"}</p>}
            {place.openingHours?.[0] && <p className="truncate">{place.openingHours[0]}</p>}
            {place.wheelchairAccessible && <p>Wheelchair-accessible entrance</p>}
            {place.reviewSummary && <p className="line-clamp-2">{place.reviewSummary}</p>}
          </div>
        )}
        {/* "From provider" is the default for every card — only a non-default trust label carries information. */}
        {place.trust !== "sourced" && <p className="eyebrow">{TRUST_LABEL[place.trust] ?? place.trust}</p>}
        <div className="relative z-10 mt-auto flex items-center gap-2 pt-1">
          {/* One control: shortlist (still deciding) → a day (going in the plan) → remove.
              `block` + `flex-1` so it shares the row with Details/Maps instead of stacking —
              its own label ("Add to trip" / "Day N") is always short enough to share space. */}
          <AddToTripControl tripId={tripId} place={toPlace(place)} size="sm" block className="min-w-0 flex-1" />
          {onOpenPlace ? (
            <button type="button" className={cn(iconBtn, "shrink-0")} onClick={() => onOpenPlace(place)}>
              Details <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            place.sourceUrl && /^https?:\/\//i.test(place.sourceUrl) && (
              <a href={place.sourceUrl} target="_blank" rel="noreferrer noopener" className={cn(iconBtn, "shrink-0")}>
                Maps <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            )
          )}
        </div>
      </div>
    </article>
  );
}

function StayCardView({ hotel, onOpen }: { hotel: StayCardItem; onOpen?: () => void }) {
  const head = (
    <>
      {hotel.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI
        <img src={hotel.thumbnailUrl} alt={hotel.name} width={320} height={160} loading="lazy" className="h-32 w-full rounded-t-2xl object-cover" />
      ) : (
        <div className="grid h-32 w-full place-items-center rounded-t-2xl bg-muted">
          <BedDouble className="h-6 w-6 text-muted-foreground/40" />
        </div>
      )}
      <h4 className="line-clamp-2 px-3.5 pt-3.5 font-display text-base leading-tight">{hotel.name}</h4>
    </>
  );
  const meta = [
    typeof hotel.stars === "number" ? `${hotel.stars}★` : null,
    typeof hotel.rating === "number" ? `${hotel.rating}/10${hotel.reviews ? ` (${hotel.reviews.toLocaleString()})` : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    // Same shadow-clipping fix as PlaceCardView above — see its comment.
    <article className={cn(card, "group relative flex h-full flex-col")}>
      {onOpen && <CardOpenOverlay label={`Open ${hotel.name}`} onOpen={onOpen} />}
      {head}
      <div className="flex flex-1 flex-col gap-2 px-3.5 pt-2 pb-3.5">
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
        {hotel.distanceToLocked && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0 text-coral" /> {hotel.distanceToLocked}
          </p>
        )}
        <p className="flex flex-wrap items-baseline gap-x-1">
          <span className="text-sm font-semibold tabular-nums">{hotel.nightlyPrice} {hotel.currency}</span>
          <span className="text-[11px] text-muted-foreground">/night · {hotel.totalPrice} {hotel.currency} total</span>
        </p>
        {(hotel.board || hotel.refundable) && (
          <p className="flex flex-wrap gap-1 text-[11px]">
            {hotel.board && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{hotel.board}</span>}
            {hotel.refundable && <span className="rounded-full bg-leaf-soft px-2 py-0.5 text-leaf">Refundable</span>}
          </p>
        )}
        {onOpen && (
          <div className="relative z-10 mt-auto pt-1">
            <button type="button" className={iconBtn} onClick={onOpen}>
              Rooms &amp; details <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function FeaturedEventCard({ group, onOpen }: { group: EventGroup; onOpen?: (seed: EventSeed) => void }) {
  const event = group.base;
  const rel = relToTripLabel(event);
  const active = group.dates[0] ?? { date: event.date, url: event.url };
  const dateLabel = formatEventDates(group.dates);
  return (
    // Same shadow-clipping fix as PlaceCardView above — see its comment.
    <article className={cn(card, "relative flex h-full flex-col")}>
      {onOpen && <CardOpenOverlay label={`Open ${event.title}`} onOpen={() => onOpen({ ...eventSeed(event), url: active.url, date: active.date })} />}
      {event.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external event image
        <img src={event.imageUrl} alt={event.title} width={240} height={112} loading="lazy" className="h-28 w-full rounded-t-2xl object-cover" />
      ) : (
        <EventPoster title={event.title} className="h-24 w-full rounded-t-2xl" />
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {typeof event.rank === "number" && event.rank >= 65 && <MajorEventPill />}
        <p className="line-clamp-2 font-display text-sm leading-tight">{event.title}</p>
        <p className="text-xs text-muted-foreground">{dateLabel}</p>
        {event.venue && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{event.venue}</span>
          </p>
        )}
        {rel && <span className="w-fit rounded-full bg-leaf-soft px-2 py-0.5 text-[10px] font-medium text-leaf">{rel}</span>}
        <div className="relative z-10 mt-auto flex items-center gap-1.5 pt-1">
          {onOpen && (
            <button type="button" className={iconBtn} onClick={() => onOpen({ ...eventSeed(event), url: active.url, date: active.date })}>
              Details <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
          <ExternalLink href={active.url} className="whitespace-nowrap">
            Tickets
          </ExternalLink>
        </div>
      </div>
    </article>
  );
}

function EventRow({ group, onOpen }: { group: EventGroup; onOpen?: (seed: EventSeed) => void }) {
  const event = group.base;
  const rel = relToTripLabel(event);
  const active = group.dates[0] ?? { date: event.date, url: event.url };
  return (
    <div className="relative flex items-start justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-accent/40">
      {onOpen && <CardOpenOverlay label={`Open ${event.title}`} onOpen={() => onOpen({ ...eventSeed(event), url: active.url, date: active.date })} />}
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium leading-tight">
          <span className="min-w-0 break-words">{event.title}</span>
          {typeof event.rank === "number" && event.rank >= 65 && <MajorEventPill />}
        </p>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span>{formatEventDates(group.dates)}</span>
          {event.venue && <span>· {event.venue}</span>}
        </span>
        {rel && (
          <span
            className={cn(
              "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
              event.relToTrip === "in" ? "bg-leaf-soft text-leaf" : "bg-muted text-muted-foreground",
            )}
          >
            {rel}
          </span>
        )}
      </div>
      <div className="relative z-10 flex shrink-0 flex-col items-end gap-1.5">
        <ExternalLink href={active.url} className="whitespace-nowrap">
          Tickets
        </ExternalLink>
        {onOpen && (
          <button
            type="button"
            onClick={() => onOpen({ ...eventSeed(event), url: active.url, date: active.date })}
            className="text-[11px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Details
          </button>
        )}
      </div>
    </div>
  );
}

type WeatherBlockData = Extract<AssistantBlock, { type: "weather" }>;
const WX_ICON = { clear: Sun, clouds: Cloud, rain: CloudRain, snow: CloudSnow, mixed: CloudSun } as const;

function WeatherGlyph({ condition, className }: { condition?: WeatherBlockData["condition"]; className?: string }) {
  const Icon = WX_ICON[condition ?? "mixed"];
  return <Icon strokeWidth={1.75} className={cn("text-coral", condition === "clear" ? "wx-spin-slow" : "wx-bob", className)} />;
}

function WeatherBlockView({ block }: { block: WeatherBlockData }) {
  const chips = block.packing.length > 0 && (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {block.packing.map((item) => (
        <span key={item} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
          <Umbrella className="h-3 w-3" /> {item}
        </span>
      ))}
    </div>
  );

  if (block.mode === "forecast" && block.days.length > 0) {
    return (
      <div className={cn(card, "p-3.5")}>
        <p className="text-sm font-medium">{block.headline}</p>
        <div className="mt-3 flex gap-2 overflow-x-auto overscroll-x-contain scrollbar-slim pb-1">
          {block.days.map((day, dayIndex) => (
            <div key={dayIndex} className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl border border-border bg-background/60 px-1.5 py-2">
              <span className="text-[10px] font-medium text-muted-foreground">{day.label}</span>
              <WeatherGlyph condition={day.condition} className="h-5 w-5" />
              <span className="text-xs font-semibold tabular-nums">{day.max}°</span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{day.min}°</span>
              {day.wet && <Droplets className="h-3 w-3 text-coral" />}
            </div>
          ))}
        </div>
        {chips}
      </div>
    );
  }

  return (
    <div className={cn(card, "flex items-start gap-4 p-4")}>
      <WeatherGlyph condition={block.condition} className="h-12 w-12 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="eyebrow">
          Typical {block.month ?? "weather"}{block.location ? ` · ${block.location}` : ""}
          {block.estimated && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Estimated</span>}
        </p>
        {(typeof block.highC === "number" || typeof block.lowC === "number") && (
          <p className="mt-1 flex items-baseline gap-1.5">
            {typeof block.highC === "number" && <span className="font-display text-2xl tabular-nums">{block.highC}°</span>}
            {typeof block.lowC === "number" && <span className="text-sm tabular-nums text-muted-foreground">/ {block.lowC}°</span>}
            <span className="text-xs text-muted-foreground">typical high / low</span>
          </p>
        )}
        <p className="mt-1.5 text-sm text-ink-soft">{block.headline}</p>
        {typeof block.rainyDays === "number" && block.rainyDays > 0 && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Droplets className="h-3 w-3" /> about {block.rainyDays} rainy day{block.rainyDays === 1 ? "" : "s"} that month
          </p>
        )}
        {chips}
      </div>
    </div>
  );
}

type ComparisonBlockData = Extract<AssistantBlock, { type: "comparison" }>;

/** Attribute-major layout — reads top-to-bottom in a narrow chat column, where a wide table can't. */
function ComparisonBlockView({ block }: { block: ComparisonBlockData }) {
  const attrs = block.columns.slice(1); // the "Option" header is redundant — the row label carries it
  return (
    <div className={cn(card, "overflow-hidden")}>
      <div className="border-b border-border/60 px-4 pt-3.5 pb-2.5">
        <p className="font-display text-sm">{block.title}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {block.rows.map((row) => (
            <span key={row.label} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{row.label}</span>
          ))}
        </div>
      </div>
      <div className="divide-y divide-border/60">
        {attrs.map((attr, attrIndex) => (
          <div key={attr} className="px-4 py-2.5">
            <p className="eyebrow">{attr}</p>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {block.rows.map((row) => (
                <div key={row.label} className="text-xs">
                  <span className="font-medium">{row.label}</span>
                  <span className="mt-0.5 block leading-relaxed text-muted-foreground">{row.cells[attrIndex + 1] ?? "—"}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {block.bestForYou && (
        <div className="border-t border-border bg-leaf-soft/40 px-4 py-2.5 text-xs text-leaf">
          <strong className="font-semibold">{block.bestForYou.label}</strong> — {block.bestForYou.reason}
        </div>
      )}
    </div>
  );
}

type StructuredAnswerBlockData = Extract<AssistantBlock, { type: "structured_answer" }>;

function StructuredAnswerBlockView({ block }: { block: StructuredAnswerBlockData }) {
  return (
    <div className="flex flex-col gap-2.5">
      {block.sections.map((section, i) => (
        <div key={i} className={cn(card, "px-3.5 py-3")}>
          <p className="font-display text-sm">{section.heading}</p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-soft">
            {section.bullets.map((bullet, j) => (
              <li key={j} className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-coral" />
                <span>
                  {bullet.text}
                  {bullet.detail ? <span className="text-muted-foreground"> — {bullet.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

type OptionsBlockData = Extract<AssistantBlock, { type: "options" }>;

function OptionsBlockView({ block, onFollowup }: { block: OptionsBlockData } & Pick<BlockHandlers, "onFollowup">) {
  const Icon = block.kind === "area" ? MapPin : Compass;
  const more = (name: string) =>
    block.kind === "area"
      ? `Tell me more about staying in ${name} — what it's like day to day, what's nearby, and whether it's a good base for us.`
      : `Tell me more about a day trip to ${name} — how to get there, how long to spend, and what to see.`;
  return (
    <div className="flex flex-col gap-2">
      {block.estimated && (
        <p className="text-[11px] text-muted-foreground">Estimated from general knowledge — not backed by a current source.</p>
      )}
      {block.items.map((item, i) => (
        <div key={i} className={cn(card, "p-3.5")}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex items-center gap-1.5 font-display text-sm">
              <Icon className="h-3.5 w-3.5 shrink-0 text-coral" /> {item.name}
            </p>
            {item.meta && <span className="shrink-0 text-[11px] text-muted-foreground">{item.meta}</span>}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{item.blurb}</p>
          {(item.tags.length > 0 || item.bestFor) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {item.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{tag}</span>
              ))}
              {item.bestFor && <span className="text-[11px] text-leaf">Best for {item.bestFor}</span>}
            </div>
          )}
          <button
            type="button"
            onClick={() => onFollowup(more(item.name))}
            className="mt-2.5 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
          >
            Tell me more &rarr;
          </button>
        </div>
      ))}
    </div>
  );
}

type BudgetBlockData = Extract<AssistantBlock, { type: "budget" }>;

function BudgetBlockView({ block }: { block: BudgetBlockData }) {
  const maxTypical = Math.max(...block.lines.map((line) => line.typical), 1);
  const fmt = (n: number) => Math.round(n).toLocaleString();
  const under = typeof block.setBudget === "number" && block.dailyTotal.typical <= block.setBudget;
  return (
    <div className={cn(card, "overflow-hidden")}>
      <p className="flex items-center gap-1.5 border-b border-border/60 px-4 pt-3.5 pb-2 font-display text-sm">
        <Wallet className="h-3.5 w-3.5 text-coral" /> Daily spend · {block.perPerson ? "per person" : "for the group"}
        {block.estimated && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Estimated</span>
        )}
      </p>
      <div className="divide-y divide-border/60">
        {block.lines.map((line, i) => (
          <div key={i} className="px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{line.category}</span>
              <span className="shrink-0 text-sm tabular-nums">
                <span className="font-semibold">{fmt(line.typical)}</span>
                <span className="text-[11px] text-muted-foreground"> {block.currency}</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-coral/70" style={{ width: `${Math.max(4, Math.round((line.typical / maxTypical) * 100))}%` }} />
            </div>
            <p className="mt-1 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span className="min-w-0 truncate">{line.note}</span>
              <span className="shrink-0 tabular-nums">{fmt(line.low)}–{fmt(line.high)}</span>
            </p>
          </div>
        ))}
      </div>
      <div className="border-t border-border bg-muted/30 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Per day, typical</span>
          <span className="tabular-nums">
            <span className="font-display text-lg">{fmt(block.dailyTotal.typical)}</span>
            <span className="text-xs text-muted-foreground"> {block.currency}</span>
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">Range {fmt(block.dailyTotal.low)}–{fmt(block.dailyTotal.high)} {block.currency}</p>
        {typeof block.setBudget === "number" && (
          <span className={cn("mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", under ? "bg-leaf-soft text-leaf" : "bg-coral-soft text-coral")}>
            {under ? "Fits your" : "Over your"} {fmt(block.setBudget)} {block.currency}/day budget
          </span>
        )}
        {block.tripNote && <p className="mt-1.5 text-[11px] text-muted-foreground">{block.tripNote}</p>}
      </div>
    </div>
  );
}

type ItineraryBlockData = Extract<AssistantBlock, { type: "itinerary" }>;
const STOP_ICON = { food: Coffee, sight: Landmark, activity: Sparkles, nightlife: Martini, transit: TrainFront, event: TicketCheck, rest: Moon } as const;

/** Day label -> 1-based day index ("Day 3" -> 3), falling back to the day's position in the plan. */
const dayIndexFromLabel = (label: string, fallback: number): number => {
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : fallback;
};

function ItineraryBlockView({ block, tripId, onOpenPlace }: { block: ItineraryBlockData; tripId: string } & Pick<BlockHandlers, "onOpenPlace">) {
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<"idle" | "adding" | "added">("idle");
  const multi = block.days.length > 1;
  const day = block.days[Math.min(active, block.days.length - 1)];
  const totalStops = block.days.reduce((n, d) => n + d.stops.length, 0);

  async function addAll() {
    if (status !== "idle") return;
    setStatus("adding");
    let failures = 0;
    for (const [i, d] of block.days.entries()) {
      const dayIndex = dayIndexFromLabel(d.label, i + 1);
      for (const stop of d.stops) {
        const time = parseClockTime(stop.time);
        const res = await mutate("/api/commands", {
          method: "POST",
          // Carries the place id through when the stop is a real, known place — without it the
          // itinerary row has nothing to open a detail panel from later. A vague "Morning"/
          // "Afternoon" label doesn't parse to a real time and is left off rather than guessed.
          body: { type: "add_itinerary_item", tripId, title: stop.title, dayIndex, ...(stop.placeId ? { providerId: stop.placeId } : {}), ...(time ? { time } : {}) },
          announce: ["itinerary"],
        });
        if (!res.ok) failures += 1;
      }
    }
    if (failures === totalStops) {
      setStatus("idle");
      notifyToast("Couldn’t add the plan to your itinerary. Try again.", "error");
    } else {
      setStatus("added");
      notifyToast(failures ? `Added the plan — ${failures} stop${failures === 1 ? "" : "s"} didn’t save.` : "Added the whole plan to your itinerary.", failures ? "info" : "success");
    }
  }

  return (
    <div className={cn(card, "overflow-hidden")}>
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 pt-3.5 pb-2">
        <p className="min-w-0 truncate font-display text-sm">{block.title ?? (multi ? day.label : "")}</p>
        <button
          type="button"
          onClick={() => void addAll()}
          disabled={status !== "idle"}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium transition-colors",
            status === "added" ? "border-leaf/40 bg-leaf/10 text-leaf" : "hover:bg-accent",
          )}
        >
          {status === "adding" ? <Loader2 className="h-3 w-3 animate-spin" /> : status === "added" ? <Check className="h-3 w-3" /> : <CalendarPlus className="h-3 w-3" />}
          {status === "added" ? "Added to itinerary" : "Add whole plan"}
        </button>
      </div>
      {block.intro && (
        <div className="border-b border-border/60 bg-muted/20 px-4 py-3">
          <p className="eyebrow">About this</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{block.intro}</p>
        </div>
      )}
      {multi && (
        <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain scrollbar-slim border-b border-border/60 px-4 py-2.5">
          {block.days.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                i === active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
      <div className="px-4 py-3.5">
        {!multi && <p className="font-display text-sm">{day.label}</p>}
        {day.subtitle && <p className={cn("text-xs text-muted-foreground", !multi && "mt-0.5")}>{day.subtitle}</p>}
        <ol className="mt-3">
          {day.stops.map((stop, i) => {
            const Icon = STOP_ICON[stop.kind ?? "activity"] ?? Sparkles;
            const clickable = Boolean(stop.placeId && onOpenPlace);
            return (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < day.stops.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />}
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-card text-coral">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  {stop.time && <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{formatClockTime(stop.time)}</span>}
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => onOpenPlace!({ providerId: stop.placeId!, name: stop.title } as PlaceCard)}
                      className="block text-left text-sm font-medium leading-tight hover:text-coral"
                    >
                      {stop.title} <ArrowUpRight className="inline h-3 w-3 align-[-1px] text-muted-foreground" />
                    </button>
                  ) : (
                    <p className="text-sm font-medium leading-tight">{stop.title}</p>
                  )}
                  {stop.note && <p className="mt-0.5 text-xs text-muted-foreground">{stop.note}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

type TripUpdateBlockData = Extract<AssistantBlock, { type: "trip_update" }>;

/** A visible "Destination updated: Toronto -> Osaka" receipt for a trip fact the assistant just
 *  changed on the user's own explicit say-so. Applied immediately, never gated behind a confirm
 *  dialog — but shown plainly, with a one-tap Undo that just re-sends the reverse statement
 *  through the same chat pipeline rather than a separate undo code path. */
function TripUpdateBlockView({ block, onFollowup }: { block: TripUpdateBlockData } & Pick<BlockHandlers, "onFollowup">) {
  return (
    <div className="flex flex-col gap-1.5">
      {block.changes.map((change, i) => (
        <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs">
          <RefreshCw className="h-3 w-3 shrink-0 text-coral" />
          <span className="font-medium">{change.label} updated:</span>
          <span className="text-muted-foreground">
            {change.from ?? "not set"} <span aria-hidden>&rarr;</span> {change.to ?? "not set"}
          </span>
          {change.undoPrompt && (
            <button
              type="button"
              onClick={() => onFollowup(change.undoPrompt!)}
              className="ml-auto text-[11px] font-medium text-primary underline-offset-2 hover:underline"
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

type RouteSummaryBlockData = Extract<AssistantBlock, { type: "route_summary" }>;
type RouteGroupBlock = { type: "route_group"; from: string; to: string; routes: RouteSummaryBlockData[] };
type RenderBlock = AssistantBlock | RouteGroupBlock;

const ROUTE_MODE_LABEL: Record<string, string> = { driving: "Drive", walking: "Walk", transit: "Transit" };
const routeModeIcon = (mode: string) => (mode === "walking" ? Footprints : mode === "driving" ? Car : TrainFront);

/**
 * A "how do I get there" question now asks for more than one mode when none was named
 * (turn-resolver.ts), so the SAME from/to can arrive as several consecutive `route_summary`
 * blocks — one per mode. Grouping them here, at render time only, turns that into one "ways to
 * get there" comparison instead of N stacked identical-looking cards; the wire contract still
 * carries one block per mode.
 */
function groupRouteSummaries(blocks: AssistantBlock[]): RenderBlock[] {
  const sameRoute = (a: RouteSummaryBlockData, b: RouteSummaryBlockData) =>
    a.from.trim().toLowerCase() === b.from.trim().toLowerCase() && a.to.trim().toLowerCase() === b.to.trim().toLowerCase();
  const out: RenderBlock[] = [];
  for (const block of blocks) {
    if (block.type !== "route_summary") {
      out.push(block);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && prev.type === "route_group" && sameRoute(prev.routes[0], block)) {
      prev.routes.push(block);
    } else {
      out.push({ type: "route_group", from: block.from, to: block.to, routes: [block] });
    }
  }
  return out;
}

function RouteSummaryCard({ route }: { route: RouteSummaryBlockData }) {
  const Icon = routeModeIcon(route.mode);
  return (
    <div className={cn(card, "p-3.5")}>
      <p className="flex items-center gap-2 font-display text-sm">
        <Icon className="h-4 w-4 text-coral" /> {route.from} → {route.to}
      </p>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        {Math.round(route.durationSeconds / 60)} min · {(route.distanceMeters / 1000).toFixed(1)} km
        {route.fare ? ` · ${route.fare.amount} ${route.fare.currency}` : ""}
        {route.departureTime
          ? ` · leaves ${new Date(route.departureTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : ""}
      </p>
      {route.steps.length > 0 && (
        <ol className="mt-2 list-decimal pl-4 text-xs text-ink-soft marker:text-muted-foreground">
          {route.steps.map((step, stepIndex) => (
            <li key={stepIndex} className="my-0.5">{step}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 2+ modes between the same two places — one row each, fastest called out, sorted quickest first. */
function RouteComparisonCard({ from, to, routes }: { from: string; to: string; routes: RouteSummaryBlockData[] }) {
  const sorted = [...routes].sort((a, b) => a.durationSeconds - b.durationSeconds);
  const fastest = sorted[0];
  return (
    <div className={cn(card, "divide-y divide-border/60 overflow-hidden")}>
      <p className="px-3.5 pt-3.5 pb-2.5 font-display text-sm">
        {from} → {to}
      </p>
      {sorted.map((route, i) => {
        const Icon = routeModeIcon(route.mode);
        return (
          <div key={i} className="flex items-center gap-3 px-3.5 py-2.5">
            <Icon className="h-4 w-4 shrink-0 text-coral" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {ROUTE_MODE_LABEL[route.mode] ?? route.mode}
                {route === fastest && <span className="text-[10px] font-medium text-leaf">Fastest</span>}
              </p>
              {route.steps[0] && <p className="truncate text-xs text-muted-foreground">{route.steps[0]}</p>}
            </div>
            <p className="shrink-0 text-right tabular-nums">
              <span className="block text-sm font-semibold">{Math.round(route.durationSeconds / 60)} min</span>
              <span className="text-xs text-muted-foreground">
                {(route.distanceMeters / 1000).toFixed(1)} km{route.fare ? ` · ${route.fare.amount} ${route.fare.currency}` : ""}
              </span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function MessageBlocks({ blocks, tripId, onFollowup, onOpenPlace, onOpenStay, onOpenEvent, onOpenCollection, preview = true }: { blocks: AssistantBlock[]; preview?: boolean } & BlockHandlers) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      {groupRouteSummaries(blocks).map((block, index) => {
        if (block.type === "trip_update") {
          return <div key={index}><TripUpdateBlockView block={block} onFollowup={onFollowup} /></div>;
        }

        if (block.type === "place_list") {
          const visible = preview ? block.places.slice(0, MAX_CHAT_CARDS) : block.places;
          const title = cleanSectionTitle(block.title);
          return (
            <div key={index} className="flex min-w-0 flex-col gap-2.5">
              <ResultBand
                title={preview ? title : undefined}
                onSeeAll={preview && block.places.length > MAX_CHAT_CARDS && onOpenCollection ? () => onOpenCollection(title ?? "All places", block) : undefined}
              />
              <div className={preview ? carousel : grid}>
                {visible.map((place) => (
                  <div key={place.providerId} className={preview ? "w-64 shrink-0 snap-start" : undefined}>
                    <PlaceCardView place={place} tripId={tripId} onOpenPlace={onOpenPlace} />
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (block.type === "comparison") {
          // Real places → a live side-by-side, rendered inline in the conversation (no side panel).
          if (block.placeIds && block.placeIds.length >= 2) {
            return (
              <div key={index} className={cn(card, "p-3.5")}>
                <p className="font-display text-sm">{block.title}</p>
                {block.bestForYou && (
                  <p className="mt-1 text-xs text-leaf">
                    <strong className="font-medium">{block.bestForYou.label}</strong> — {block.bestForYou.reason}
                  </p>
                )}
                <div className="mt-2.5">
                  <CompareView tripId={tripId} ids={block.placeIds} />
                </div>
              </div>
            );
          }
          return <div key={index}><ComparisonBlockView block={block} /></div>;
        }

        if (block.type === "actions") {
          return (
            <div key={index} className="flex flex-wrap gap-2">
              {block.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onFollowup(item.prompt)}
                  className="btn-chip"
                >
                  {item.label}
                </button>
              ))}
            </div>
          );
        }

        if (block.type === "route_group") {
          return (
            <div key={index}>
              {block.routes.length === 1 ? (
                <RouteSummaryCard route={block.routes[0]} />
              ) : (
                <RouteComparisonCard from={block.from} to={block.to} routes={block.routes} />
              )}
            </div>
          );
        }

        if (block.type === "clarifying_question") {
          // The question itself streams as the reply text; only the answer chips are structured.
          if (block.chips.length === 0) return null;
          return (
            <div key={index} className="flex flex-wrap gap-2">
              {block.chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => onFollowup(chip)}
                  className="btn-chip"
                >
                  {chip}
                </button>
              ))}
            </div>
          );
        }

        if (block.type === "events") {
          if (!preview) {
            return (
              <div key={index} className={grid}>
                {block.items.map((event) => (
                  <EventCard
                    key={`${event.url}|${event.date ?? ""}`}
                    tripId={tripId}
                    event={event as NearbyEvent}
                  />
                ))}
              </div>
            );
          }
          const groups = groupEventOccurrences(block.items);
          const visibleGroups = preview ? groups.slice(0, MAX_CHAT_CARDS) : groups;
          const featured = visibleGroups.filter((g) => isFeaturedEvent(g.base)).slice(0, 3);
          const featuredSet = new Set(featured);
          const rest = visibleGroups.filter((g) => !featuredSet.has(g));
          const freshnessNote = (
            <p className={freshness}>
              <TicketCheck className="mr-1 inline h-3 w-3" />
              Dates and availability can change — check the ticket page before you buy.
            </p>
          );
          return (
            <div key={index} className="flex flex-col gap-2.5">
              <ResultBand
                title={preview ? "Events" : undefined}
                onSeeAll={preview && groups.length > MAX_CHAT_CARDS && onOpenCollection ? () => onOpenCollection("All events", block) : undefined}
              />
              {block.window && (
                <p className="text-[11px] text-muted-foreground">Checked against your trip · {block.window.start} → {block.window.end}</p>
              )}

              {featured.length > 0 && (
                <div className={preview ? carousel : grid}>
                  {featured.map((group, groupIndex) => (
                    <div key={`${group.base.title}-${groupIndex}`} className={preview ? "w-[240px] shrink-0 snap-start" : undefined}>
                      <FeaturedEventCard group={group} onOpen={onOpenEvent} />
                    </div>
                  ))}
                </div>
              )}

              {rest.length > 0 ? (
                <div className={cn(card, "overflow-hidden")}>
                  {featured.length > 0 && (
                    <p className="border-b border-border/60 bg-muted/30 px-3.5 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      More on while you&rsquo;re there
                    </p>
                  )}
                  <div className="divide-y divide-border/60">
                    {rest.map((group, groupIndex) => (
                      <EventRow key={`${group.base.title}-${groupIndex}`} group={group} onOpen={onOpenEvent} />
                    ))}
                  </div>
                  <div className="px-3.5 py-2.5">{freshnessNote}</div>
                </div>
              ) : (
                freshnessNote
              )}
            </div>
          );
        }

        if (block.type === "flights") {
          return (
            <div key={index} className={cn(card, "px-3.5 py-2.5")}>
              <p className="mb-1 flex items-center gap-2 font-display text-sm">
                <Plane className="h-4 w-4 text-coral" /> {block.origin} → {block.destination}
                {block.dateNote ? <span className="text-xs font-normal text-muted-foreground">· {block.dateNote}</span> : null}
              </p>
              {block.items.map((offer, offerIndex) => (
                <div key={offerIndex} className={cn("flex items-baseline justify-between gap-3 py-2", rowDivider)}>
                  <span className="text-sm font-medium">{offer.airline}</span>
                  <span className="flex-1 text-xs text-muted-foreground">
                    {offer.originAirport && offer.destinationAirport ? `${offer.originAirport} → ${offer.destinationAirport} · ` : ""}
                    {Math.floor(offer.durationMinutes / 60)}h {offer.durationMinutes % 60}m ·{" "}
                    {offer.stops === 0 ? "nonstop" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`} · {fmtTime(offer.departAt)}
                    {offer.cabinClass ? ` · ${offer.cabinClass}` : ""}
                    {offer.baggage ? ` · ${offer.baggage}` : ""}
                    {offer.layoverAirports?.length ? ` · via ${offer.layoverAirports.join(", ")}` : ""}
                  </span>
                  <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
                    {offer.price} {offer.currency}
                  </span>
                </div>
              ))}
              {block.items.some((offer) => offer.aircraft || offer.fareConditions?.length) && (
                <div className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                  {block.items.slice(0, 3).map((offer, offerIndex) => (
                    <p key={`detail-${offerIndex}`}>
                      {offer.aircraft ? `Aircraft: ${offer.aircraft}` : ""}
                      {offer.aircraft && offer.fareConditions?.length ? " · " : ""}
                      {offer.fareConditions?.join(" · ")}
                    </p>
                  ))}
                </div>
              )}
              <p className={freshness}>Fares change quickly — check the airline or a travel site before booking.</p>
            </div>
          );
        }

        if (block.type === "stays") {
          const dates = { checkin: block.checkin, checkout: block.checkout };
          const visible = preview ? block.items.slice(0, MAX_CHAT_CARDS) : block.items;
          return (
            <div key={index} className="flex flex-col gap-2">
              <ResultBand
                title={preview ? `Stays in ${block.location}` : undefined}
                onSeeAll={preview && block.items.length > MAX_CHAT_CARDS && onOpenCollection ? () => onOpenCollection(`All stays in ${block.location}`, block) : undefined}
              />
              <p className="text-xs text-muted-foreground">
                {block.nights} night{block.nights > 1 ? "s" : ""}{block.dateNote ? ` · ${block.dateNote}` : ""}
              </p>
              <div className={preview ? carousel : grid}>
                {visible.map((hotel, hotelIndex) => (
                  <div key={hotel.hotelId || `${hotel.name}-${hotelIndex}`} className={preview ? "w-[228px] shrink-0 snap-start" : undefined}>
                    <StayCardView hotel={hotel} onOpen={onOpenStay && hotel.hotelId ? () => onOpenStay(hotel, dates) : undefined} />
                  </div>
                ))}
              </div>
              {block.rooms && block.rooms.length > 0 && (
                <div className={cn(card, "px-3.5 py-3")}>
                  <p className="mb-1.5 text-xs font-medium">Rooms at {block.detailHotel}</p>
                  {block.rooms.map((room, roomIndex) => (
                    <div key={roomIndex} className="flex justify-between gap-2 py-1 text-xs text-ink-soft">
                      <span className="min-w-0 truncate">
                        {room.name}
                        {room.boardName ? ` · ${room.boardName}` : ""}
                        {room.refundable ? " · refundable" : ""}
                      </span>
                      <span className="shrink-0 tabular-nums">{room.nightlyAmount} {room.currency}/night</span>
                    </div>
                  ))}
                </div>
              )}
              <p className={freshness}>Taxes and fees may be added at checkout — confirm the total when you book.</p>
            </div>
          );
        }

        if (block.type === "weather") {
          return <div key={index}><WeatherBlockView block={block} /></div>;
        }

        if (block.type === "itinerary") {
          return <div key={index}><ItineraryBlockView block={block} tripId={tripId} onOpenPlace={onOpenPlace} /></div>;
        }

        if (block.type === "budget") {
          return <div key={index}><BudgetBlockView block={block} /></div>;
        }

        if (block.type === "options") {
          return <div key={index}><OptionsBlockView block={block} onFollowup={onFollowup} /></div>;
        }

        if (block.type === "structured_answer") {
          return <div key={index}><StructuredAnswerBlockView block={block} /></div>;
        }

        if (block.type === "checklist") {
          return (
            <div key={index} className="flex flex-col gap-2.5">
              {block.groups.map((group) => (
                <div key={group.title} className={cn(card, "px-3.5 py-3")}>
                  <p className="font-display text-sm">{group.title}</p>
                  <ul className="mt-1.5 list-disc pl-4 text-sm text-ink-soft marker:text-muted-foreground">
                    {group.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="my-0.5">
                        {item.text}
                        {item.why ? <span className="text-muted-foreground"> — {item.why}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
