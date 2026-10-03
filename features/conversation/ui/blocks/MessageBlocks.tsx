"use client";

import React, { useState } from "react";
import { useDistance } from "@/lib/use-distance";
import {
  Accessibility,
  ArrowRight,
  ArrowUpRight,
  Backpack,
  BedDouble,
  CalendarDays,
  CalendarPlus,
  Car,
  Check,
  Clock,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudSun,
  Compass,
  Droplets,
  Footprints,
  SearchX,
  ChevronRight,
  Info,
  Luggage,
  PersonStanding,
  Globe,
  Loader2,
  MapPin,
  Phone,
  Plane,
  Shirt,
  Snowflake,
  Star,
  Sun,
  TrainFront,
  Umbrella,
  Wallet,
  CalendarRange,
  Scale,
} from "lucide-react";
import type { AssistantBlock, PlaceCard, StayCardItem, TrustLabel } from "@/packages/contracts/assistant";
import type { Place } from "@/packages/contracts/place";
import type { EventSeed } from "@/components/TripPanelProvider";
import { AddToTripControl } from "@/features/trip/ui/AddToTripControl";
import { EventPoster } from "@/components/EventPoster";
import { EventCard, type NearbyEvent } from "@/components/EventCard";
import { CompareView } from "@/components/CompareView";
import { BlurImage } from "@/components/motion-primitives";
import { cn, safeHref } from "@/lib/utils";
import { notifyToast } from "@/lib/application/toast";
import { formatClockTime } from "@/lib/application/clock-time";
import { addStopsToItinerary, dayIndexFromLabel, itineraryTitle } from "@/features/conversation/application/addPlanToItinerary";
import { categoryLabel, priceLabel } from "@/lib/places-ui";
import { portableProxyPhotoUrl } from "../portable-photo-url";
import type { CardPanel } from "@/components/TripPanelProvider";
import { PlanStops, type PlanStop } from "./PlanStops";
import { FactStrip } from "@/components/DetailKit";
import { motion } from "motion/react";
import { ContentSwap, Enter, motionTokens } from "@/components/motion-primitives";
import { SlidingTabs } from "./SlidingTabs";
import { ChecklistBlock } from "./ChecklistBlock";
import { parseRouteStep, routeLines, splitRouteEnds } from "./routeText";
import { pointsFromItinerary, pointsFromPlaces, pointsFromStays } from "./mapPoints";
import { DEFAULT_FLIGHT_VIEW, FlightControls, applyFlightView, arrivalDayOffset, type FlightView } from "./FlightFilters";
import { HoldHeight, ScrollWindow, ScrollX, ViewControls } from "./ListControls";
import { DEFAULT_EVENT_VIEW, DEFAULT_STAY_VIEW, applyEventView, applyStayView, eventControls, stayControls, type EventView, type StayView } from "./listViews";
import { factGlyph, placeGlyph } from "./glyphs";
import { Badge, BlockHeader, RatingMeta, segmentTab, CARD_W, CardMedia, CardOpenOverlay, DetailsButton, EntityCard, MediaFallback, Meta, Notice, SectionHeader, compactCount, controlSecondary, grid, money, prettyDate, prettyDates, rail, surface, textAction, type, MapButton } from "./ui";

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
  /** When set, a flight, a day of a plan, or a budget opens in the chat side-panel, with the data the card already has. */
  onOpenPanel?: (panel: CardPanel) => void;
};

const MAX_CHAT_CARDS = 4;
const cleanSectionTitle = (value?: string) => value
  ? value.trim().replace(/^./, (letter) => letter.toUpperCase())
  : undefined;

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

/** Drop the card-only fields so what's left is a plain provider Place. */
const toPlace = ({ photoUrl: _photo, trust: _trust, distanceToLocked: _distance, ...place }: PlaceCard): Place => place;

const TRUST_LABEL: Record<TrustLabel, string> = {
  verified: "Verified",
  sourced: "From the web",
  estimated: "Estimated",
  assumption: "Assumption",
  unavailable: "Unavailable",
};

const Ticket = ({ href, children = "Tickets", label }: { href: string; children?: React.ReactNode; label?: string }) => (
  <a href={safeHref(href)} target="_blank" rel="noreferrer noopener" aria-label={label} className={cn(textAction, "whitespace-nowrap")}>
    {children} <ArrowUpRight className="size-3.5" aria-hidden />
  </a>
);

/** Time of day for a departure/arrival ("6:20 PM"); a bare or unparsable value is shown as given. */
function clock(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
}

function PlaceCardView({
  place,
  tripId,
  onOpenPlace,
  photoless = false,
}: { place: PlaceCard; tripId: string; /** No card in this list has a photo: show a glyph tile instead of an empty banner. */ photoless?: boolean } & Pick<BlockHandlers, "onOpenPlace">) {
  const price = priceLabel(place.priceLevel);
  const category = place.category ? categoryLabel(place.category) : undefined;
  const showBadges = place.openNow !== undefined || place.distanceToLocked || place.trust !== "sourced";
  return (
    <EntityCard
      label={`Open ${place.name}`}
      onOpen={onOpenPlace ? () => onOpenPlace(place) : undefined}
      media={photoless ? undefined : <CardMedia src={portableProxyPhotoUrl(place.photoUrl)} alt={place.name} fallback={<MediaFallback icon={placeGlyph(place.category, place.name).icon} className="aspect-[16/10] w-full rounded-t-2xl" />} />}
      glyph={placeGlyph(place.category, place.name).icon}
      title={place.name}
      meta={[
        typeof place.rating === "number" ? <RatingMeta rating={place.rating} count={place.userRatingCount} /> : null,
        category,
        price,
      ]}
      badges={showBadges ? (
        <>
          {place.openNow !== undefined && <Badge tone={place.openNow ? "positive" : "neutral"} icon={Clock}>{place.openNow ? "Open now" : "Closed now"}</Badge>}
          {place.distanceToLocked && <Badge icon={MapPin}>{place.distanceToLocked}</Badge>}
          {/* "From the web" is the default for every card — only a non-default trust label carries information. */}
          {place.trust !== "sourced" && <Badge tone="caution">{TRUST_LABEL[place.trust] ?? place.trust}</Badge>}
        </>
      ) : undefined}
      extra={
        <>
          {place.reviewSummary && <p className={cn(type.meta, "line-clamp-2")}>{place.reviewSummary}</p>}
          {(place.phone || place.websiteUri || place.wheelchairAccessible) && (
            <div className={cn(type.meta, "relative z-10 flex flex-wrap gap-x-3 gap-y-1")}>
              {place.phone && <a href={`tel:${place.phone}`} className="inline-flex items-center gap-1 hover:text-foreground"><Phone className="size-3.5" aria-hidden />{place.phone}</a>}
              {place.websiteUri && <a href={safeHref(place.websiteUri)} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-foreground"><Globe className="size-3.5" aria-hidden />Website</a>}
              {place.wheelchairAccessible && <span className="inline-flex items-center gap-1"><Accessibility className="size-3.5" aria-hidden />Step-free entrance</span>}
            </div>
          )}
        </>
      }
      actions={
        <>
          {/* One control: shortlist (still deciding) → a day (going in the plan) → remove. */}
          <AddToTripControl tripId={tripId} place={toPlace(place)} size="sm" block className="min-w-0 flex-1" />
          {onOpenPlace ? (
            <DetailsButton label={`Details: ${place.name}`} onClick={() => onOpenPlace(place)} />
          ) : (
            place.sourceUrl && /^https?:\/\//i.test(place.sourceUrl) && (
              <a href={place.sourceUrl} target="_blank" rel="noreferrer noopener" className={controlSecondary}>
                Maps <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            )
          )}
        </>
      }
    />
  );
}

function StayCardView({ hotel, onOpen, photoless = false }: { hotel: StayCardItem; onOpen?: () => void; photoless?: boolean }) {
  const priced = Number(hotel.nightlyPrice) > 0;
  return (
    <EntityCard
      label={`Open ${hotel.name}`}
      onOpen={onOpen}
      media={photoless ? undefined : <CardMedia src={hotel.thumbnailUrl} alt={hotel.name} fallback={<MediaFallback icon={BedDouble} className="aspect-[16/10] w-full rounded-t-2xl" />} />}
      glyph={BedDouble}
      title={hotel.name}
      // A hotel's star class is not a guest rating: it reads "4-star", never a bare ★ 4 next to a place's ★ 4.3.
      meta={[
        typeof hotel.stars === "number" ? `${hotel.stars}-star` : null,
        typeof hotel.rating === "number" ? <span className="tabular-nums">{`${hotel.rating}/10 guests${hotel.reviews ? ` (${hotel.reviews.toLocaleString()})` : ""}`}</span> : null,
      ]}
      fact={priced ? (
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-display text-lg leading-tight font-semibold tabular-nums">{money(hotel.nightlyPrice, hotel.currency)}</span>
          <span className={type.meta}>/ night</span>
          <span className={cn(type.meta, "w-full tabular-nums")}>{money(hotel.totalPrice, hotel.currency)} total</span>
        </p>
      ) : (
        <p className={cn(type.body, "text-muted-foreground")}>Price unavailable for these dates</p>
      )}
      badges={hotel.board || hotel.refundable || hotel.distanceToLocked ? (
        <>
          {hotel.distanceToLocked && <Badge icon={MapPin}>{hotel.distanceToLocked}</Badge>}
          {hotel.board && <Badge>{hotel.board}</Badge>}
          {hotel.refundable && <Badge tone="positive" icon={Check}>Refundable</Badge>}
        </>
      ) : undefined}
      actions={onOpen ? <DetailsButton label={`Rooms & details: ${hotel.name}`} onClick={onOpen}>Rooms &amp; details</DetailsButton> : undefined}
    />
  );
}

function FeaturedEventCard({ group, onOpen }: { group: EventGroup; onOpen?: (seed: EventSeed) => void }) {
  const event = group.base;
  const rel = relToTripLabel(event);
  const active = group.dates[0] ?? { date: event.date, url: event.url };
  const open = () => onOpen?.({ ...eventSeed(event), url: active.url, date: active.date });
  const major = typeof event.rank === "number" && event.rank >= 65;
  return (
    <EntityCard
      label={`Open ${event.title}`}
      onOpen={onOpen ? open : undefined}
      media={<CardMedia src={event.imageUrl} alt={event.title} fallback={<EventPoster title={event.title} className="aspect-[16/10] w-full rounded-t-2xl" />} />}
      title={event.title}
      meta={[formatEventDates(group.dates), event.venue]}
      badges={major || rel ? (
        <>
          {major && <Badge tone="brand">Major event</Badge>}
          {rel && <Badge tone={event.relToTrip === "in" ? "positive" : "neutral"}>{rel}</Badge>}
        </>
      ) : undefined}
      actions={
        <>
          <a href={safeHref(active.url)} target="_blank" rel="noreferrer noopener" aria-label={`Tickets: ${event.title}`} className={controlSecondary}>
            Tickets <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
          {onOpen && <DetailsButton label={`Details: ${event.title}`} onClick={open} />}
        </>
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
        {rel && <Badge tone={event.relToTrip === "in" ? "positive" : "neutral"}>{rel}</Badge>}
      </div>
      <div className="relative z-10 flex shrink-0 flex-col items-end gap-3">
        <Ticket href={active.url} label={`Tickets: ${event.title}`} />
        {onOpen && (
          <button type="button" onClick={open} className={cn(textAction, "text-muted-foreground")}>
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
  return <Icon className={cn("text-coral", className)} aria-hidden />;
}

/** A packing item gets the icon that matches it, not one umbrella for everything. */
function packIcon(item: string) {
  if (/boot|shoe|sneaker|sandal/i.test(item)) return Footprints;
  if (/umbrella|rain|waterproof|shell|poncho/i.test(item)) return Umbrella;
  if (/scarf|glove|thermal|wool|beanie|mitt|base layer/i.test(item)) return Snowflake;
  if (/jacket|coat|layer|sweater|fleece|parka|puffer|hoodie/i.test(item)) return Shirt;
  if (/\bsun|sunglass|spf|sunscreen/i.test(item)) return Sun;
  return Backpack;
}

function WeatherBlockView({ block }: { block: WeatherBlockData }) {
  const chips = block.packing.length > 0 && (
    <div className="flex flex-wrap gap-1.5">
      {block.packing.map((item) => (
        <Badge key={item} icon={packIcon(item)}>{item}</Badge>
      ))}
    </div>
  );

  if (block.mode === "forecast" && block.days.length > 0) {
    return (
      <div className={cn(surface, "space-y-3 p-4")}>
        <div className="space-y-0.5">
          <p className={cn(type.body, "font-medium")}>{block.headline}</p>
          <Meta items={[block.location]} />
        </div>
        <ul className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(block.days.length, 7)}, minmax(0, ${block.days.length >= 5 ? "1fr" : "4.5rem"}))` }}>
          {block.days.slice(0, 7).map((day, dayIndex) => (
            <li key={dayIndex} className="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-border bg-background/60 px-1 py-3">
              <span className={cn(type.meta, "font-medium")}>{day.label}</span>
              <WeatherGlyph condition={day.condition} className="size-5" />
              <span className={cn(type.body, type.num)}>{day.max}°</span>
              <span className={cn(type.meta, "tabular-nums")}>{day.min}°</span>
              <span className="grid h-3.5 place-items-center">{day.wet && <Droplets className="size-3.5 text-coral" aria-label="Rain expected" />}</span>
            </li>
          ))}
        </ul>
        {chips}
      </div>
    );
  }

  return (
    <div className={cn(surface, "flex items-start gap-4 p-4")}>
      <WeatherGlyph condition={block.condition} className="size-10 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className={cn(type.meta, "flex flex-wrap items-center gap-x-2 gap-y-1")}>
          <span className="font-medium text-foreground">Typical {block.month ?? "weather"}{block.location ? ` · ${block.location}` : ""}</span>
          {block.estimated && <Badge>Estimated</Badge>}
        </p>
        {(typeof block.highC === "number" || typeof block.lowC === "number") && (
          <p className="flex items-baseline gap-2">
            {typeof block.highC === "number" && <span className={type.figure}>{block.highC}°</span>}
            {typeof block.lowC === "number" && <span className={cn(type.body, "tabular-nums text-muted-foreground")}>/ {block.lowC}°</span>}
            <span className={type.meta}>typical high / low</span>
          </p>
        )}
        <p className={cn(type.body, "text-ink-soft")}>{block.headline}</p>
        {typeof block.rainyDays === "number" && block.rainyDays > 0 && (
          <p className={cn(type.meta, "flex items-center gap-1.5")}>
            <Droplets className="size-3.5" aria-hidden /> about {block.rainyDays} rainy day{block.rainyDays === 1 ? "" : "s"} that month
          </p>
        )}
        {chips}
      </div>
    </div>
  );
}

type ComparisonBlockData = Extract<AssistantBlock, { type: "comparison" }>;

/** Attribute rows × option columns. The redundant "Option" column is dropped — the header row names each option once. */
function ComparisonBlockView({ block }: { block: ComparisonBlockData }) {
  const attrs = block.columns.slice(1);
  return (
    <div className={cn(surface, "overflow-hidden")}>
      <BlockHeader icon={Scale} title={block.title} />
      <ScrollX label={`${block.title}, scroll sideways for more`}>
        <table className="daisy-table daisy-table-zebra daisy-table-pin-cols w-full text-sm">
          <thead>
            <tr className="text-foreground">
              <th scope="col" className="w-28 bg-card" />
              {block.rows.map((row) => (
                <th key={row.label} scope="col" className="static min-w-32 font-display text-sm font-semibold">{row.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attrs.map((attr, attrIndex) => (
              <tr key={attr}>
                <th scope="row" className="text-xs font-medium text-muted-foreground">{attr}</th>
                {block.rows.map((row) => (
                  <td key={row.label} className="align-top leading-snug">{row.cells[attrIndex + 1] ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
      {block.bestForYou && (
        <p className="flex items-start gap-2 border-t border-border bg-positive-soft px-4 py-3 text-sm text-positive">
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">{block.bestForYou.label}</strong> — {block.bestForYou.reason}
          </span>
        </p>
      )}
    </div>
  );
}

type StructuredAnswerBlockData = Extract<AssistantBlock, { type: "structured_answer" }>;

/** Sections in one card, separated by rules — a section with figures becomes a small price list. */
function StructuredAnswerBlockView({ block }: { block: StructuredAnswerBlockData }) {
  return (
    <div className={cn(surface, "divide-y divide-border")}>
      {block.sections.map((section, i) => {
        const figures = section.bullets.some((bullet) => bullet.detail);
        // Icons only when the section is practical facts (a plug, a tip, an emergency number); a plain price list stays plain.
        const icons = figures && section.bullets.some((bullet) => factGlyph(`${bullet.text} ${bullet.detail ?? ""}`));
        return (
          <section key={i} className="space-y-2 p-4">
            <h3 className={type.title}>{section.heading}</h3>
            {figures ? (
              <dl className="divide-y divide-border/60">
                {section.bullets.map((bullet, j) => {
                  const glyph = icons ? factGlyph(`${bullet.text} ${bullet.detail ?? ""}`) : null;
                  const Icon = glyph?.icon ?? Info;
                  return (
                    <div key={j} className="flex items-start gap-3 py-2">
                      {icons && (
                        <span aria-hidden className="mt-px grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          <Icon className="size-3.5" />
                        </span>
                      )}
                      <dt className={cn(type.body, "min-w-0 flex-1 pt-[3px] text-ink-soft")}>{bullet.text}</dt>
                      <dd className={cn(type.body, type.num, "max-w-[55%] shrink-0 pt-[3px] text-right")}>{bullet.detail}</dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <ul className={cn(type.body, "list-disc space-y-1 pl-5 text-ink-soft marker:text-muted-foreground")}>
                {section.bullets.map((bullet, j) => (
                  <li key={j}>{bullet.text}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

type OptionsBlockData = Extract<AssistantBlock, { type: "options" }>;

function OptionsBlockView({ block, onFollowup }: { block: OptionsBlockData } & Pick<BlockHandlers, "onFollowup">) {
  const Icon = block.kind === "area" ? MapPin : Compass;
  // Each option leads somewhere: the two next things a traveller asks about an area or a day trip.
  const actions = (name: string): Array<[label: string, prompt: string]> =>
    block.kind === "area"
      ? [["Stays here", `Show me places to stay in ${name}.`], ["What to do", `What is there to do in and around ${name}, and is it a good base for us?`]]
      : [["How to get there", `How do I get to ${name} for a day trip, and how long does it take each way?`], ["Plan the day", `Plan a day trip to ${name}: what to see, in what order, and when to head back.`]];
  return (
    <div className="flex flex-col gap-3">
      {block.estimated && <Notice tone="caution">Estimated from general knowledge — not backed by a current source.</Notice>}
      {block.items.map((item) => (
        <EntityCard
          key={item.name}
          alone
          label={item.name}
          glyph={Icon}
          title={item.name}
          meta={[item.meta]}
          extra={
            <>
              <p className={cn(type.body, "text-ink-soft")}>{item.blurb}</p>
              {(item.tags.length > 0 || item.bestFor) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
                  {item.bestFor && <Badge tone="positive" icon={Check}>Best for {item.bestFor}</Badge>}
                </div>
              )}
            </>
          }
          actions={actions(item.name).map(([label, prompt]) => (
            <button key={label} type="button" className={controlSecondary} onClick={() => onFollowup(prompt)}>
              {label} <ArrowRight className="size-3.5" aria-hidden />
            </button>
          ))}
        />
      ))}
    </div>
  );
}

type BudgetBlockData = Extract<AssistantBlock, { type: "budget" }>;

function BudgetBlockView({ block, onOpenPanel }: { block: BudgetBlockData } & Pick<BlockHandlers, "onOpenPanel">) {
  const maxTypical = Math.max(...block.lines.map((line) => line.typical), 1);
  const under = typeof block.setBudget === "number" && block.dailyTotal.typical <= block.setBudget;
  const cur = block.currency;
  return (
    <div className={cn(surface, "overflow-hidden")}>
      <BlockHeader
        icon={Wallet}
        title={<>Daily spend · {block.perPerson ? "per person" : "for the group"}</>}
        actions={<>{block.estimated && <Badge>Estimated</Badge>}{onOpenPanel && <DetailsButton label="Budget details" onClick={() => onOpenPanel({ kind: "budget", block })} />}</>}
      />
      <ul className="divide-y divide-border">
        {block.lines.map((line, i) => (
          <li key={i} className="space-y-1.5 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn(type.body, "font-medium")}>{line.category}</span>
              <span className={cn(type.body, type.num)}>{money(Math.round(line.typical), cur)}</span>
            </div>
            <progress
              className="daisy-progress h-1.5 w-full text-coral/70 [&::-webkit-progress-bar]:bg-muted"
              value={line.typical}
              max={maxTypical}
              aria-label={`${line.category}: about ${money(Math.round(line.typical), cur)} a day`}
            />
            <p className={cn(type.meta, "flex items-baseline justify-between gap-3")}>
              <span className="min-w-0 truncate">{line.note}</span>
              <span className="shrink-0 tabular-nums">{money(Math.round(line.low), cur)}–{money(Math.round(line.high), cur)}</span>
            </p>
          </li>
        ))}
      </ul>
      <div className="daisy-stats w-full rounded-none border-t border-border bg-muted/40">
        <div className="daisy-stat px-4 py-3">
          <div className="daisy-stat-title text-sm font-medium text-foreground">Per day, typical</div>
          <div className={cn("daisy-stat-value", type.figure, "text-3xl")}>{money(Math.round(block.dailyTotal.typical), cur)}</div>
          <div className="daisy-stat-desc text-xs tabular-nums">Range {money(Math.round(block.dailyTotal.low), cur)}–{money(Math.round(block.dailyTotal.high), cur)}</div>
          {(typeof block.setBudget === "number" || block.tripNote) && (
            <div className="daisy-stat-actions mt-2 flex flex-col items-start gap-1.5">
              {typeof block.setBudget === "number" && (
                <Badge tone={under ? "positive" : "caution"} icon={under ? Check : undefined}>
                  {under ? "Fits your" : "Over your"} {money(Math.round(block.setBudget), cur)}/day budget
                </Badge>
              )}
              {block.tripNote && <p className={type.meta}>{block.tripNote}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ItineraryBlockData = Extract<AssistantBlock, { type: "itinerary" }>;

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function ItineraryBlockView({ block, tripId, onOpenPlace, onOpenPanel, replyText }: { block: ItineraryBlockData; tripId: string; replyText?: string } & Pick<BlockHandlers, "onOpenPlace" | "onOpenPanel">) {
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<"idle" | "adding" | "added">("idle");
  const multi = block.days.length > 1;
  const day = block.days[Math.min(active, block.days.length - 1)];
  const totalStops = block.days.reduce((n, d) => n + d.stops.length, 0);
  // The reply above already says this sentence; repeating it inside the card is noise.
  const introIsRepeat = Boolean(block.intro && replyText && normalize(replyText).includes(normalize(block.intro).slice(0, 60)));
  const title = itineraryTitle(block.title, block.days.length) ?? (multi ? undefined : day.label);

  async function addAll() {
    if (status !== "idle") return;
    setStatus("adding");
    let failures = 0;
    for (const [i, d] of block.days.entries()) failures += await addStopsToItinerary(tripId, dayIndexFromLabel(d.label, i + 1), d.stops);
    if (failures === totalStops) {
      setStatus("idle");
      notifyToast("Couldn’t add the plan to your itinerary. Try again.", "error");
    } else {
      setStatus("added");
      notifyToast(failures ? `Added the plan — ${failures} stop${failures === 1 ? "" : "s"} didn’t save.` : "Added the whole plan to your itinerary.", failures ? "info" : "success");
    }
  }

  return (
    <div className={cn(surface, "overflow-hidden")}>
      <BlockHeader
        icon={CalendarRange}
        title={title ?? "Plan"}
        actions={
          <>
          {onOpenPanel && pointsFromItinerary(block).length > 0 && <MapButton onClick={() => onOpenPanel({ kind: "map", title: `${title ?? "Plan"} on the map`, points: pointsFromItinerary(block) })} />}
          <button
            type="button"
            onClick={() => void addAll()}
            disabled={status !== "idle"}
            className={cn(controlSecondary, status === "added" && "border-positive/40 bg-positive-soft text-positive")}
          >
            {status === "adding" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : status === "added" ? <Check className="size-3.5" aria-hidden /> : <CalendarPlus className="size-3.5" aria-hidden />}
            {status === "added" ? "Added to itinerary" : "Add whole plan"}
          </button>
          </>
        }
      />
      {block.intro && !introIsRepeat && <p className={cn(type.body, "border-b border-border px-4 py-3 text-ink-soft")}>{block.intro}</p>}
      {multi && (
        <SlidingTabs
          label="Days"
          className="mx-4 mt-4 w-fit max-w-[calc(100%-2rem)] overflow-x-auto no-scrollbar daisy-tabs-sm"
          value={active}
          onChange={setActive}
          items={block.days.map((d, i) => ({ key: i, content: <span>{d.label}</span> }))}
        />
      )}
      <ContentSwap swapKey={String(active)}>
      <div role="tabpanel" className="space-y-3 p-4">
        {(day.subtitle || onOpenPanel) && (
          <div className="flex items-center justify-between gap-3">
            <p className={cn(type.meta, "min-w-0")}>{day.subtitle}</p>
            {onOpenPanel && (
              <button type="button" onClick={() => onOpenPanel({ kind: "day", block, dayIndex: Math.min(active, block.days.length - 1) })} className={cn(textAction, "shrink-0")}>
                Open {day.label} <ArrowUpRight className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        )}
        <PlanStops stops={day.stops} variant="card" onOpenPlace={onOpenPlace ? (stop) => onOpenPlace({ providerId: stop.placeId!, name: stop.title } as PlaceCard) : undefined} />
      </div>
      </ContentSwap>
    </div>
  );
}

type TripSummaryBlockData = Extract<AssistantBlock, { type: "trip_summary" }>;

/** The saved trip at a glance: the figures it is judged on, then the rest as label and value. */
function TripSummaryBlockView({ block }: { block: TripSummaryBlockData }) {
  const unset = (value: string) => (value === "Not set" ? <span className="font-normal text-muted-foreground">{value}</span> : value);
  return (
    <div className={cn(surface, "overflow-hidden")}>
      <BlockHeader icon={Luggage} title={block.title} />
      <FactStrip className="rounded-none border-0 bg-transparent shadow-none" facts={block.facts.map((fact) => ({ ...fact, value: unset(fact.label === "Dates" ? prettyDates(fact.value) : fact.value) }))} />
      {block.rows.length > 0 && (
        <dl className="divide-y divide-border border-t border-border px-4">
          {block.rows.map((row) => (
            <div key={row.label} className="flex min-h-11 items-center justify-between gap-4 py-2">
              <dt className={type.meta}>{row.label}</dt>
              <dd className={cn(type.body, "min-w-0 text-right font-medium", /^(not chosen yet|nothing planned yet)$/i.test(row.value) && "font-normal text-muted-foreground")}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

type TripUpdateBlockData = Extract<AssistantBlock, { type: "trip_update" }>;

const isDateField = (field: string, value: string | null) => field === "dates" || (value ? /\d{4}-\d{2}-\d{2}/.test(value) : false);
const showChange = (field: string, value: string | null) => (value === null || /^(|null|undecided|not set)$/i.test(value.trim()) ? "Not set" : isDateField(field, value) ? prettyDates(value) : value);

/** A visible receipt for a trip fact the assistant just changed on the user's explicit say-so.
 *  Applied immediately, never gated behind a confirm dialog — but shown plainly, with a one-tap
 *  Undo that re-sends the reverse statement through the same chat pipeline. */
function TripUpdateBlockView({ block, onFollowup }: { block: TripUpdateBlockData } & Pick<BlockHandlers, "onFollowup">) {
  return (
    <ul aria-label="Trip changes" className="flex flex-col gap-2">
      {block.changes.map((change, i) => {
        const from = showChange(change.field, change.from);
        const to = showChange(change.field, change.to);
        return (
          <li key={i} className="daisy-alert daisy-alert-soft block space-y-1 rounded-xl border-0 bg-muted px-3 py-2.5 text-sm">
            <div className="flex min-h-6 w-full items-center gap-2">
              <Check className="size-4 shrink-0 text-positive" aria-hidden />
              <span className="min-w-0 flex-1 font-medium">{change.label} updated</span>
              {change.undoPrompt && (
                <button type="button" onClick={() => onFollowup(change.undoPrompt!)} className={cn(textAction, "shrink-0")}>
                  Undo
                </button>
              )}
            </div>
            <p className="pl-6 leading-snug">
              {from !== "Not set" && (
                <>
                  <span className="text-muted-foreground line-through decoration-muted-foreground/50">{from}</span>
                  <ArrowRight className="mx-1.5 inline size-3.5 align-[-2px] text-muted-foreground" aria-label="to" />
                </>
              )}
              <span className="text-foreground">{to}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

type RouteSummaryBlockData = Extract<AssistantBlock, { type: "route_summary" }>;
type RouteGroupBlock = { type: "route_group"; from: string; to: string; routes: RouteSummaryBlockData[] };
type RenderBlock = AssistantBlock | RouteGroupBlock;

const ROUTE_MODE_LABEL: Record<string, string> = { driving: "Drive", walking: "Walk", transit: "Transit" };
const routeModeIcon = (mode: string) => (mode === "walking" ? PersonStanding : mode === "driving" ? Car : TrainFront);

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

/** "A → B" on one line when it fits; otherwise A, then "→ B" underneath, so the arrow never dangles alone. */
function RouteEnds({ from, to }: { from: string; to: string }) {
  const arrow = <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="to" />;
  if (from.length + to.length > 40) {
    return (
      <span className="block min-w-0">
        <span className="block break-words">{from}</span>
        <span className="flex items-start gap-1.5">
          <span className="flex h-[1.375em] items-center">{arrow}</span>
          <span className="min-w-0 break-words">{to}</span>
        </span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className="min-w-0 break-words">{from}</span>
      {arrow}
      <span className="min-w-0 break-words">{to}</span>
    </span>
  );
}

/** A route's length in time as one figure: "26 min", "1 h 05 min". */
function RouteTime({ seconds }: { seconds: number }) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? (
    <p className="shrink-0 text-right">
      <span className={type.figure}>{minutes}</span> <span className={type.meta}>min</span>
    </p>
  ) : (
    <p className="shrink-0 text-right">
      <span className={type.figure}>{Math.floor(minutes / 60)}</span> <span className={type.meta}>h</span> <span className={type.figure}>{String(minutes % 60).padStart(2, "0")}</span> <span className={type.meta}>min</span>
    </p>
  );
}

const leaves = (iso?: string) => (iso ? `leaves ${new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : null);

function RouteSummaryCard({ route, onOpenPanel }: { route: RouteSummaryBlockData } & Pick<BlockHandlers, "onOpenPanel">) {
  const distance = useDistance();
  const Icon = routeModeIcon(route.mode);
  const ends = splitRouteEnds(route.from, route.to);
  const stops: PlanStop[] = route.steps.map((step) => {
    const parsed = parseRouteStep(step);
    return { title: parsed.title, glyph: parsed.glyph, trailing: parsed.duration };
  });
  return (
    <div className={cn(surface, "overflow-hidden")}>
      <div className={cn("flex items-center gap-3 px-4 py-3", stops.length > 0 && "border-b border-border")}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-coral-soft text-coral-ink">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <h4 className={type.title}>
            <RouteEnds from={ends.from} to={ends.to} />
          </h4>
          <Meta className="tabular-nums" items={[ends.where, distance(route.distanceMeters / 1000), route.fare ? money(route.fare.amount, route.fare.currency) : null, leaves(route.departureTime)]} />
        </div>
        <RouteTime seconds={route.durationSeconds} />
      </div>
      {stops.length > 0 && (
        <div className="px-4 py-4">
          <PlanStops stops={stops} variant="card" />
        </div>
      )}
      {onOpenPanel && (
        <div className="border-t border-border px-4 py-3">
          <MapButton onClick={() => onOpenPanel({ kind: "route", routes: [route], active: 0 })}>{route.path ? "Steps and map" : "Steps"}</MapButton>
        </div>
      )}
    </div>
  );
}

/** 2+ modes between the same two places — one row each, fastest called out, sorted quickest first. */
function RouteComparisonCard({ from, to, routes, onOpenPanel }: { from: string; to: string; routes: RouteSummaryBlockData[] } & Pick<BlockHandlers, "onOpenPanel">) {
  const distance = useDistance();
  const sorted = [...routes].sort((a, b) => a.durationSeconds - b.durationSeconds);
  const fastest = sorted[0];
  const ends = splitRouteEnds(from, to);
  return (
    <div className={cn(surface, "divide-y divide-border overflow-hidden")}>
      <div className="space-y-0.5 px-4 py-3">
        <h4 className={type.title}>
          <RouteEnds from={ends.from} to={ends.to} />
        </h4>
        {ends.where && <p className={type.meta}>{ends.where}</p>}
      </div>
      {sorted.map((route, i) => {
        const Icon = routeModeIcon(route.mode);
        const row = (
          <>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-coral">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className={cn(type.body, "flex flex-wrap items-center gap-1.5 font-medium")}>
                {ROUTE_MODE_LABEL[route.mode] ?? route.mode}
                {route === fastest && <Badge tone="positive">Fastest</Badge>}
              </p>
              {route.mode === "transit" && route.steps.length > 0 && <p className={cn(type.meta, "truncate")}>{routeLines(route.steps)}</p>}
            </div>
            <p className="shrink-0 text-right">
              <span className={cn(type.body, type.num, "block")}>{Math.round(route.durationSeconds / 60)} min</span>
              <span className={cn(type.meta, "tabular-nums")}>
                {distance(route.distanceMeters / 1000)}{route.fare ? ` · ${money(route.fare.amount, route.fare.currency)}` : ""}
              </span>
            </p>
            {onOpenPanel && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          </>
        );
        return onOpenPanel ? (
          <button key={i} type="button" onClick={() => onOpenPanel({ kind: "route", routes: sorted, active: i })} aria-label={`${ROUTE_MODE_LABEL[route.mode] ?? route.mode}, ${Math.round(route.durationSeconds / 60)} minutes: steps and map`} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40">
            {row}
          </button>
        ) : (
          <div key={i} className="flex items-center gap-3 px-4 py-3">{row}</div>
        );
      })}
    </div>
  );
}

type EventsBlockData = Extract<AssistantBlock, { type: "events" }>;

function EventsBlockView({ block, tripId, preview, onOpenEvent, onOpenCollection }: { block: EventsBlockData; tripId: string; preview: boolean } & Pick<BlockHandlers, "onOpenEvent" | "onOpenCollection">) {
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
              <div key={`${group.base.title}-${groupIndex}`} className={cn(CARD_W, "shrink-0 snap-start")}>
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

type StaysBlockData = Extract<AssistantBlock, { type: "stays" }>;

function StaysBlockView({ block, preview, onOpenStay, onOpenCollection, onOpenPanel }: { block: StaysBlockData; preview: boolean } & Pick<BlockHandlers, "onOpenStay" | "onOpenCollection" | "onOpenPanel">) {
  const [view, setView] = useState<StayView>(DEFAULT_STAY_VIEW);
  const items = applyStayView(block.items, view);
  const filtersOn = view.refundable || view.breakfast || view.stars4;
  const { sorts, filters } = stayControls(block.items, view, setView);
  const dates = { checkin: block.checkin, checkout: block.checkout };
          const visible = preview ? items.slice(0, MAX_CHAT_CARDS) : items;
          return (
            <div className="flex flex-col gap-3">
              <SectionHeader
                title={preview ? `Stays in ${block.location}` : undefined}
                onSeeAll={preview && items.length > MAX_CHAT_CARDS && onOpenCollection ? () => onOpenCollection(`All stays in ${block.location}`, { ...block, items }) : undefined}
                onMap={preview && onOpenPanel && pointsFromStays(items).length > 0 ? () => onOpenPanel({ kind: "map", title: `Stays in ${block.location}`, points: pointsFromStays(items), connect: false }) : undefined}
              />
              <Meta items={[`${block.nights} night${block.nights > 1 ? "s" : ""}`, `${prettyDate(block.checkin)} – ${prettyDate(block.checkout)}`]} />
              {block.dateNote && <Notice tone="caution">{block.dateNote.replace(/\d{4}-\d{2}-\d{2}/g, (m) => prettyDate(m) ?? m)}</Notice>}
              <ViewControls
                bordered={false}
                label="stays"
                noun="stays"
                sorts={sorts}
                sort={view.sort}
                onSort={(id) => setView({ ...view, sort: id as StayView["sort"] })}
                filters={filters}
                shown={items.length}
                total={block.items.length}
                onClear={() => setView({ ...DEFAULT_STAY_VIEW, sort: view.sort })}
              />
              <HoldHeight frozen={filtersOn}>
              {items.length === 0 && <p className={cn(type.body, "py-6 text-center text-muted-foreground")}>No stays match those filters.</p>}
              <div className={preview ? rail : grid}>
                {visible.map((hotel, hotelIndex) => (
                  <div key={hotel.hotelId || `${hotel.name}-${hotelIndex}`} className={preview ? cn(CARD_W, "shrink-0 snap-start") : undefined}>
                    <StayCardView hotel={hotel} photoless={!block.items.some((h) => h.thumbnailUrl)} onOpen={onOpenStay && hotel.hotelId ? () => onOpenStay(hotel, dates) : undefined} />
                  </div>
                ))}
              </div>
              </HoldHeight>
              {block.rooms && block.rooms.length > 0 && (
                <div className={cn(surface, "overflow-hidden")}>
                  <h4 className={cn(type.title, "px-4 pt-4 pb-1")}>Rooms at {block.detailHotel}</h4>
                  <div className="overflow-x-auto scrollbar-slim">
                    <table className="daisy-table w-full text-sm">
                      <thead>
                        <tr>
                          <th scope="col">Room</th>
                          <th scope="col">Board</th>
                          <th scope="col" className="text-right">Per night</th>
                        </tr>
                      </thead>
                      <tbody>
                        {block.rooms.map((room, roomIndex) => (
                          <tr key={roomIndex}>
                            <th scope="row" className="font-medium">
                              {room.name}
                              {room.refundable ? <Badge tone="positive" className="ml-2">Refundable</Badge> : null}
                            </th>
                            <td className="text-muted-foreground">{room.boardName ?? "—"}</td>
                            <td className="text-right tabular-nums">{money(room.nightlyAmount, room.currency)}/night</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <Notice>Taxes and fees may be added at checkout — confirm the total when you book.</Notice>
            </div>
          );
}

type FlightsBlockData = Extract<AssistantBlock, { type: "flights" }>;

function FlightsBlockView({ block, onOpenPanel }: { block: FlightsBlockData } & Pick<BlockHandlers, "onOpenPanel">) {
  const [view, setView] = useState<FlightView>(DEFAULT_FLIGHT_VIEW);
  const offers = applyFlightView(block.items, view);
  const filtersOn = view.nonstop || view.changes || view.airport !== null;
  return (
    <div className={cn(surface, "overflow-hidden")}>
      <BlockHeader
        icon={Plane}
        title={<>{block.origin} <ArrowRight className="size-3.5 text-muted-foreground" aria-label="to" /> {block.destination}</>}
        meta={block.dateNote ? block.dateNote.replace(/\d{4}-\d{2}-\d{2}/g, (m) => prettyDate(m) ?? m) : undefined}
      />
      <FlightControls items={block.items} view={view} onChange={setView} shown={offers.length} />
      <ScrollWindow label="Flights" frozen={filtersOn} resetKey={JSON.stringify(view)}>
      {offers.length === 0 && (
        <div className="space-y-2 px-4 py-6 text-center">
          <p className={type.body}>No flights match those filters.</p>
          <button type="button" onClick={() => setView({ ...DEFAULT_FLIGHT_VIEW, sort: view.sort })} className={controlSecondary}>Clear filters</button>
        </div>
      )}
      <ul className="divide-y divide-border">
        {offers.map((offer, offerIndex) => {
          const dayOffset = arrivalDayOffset(offer.departAt, offer.arriveAt);
          return (
            <motion.li layout="position" transition={motionTokens.standard} key={offerIndex} className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1.5 px-4 py-3">
              <div className="min-w-0 space-y-1">
                <p className={cn(type.body, "font-medium")}>{offer.airline}</p>
                <p className={cn(type.body, "tabular-nums")}>
                  {clock(offer.departAt)} <span className="text-muted-foreground">–</span> {clock(offer.arriveAt)}
                  {dayOffset > 0 && <sup className="ml-0.5 text-xs text-muted-foreground">+{dayOffset}</sup>}
                </p>
                <Meta
                  items={[
                    offer.originAirport && offer.destinationAirport ? `${offer.originAirport}–${offer.destinationAirport}` : null,
                    `${Math.floor(offer.durationMinutes / 60)}h ${offer.durationMinutes % 60}m`,
                    offer.stops === 0 ? "nonstop" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}${offer.layoverAirports?.length ? ` via ${offer.layoverAirports.join(", ")}` : ""}`,
                    offer.cabinClass,
                    offer.baggage,
                  ]}
                />
                {(offer.fareConditions?.length || offer.aircraft) && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {offer.fareConditions?.slice(0, 2).map((c) => <Badge key={c}>{c}</Badge>)}
                    {offer.aircraft && <Badge>{offer.aircraft}</Badge>}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <p className={cn(type.title, "tabular-nums whitespace-nowrap")}>{money(offer.price, offer.currency)}</p>
                {onOpenPanel && (
                  <DetailsButton label={`Details: ${offer.airline}, ${clock(offer.departAt)} to ${clock(offer.arriveAt)}`} onClick={() => onOpenPanel({ kind: "flight", flight: offer, route: { origin: block.origin, destination: block.destination, dateNote: block.dateNote, retrievedAt: block.retrievedAt, offers: block.items } })} />
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
      </ScrollWindow>
      <div className="border-t border-border px-4 py-3">
        <Notice>Fares change quickly — check the airline or a travel site before booking.</Notice>
      </div>
    </div>
  );
}

export function MessageBlocks({ blocks, tripId, onFollowup, onOpenPlace, onOpenStay, onOpenEvent, onOpenCollection, onOpenPanel, preview = true, replyText, live = false }: { blocks: AssistantBlock[]; preview?: boolean; replyText?: string; /** A reply that just arrived: its blocks rise in one after another. Restored history stays still. */ live?: boolean } & BlockHandlers) {
  return (
    <div className="roam-blocks mt-4 flex flex-col gap-4 [overflow-wrap:anywhere]">
      {groupRouteSummaries(blocks).map((block, index, all) => {
        // A key from the block's kind and its place among blocks of that kind, not its raw position: filtering or reordering blocks no longer remounts the rest.
        const occurrence = all.slice(0, index).filter((other) => other.type === block.type).length;
        const node = ((): React.ReactNode => {
        if (block.type === "trip_update") {
          return <div key={index}><TripUpdateBlockView block={block} onFollowup={onFollowup} /></div>;
        }

        if (block.type === "place_list") {
          const visible = preview ? block.places.slice(0, MAX_CHAT_CARDS) : block.places;
          const title = cleanSectionTitle(block.title) ?? (preview ? "Places" : undefined);
          return (
            <div key={index} className="flex min-w-0 flex-col gap-3">
              <SectionHeader
                title={preview ? title : undefined}
                onSeeAll={preview && block.places.length > MAX_CHAT_CARDS && onOpenCollection ? () => onOpenCollection(title ?? "All places", block) : undefined}
                onMap={preview && onOpenPanel && pointsFromPlaces(block.places).length > 0 ? () => onOpenPanel({ kind: "map", title: title ? `${title} on the map` : "Places on the map", points: pointsFromPlaces(block.places), connect: false }) : undefined}
              />
              <div className={preview ? rail : grid}>
                {visible.map((place) => (
                  <div key={place.providerId} className={preview ? cn(CARD_W, "shrink-0 snap-start") : undefined}>
                    <PlaceCardView place={place} tripId={tripId} onOpenPlace={onOpenPlace} photoless={!block.places.some((p) => p.photoUrl)} />
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
              <div key={index} className={cn(surface, "space-y-3 p-4")}>
                <h3 className={type.title}>{block.title}</h3>
                {block.bestForYou && (
                  <p className={cn(type.body, "text-positive")}>
                    <strong className="font-semibold">{block.bestForYou.label}</strong> — {block.bestForYou.reason}
                  </p>
                )}
                <CompareView tripId={tripId} ids={block.placeIds} />
              </div>
            );
          }
          return <div key={index}><ComparisonBlockView block={block} /></div>;
        }

        if (block.type === "actions") {
          return (
            <div key={index} className="flex flex-wrap gap-2">
              {block.items.map((item, chipIndex) => (
                <Enter key={item.label} live={live} index={index + chipIndex + 1} y={6}>
                  <button type="button" onClick={() => onFollowup(item.prompt)} className="btn-chip">
                    {item.label}
                  </button>
                </Enter>
              ))}
            </div>
          );
        }

        if (block.type === "route_group") {
          return (
            <div key={index}>
              {block.routes.length === 1 ? (
                <RouteSummaryCard route={block.routes[0]} onOpenPanel={onOpenPanel} />
              ) : (
                <RouteComparisonCard from={block.from} to={block.to} routes={block.routes} onOpenPanel={onOpenPanel} />
              )}
            </div>
          );
        }

        if (block.type === "clarifying_question") {
          // The question itself streams as the reply text; only the answer chips are structured.
          if (block.chips.length === 0) return null;
          return (
            <div key={index} className="flex flex-wrap gap-2">
              {block.chips.map((chip, chipIndex) => (
                <Enter key={chip} live={live} index={index + chipIndex + 1} y={6}>
                  <button type="button" onClick={() => onFollowup(chip)} className="btn-chip">
                    {chip}
                  </button>
                </Enter>
              ))}
            </div>
          );
        }

        if (block.type === "events") {
          return <EventsBlockView key={index} block={block} tripId={tripId} preview={preview} onOpenEvent={onOpenEvent} onOpenCollection={onOpenCollection} />;
        }

        if (block.type === "flights") {
          return <div key={index}><FlightsBlockView block={block} onOpenPanel={onOpenPanel} /></div>;
        }

        if (block.type === "stays") {
          return <StaysBlockView key={index} block={block} preview={preview} onOpenStay={onOpenStay} onOpenCollection={onOpenCollection} onOpenPanel={onOpenPanel} />;
        }

        if (block.type === "weather") {
          return <div key={index}><WeatherBlockView block={block} /></div>;
        }

        if (block.type === "itinerary") {
          return <div key={index}><ItineraryBlockView block={block} tripId={tripId} onOpenPlace={onOpenPlace} onOpenPanel={onOpenPanel} replyText={replyText} /></div>;
        }

        if (block.type === "budget") {
          return <div key={index}><BudgetBlockView block={block} onOpenPanel={onOpenPanel} /></div>;
        }

        if (block.type === "options") {
          return <div key={index}><OptionsBlockView block={block} onFollowup={onFollowup} /></div>;
        }

        if (block.type === "structured_answer") {
          return <div key={index}><StructuredAnswerBlockView block={block} /></div>;
        }

        if (block.type === "empty_result") {
          return (
            <div key={index} className={cn(surface, "flex items-start gap-3 border-dashed p-4")}>
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><SearchX className="size-[18px]" aria-hidden /></span>
              <div className="min-w-0 space-y-0.5">
                <p className={cn(type.body, "font-medium")}>Nothing found for {block.what}</p>
                <p className={type.meta}>{block.hint}</p>
              </div>
            </div>
          );
        }

        if (block.type === "trip_summary") {
          return <div key={index}><TripSummaryBlockView block={block} /></div>;
        }

        if (block.type === "checklist") {
          return <div key={index}><ChecklistBlock groups={block.groups} tripId={tripId} /></div>;
        }

        return null;
        })();
        return node ? <Enter key={`${block.type}-${occurrence}`} live={live} index={index}>{node}</Enter> : null;
      })}
    </div>
  );
}
