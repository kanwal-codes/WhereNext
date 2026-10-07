"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useDistance } from "@/lib/use-distance";
import { formatDuration } from "@/lib/format-duration";
import {
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
  Info,
  Pencil,
  PersonStanding,
  Loader2,
  MapPin,
  Shirt,
  Snowflake,
  Star,
  Sun,
  TrainFront,
  Umbrella,
  Undo2,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import type { AssistantBlock, PlaceCard, StayCardItem, TrustLabel } from "@/packages/contracts/assistant";
import type { Place } from "@/packages/contracts/place";
import type { EventSeed } from "@/components/TripPanelProvider";
import { AddToTripControl } from "@/features/trip/ui/AddToTripControl";
import { EventCard, type NearbyEvent } from "@/components/EventCard";
import { CompareView } from "@/components/CompareView";
import { BlurImage } from "@/components/motion-primitives";
import { cn, safeHref } from "@/lib/utils";
import { notifyToast } from "@/lib/application/toast";
import { formatClockTime } from "@/lib/application/clock-time";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { addStopsToItinerary, dayIndexFromLabel, itineraryTitle } from "@/features/conversation/application/addPlanToItinerary";
import { categoryLabel, eventDayParts, photoProxyUrl, priceLabel } from "@/lib/places-ui";
import { CINE_ORB, CINE_ORB_WHITE, CINE_PILL_ACTION, CineAddress, CineCard, CineDate, CinePill, CineRating, PlaceFloatingPills } from "./CineCard";
import { RouteMap, type RouteMapRequest } from "./RouteMap";
import { MODE_COLOR } from "@/lib/application/mode-visuals";
import { HandoffContext, LiveReplyContext, RoamIcon } from "@/features/roam/ui/RoamIcon";
import { FlightHero, FlightJourney, FlightPicks, FlightPicksSkeleton, FlightRowBody, offerKey, pickFares } from "./FlightWidget";
import { RowBar, RowValue, Widget, WidgetAction, WidgetFigure, WidgetFoot, WidgetHero, WidgetPill, WidgetRow, WidgetRows } from "./Widget";
import { portableProxyPhotoUrl } from "../portable-photo-url";
import type { CardPanel } from "@/components/TripPanelProvider";
import { PlanStops } from "./PlanStops";
import { FactStrip } from "@/components/DetailKit";
import { AnimatePresence, motion } from "motion/react";
import { ContentSwap, Enter, motionTokens } from "@/components/motion-primitives";
import { ChecklistBlock } from "./ChecklistBlock";
import { parseRouteStep, routeLines, splitRouteEnds } from "./routeText";
import { pointsFromItinerary, pointsFromPlaces, pointsFromStays } from "./mapPoints";
import { DEFAULT_FLIGHT_VIEW, FlightControls, applyFlightView, type FlightView } from "./FlightFilters";
import { FlightRowsSkeleton, FlightSearchBar, PriceInsight, useFlightSearch } from "./FlightSearch";
import { shiftIso } from "./SearchBarParts";
import { StayCardsSkeleton, StaySearchBar, useStaySearch } from "./StaySearch";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { resolveCurrency } from "@/lib/currency";
import { HoldHeight, ScrollX, ViewControls } from "./ListControls";
import { DEFAULT_EVENT_VIEW, DEFAULT_STAY_VIEW, applyEventView, applyStayView, eventControls, stayControls, type EventView, type StayView } from "./listViews";
import { factGlyph, placeGlyph } from "./glyphs";
import { Badge, segmentTab, CARD_W, CardOpenOverlay, Meta, Notice, SectionHeader, SeeAllButton, compactCount, controlSecondary, grid, money, prettyDate, prettyDates, rail, surface, textAction, type, MapButton } from "./ui";

export type BlockHandlers = {
  /** The trip these blocks belong to — card actions write against it. */
  tripId: string;
  onFollowup: (prompt: string) => void;
  /** When set, the card head opens this place in the chat side-panel. */
  onOpenPlace?: (place: PlaceCard) => void;
  /** When set, a stay card opens the hotel (rooms + details) in the chat side-panel. */
  onOpenStay?: (stay: StayCardItem, dates: { checkin: string; checkout: string; adults?: number }) => void;
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
}: { place: PlaceCard; tripId: string } & Pick<BlockHandlers, "onOpenPlace">) {
  const category = place.category ? categoryLabel(place.category) : undefined;
  return (
    <CineCard
      label={`Open ${place.name}`}
      onOpen={onOpenPlace ? () => onOpenPlace(place) : undefined}
      src={portableProxyPhotoUrl(place.photoUrl)}
      alt={place.name}
      glyph={placeGlyph(place.category, place.name).icon}
      topLeft={typeof place.rating === "number" ? <CineRating rating={place.rating} count={place.userRatingCount ? compactCount(place.userRatingCount) : undefined} /> : category ? <CinePill>{category}</CinePill> : undefined}
      // "From the web" is the default for every card: only a non-default trust label carries information.
      topRight={<PlaceFloatingPills place={place} extra={place.trust !== "sourced" ? <CinePill>{TRUST_LABEL[place.trust] ?? place.trust}</CinePill> : undefined} />}
      eyebrow={category}
      title={place.name}
      pills={place.distanceToLocked ? <CinePill icon={MapPin}>{place.distanceToLocked}</CinePill> : undefined}
      why={place.reviewSummary}
      foot={place.address ? <CineAddress address={place.address} /> : undefined}
      // One control: shortlist (still deciding) → a day (going in the plan) → remove.
      action={<AddToTripControl tripId={tripId} place={toPlace(place)} variant="orb" />}
    />
  );
}

const MORE_STEP = 6;

/**
 * "Show more" under a list of places in the side panel: asks the same place search Discover uses for more of the same
 * kind near the trip (up to 60 come back at once), drops what is already shown, and reveals them six at a time.
 */
function MorePlaces({ block, tripId, onOpenPlace }: { block: Extract<AssistantBlock, { type: "place_list" }>; tripId: string } & Pick<BlockHandlers, "onOpenPlace">) {
  const { guest, openGate } = useGuest();
  const destination = useTripDataMaybe()?.data?.trip?.destination ?? "";
  const [found, setFound] = useState<PlaceCard[] | null>(null);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const here = new Set(block.places.map((place) => place.providerId));
  const fresh = (found ?? []).filter((place) => !here.has(place.providerId));
  const label = cleanSectionTitle(block.title) ?? `${categoryLabel(block.places[0]?.category)}s`;
  const city = destination.split(",")[0]?.trim() ?? "";
  const query = !city || label.toLowerCase().includes(city.toLowerCase()) ? label : `${label} in ${city}`;

  async function more() {
    if (guest) return openGate("see more places");
    if (found) return setShown((count) => count + MORE_STEP);
    setBusy(true);
    setFailed(false);
    try {
      const lat = block.places.reduce((sum, place) => sum + place.latitude, 0) / Math.max(1, block.places.length);
      const lng = block.places.reduce((sum, place) => sum + place.longitude, 0) / Math.max(1, block.places.length);
      const response = await fetch(`/api/trips/${tripId}/places?query=${encodeURIComponent(query)}&lat=${lat}&lng=${lng}`);
      if (!response.ok) throw new Error("search");
      const body = (await response.json()) as { places?: Place[] };
      setFound((body.places ?? []).map((place) => ({ ...place, trust: "sourced" as const, photoUrl: photoProxyUrl(tripId, place.photoNames?.[0], 640) })));
      setShown(MORE_STEP);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const visible = fresh.slice(0, shown);
  const left = fresh.length - visible.length;
  return (
    <>
      {visible.length > 0 && (
        <div className={grid}>
          {visible.map((place) => (
            <div key={place.providerId}>
              <PlaceCardView place={place} tripId={tripId} onOpenPlace={onOpenPlace} />
            </div>
          ))}
        </div>
      )}
      {(!found || left > 0) && (
        <div className="flex justify-center pt-1">
          <button type="button" onClick={() => void more()} disabled={busy} className={cn(controlSecondary, "h-11 px-6")}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {found ? `Show ${Math.min(MORE_STEP, left)} more` : "Show more places"}
          </button>
        </div>
      )}
      {failed && <p className="text-center text-sm text-muted-foreground">Couldn’t find more just now. Try again in a moment.</p>}
      {found && fresh.length === 0 && <p className="text-center text-sm text-muted-foreground">That’s everything Roam found near here.</p>}
    </>
  );
}

function StayCardView({ hotel, onOpen }: { hotel: StayCardItem; onOpen?: () => void }) {
  const priced = Number(hotel.nightlyPrice) > 0;
  return (
    <CineCard
      label={`Open ${hotel.name}`}
      onOpen={onOpen}
      src={hotel.thumbnailUrl}
      alt={hotel.name}
      glyph={BedDouble}
      topLeft={typeof hotel.rating === "number" ? <CineRating rating={hotel.rating} outOf="/10" count={hotel.reviews ? compactCount(hotel.reviews) : undefined} /> : undefined}
      // A hotel's star class is not a guest rating: it reads "4-star", never a bare ★ 4 next to a place's ★ 4.3.
      eyebrow={typeof hotel.stars === "number" ? `${hotel.stars}-star` : "Stay"}
      title={hotel.name}
      pills={
        hotel.board || hotel.refundable || hotel.distanceToLocked ? (
          <>
            {hotel.refundable && <CinePill tone="positive" icon={Check}>Refundable</CinePill>}
            {hotel.distanceToLocked && <CinePill icon={MapPin}>{hotel.distanceToLocked}</CinePill>}
            {hotel.board && <CinePill>{hotel.board}</CinePill>}
          </>
        ) : undefined
      }
      foot={priced ? (
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-display text-[1.75rem] leading-none font-medium tracking-[-0.025em] tabular-nums">{money(hotel.nightlyPrice, hotel.currency)}</span>
          <span className="text-[0.8125rem] text-white/70">/ night</span>
          <span className="w-full pt-0.5 text-xs text-white/60 tabular-nums">{money(hotel.totalPrice, hotel.currency)} total</span>
        </p>
      ) : (
        <p className="text-[0.8125rem] text-white/70">Price unavailable for these dates</p>
      )}
      action={onOpen && priced ? (
        <button type="button" onClick={onOpen} aria-label={`Rooms & details: ${hotel.name}`} className={cn(CINE_ORB, CINE_ORB_WHITE)}>
          <ArrowUpRight className="size-5" aria-hidden />
        </button>
      ) : undefined}
    />
  );
}

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
        <a href={safeHref(active.url)} target="_blank" rel="noreferrer noopener" aria-label={`Tickets: ${event.title}`} className={CINE_PILL_ACTION}>
          Tickets <ArrowUpRight className="size-4" aria-hidden />
        </a>
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

/** The highs and lows as two quiet curves across the forecast days, in the hero. */
function TempCurve({ days }: { days: WeatherBlockData["days"] }) {
  const list = days.slice(0, 7);
  // Two points are not a trend: the curve needs at least three days.
  if (list.length < 3) return null;
  const w = 560, h = 72;
  const lo = Math.min(...list.map((d) => d.min)) - 2, hi = Math.max(...list.map((d) => d.max)) + 2;
  const x = (i: number) => 14 + (i * (w - 28)) / (list.length - 1);
  const y = (v: number) => h - 8 - ((v - lo) / (hi - lo || 1)) * (h - 16);
  const line = (key: "max" | "min") => list.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(0)} ${y(d[key]).toFixed(0)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-[4.5rem] w-full" role="img" aria-label="Highs and lows across the week">
      <path d={line("max")} fill="none" stroke="var(--coral)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={line("min")} fill="none" stroke="var(--lagoon)" strokeOpacity="0.7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {list.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.max)} r="3.6" fill="var(--coral)" />
          <circle cx={x(i)} cy={y(d.min)} r="3.2" fill="var(--lagoon)" fillOpacity="0.8" />
        </g>
      ))}
    </svg>
  );
}

function PackRow({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-4 @[34rem]:px-[1.125rem]">
      <span className="eyebrow mr-1">Pack</span>
      {items.map((item) => (
        <Badge key={item} icon={packIcon(item)}>{item}</Badge>
      ))}
    </div>
  );
}

function WeatherBlockView({ block }: { block: WeatherBlockData }) {
  if (block.mode === "forecast" && block.days.length > 0) {
    const days = block.days.slice(0, 7);
    const dry = days.filter((d) => !d.wet).map((d) => d.label);
    const wet = days.filter((d) => d.wet).length;
    const Icon = WX_ICON[days[0]?.condition ?? "mixed"];
    return (
      <Widget
        glyph="weather"
        tone="lagoon"
        eyebrow={`Forecast${block.location ? ` · ${block.location}` : ""}`}
        title={block.headline}
        status={wet > 0 ? <WidgetPill tone="lagoon" icon={Droplets}>{wet} wet day{wet === 1 ? "" : "s"}</WidgetPill> : <WidgetPill tone="sage" icon={Check}>All dry</WidgetPill>}
        hero={
          <WidgetHero tone="lagoon" className="relative overflow-hidden pb-2">
            <Icon className="absolute top-3 right-4 size-16 text-caution/80 @max-[34rem]:hidden" strokeWidth={1.2} aria-hidden />
            <WidgetFigure unit={days[0]?.label ? `high ${days[0].label.toLowerCase() === "today" ? "today" : `on ${days[0].label}`}` : undefined}>{degrees(days[0]?.max ?? 0)}</WidgetFigure>
            <TempCurve days={days} />
          </WidgetHero>
        }
        foot={dry.length > 0 && wet > 0 ? <>Driest days: {dry.slice(0, 4).join(", ")}</> : <>Forecast for the next {days.length} days</>}
      >
        <ul className="no-scrollbar grid gap-1 overflow-x-auto px-3 pt-3.5" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(${days.length > 6 ? "3.5rem" : "0px"}, 1fr))` }}>
          {days.map((day, i) => (
            <li key={i} className="flex min-w-0 flex-col items-center gap-1 px-0.5 py-1.5 text-center">
              <span className={cn(type.meta, "font-semibold text-ink-soft")}>{day.label}</span>
              <WeatherGlyph condition={day.condition} className={cn("size-6", day.wet ? "text-lagoon" : "text-caution")} />
              <span className="font-display text-base leading-tight font-medium tabular-nums">{degrees(day.max)}</span>
              <span className={cn(type.meta, "tabular-nums")}>{degrees(day.min)}</span>
              <span className="mt-1 grid h-4 place-items-center">{day.wet ? <Droplets className="size-4 text-lagoon" aria-label="Rain expected" /> : null}</span>
            </li>
          ))}
        </ul>
        <PackRow items={block.packing} />
      </Widget>
    );
  }

  const rainy = typeof block.rainyDays === "number" ? Math.max(0, Math.min(31, Math.round(block.rainyDays))) : 0;
  return (
    <Widget
      glyph="weather"
      tone="lagoon"
      eyebrow={block.mode === "forecast" ? `Forecast not ready${block.location ? ` · ${block.location}` : ""}` : `Typical ${block.month ?? "weather"}${block.location ? ` · ${block.location}` : ""}`}
      title={block.headline}
      status={block.estimated ? <WidgetPill>Estimated</WidgetPill> : undefined}
      hero={
        (typeof block.highC === "number" || typeof block.lowC === "number" || rainy > 0) ? (
          <WidgetHero tone="lagoon" className="flex flex-wrap items-center gap-x-8 gap-y-4">
            {(typeof block.highC === "number" || typeof block.lowC === "number") && (
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  {typeof block.highC === "number" && <span className="font-display text-[3.5rem] leading-none font-medium tracking-[-0.04em] tabular-nums">{degrees(block.highC)}</span>}
                  {typeof block.lowC === "number" && <span className="text-base text-ink-soft tabular-nums">/ {degrees(block.lowC)}</span>}
                </p>
                <p className={cn(type.meta, "mt-1")}>typical high and low</p>
              </div>
            )}
            {rainy > 0 && (
              <div className="min-w-[11rem] max-w-[15rem] flex-1">
                <p className="eyebrow mb-2">Rainy days</p>
                <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1" role="img" aria-label={`About ${rainy} rainy days that month`}>
                  {Array.from({ length: 30 }, (_, i) => (
                    <span key={i} className={cn("aspect-square rounded-full", i < rainy ? "bg-lagoon" : "bg-lagoon/20")} />
                  ))}
                </div>
                <p className={cn(type.meta, "mt-2")}>about {rainy} rainy day{rainy === 1 ? "" : "s"} that month</p>
              </div>
            )}
          </WidgetHero>
        ) : undefined
      }
      foot={block.mode === "forecast" ? "No forecast yet, so this is the typical month. A real forecast arrives about a week before the trip." : "Typical values from past years, not a forecast"}
    >
      <PackRow items={block.packing} />
    </Widget>
  );
}

type ComparisonBlockData = Extract<AssistantBlock, { type: "comparison" }>;

/** Attribute rows × option columns. The redundant "Option" column is dropped — the header row names each option once. */
function ComparisonBlockView({ block }: { block: ComparisonBlockData }) {
  const attrs = block.columns.slice(1);
  const best = block.bestForYou;
  const [all, setAll] = useState(false);
  // Three options show side by side; the rest are one tap away. Attribute names stay in a fixed first column.
  const rows = all || block.rows.length <= 4 ? block.rows : block.rows.slice(0, 3);
  return (
    <Widget
      glyph="compare"
      tone="lagoon"
      eyebrow="Compare"
      title={block.title}
      status={best ? <WidgetPill tone="sage" icon={Check}>{best.label} fits you</WidgetPill> : undefined}
      foot={best ? <span><strong className="font-semibold text-positive">{best.label}</strong> — {best.reason}</span> : `${block.rows.length} options compared`}
    >
      <div className="mt-3.5 border-t border-border">
        <ScrollX label={`${block.title}, scroll sideways for more`}>
          <table className="daisy-table daisy-table-zebra daisy-table-pin-cols w-full text-sm">
            <thead>
              <tr className="text-foreground">
                <th scope="col" className="w-28 bg-card" />
                {rows.map((row) => (
                  <th key={row.label} scope="col" className={cn("static min-w-32 font-display text-base font-medium", best?.label === row.label && "text-positive")}>{row.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attrs.map((attr, attrIndex) => (
                <tr key={attr}>
                  <th scope="row" className="text-xs font-medium text-muted-foreground">{attr}</th>
                  {rows.map((row) => (
                    <td key={row.label} className="align-top leading-snug">{row.cells[attrIndex + 1] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
        {rows.length < block.rows.length && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 @[34rem]:px-[1.125rem]">
            <span className={type.meta}>{block.rows.length - rows.length} more options hidden</span>
            <button type="button" onClick={() => setAll(true)} className={controlSecondary}>Show all <ChevronDown className="size-3.5" aria-hidden /></button>
          </div>
        )}
      </div>
    </Widget>
  );
}

type StructuredAnswerBlockData = Extract<AssistantBlock, { type: "structured_answer" }>;

/** Sections in one card — a section of short figures becomes tiles, a longer list of figures a price list. */
function StructuredAnswerBlockView({ block }: { block: StructuredAnswerBlockData }) {
  const first = block.sections[0];
  // A long answer keeps its first two sections open; the others are headings that open on a tap.
  const [openSet, setOpenSet] = useState<Set<number>>(new Set());
  const folds = block.sections.length > 3;
  return (
    <Widget glyph="star" tone="lagoon" eyebrow="Good to know" title={block.sections.length === 1 && first ? first.heading : "Quick answer"} foot={undefined}>
      <div className="mt-1 divide-y divide-border">
        {block.sections.map((section, i) => {
          const figures = section.bullets.some((bullet) => bullet.detail);
          // Icons only when the section is practical facts (a plug, a tip, an emergency number); a plain price list stays plain.
          const icons = figures && section.bullets.some((bullet) => factGlyph(`${bullet.text} ${bullet.detail ?? ""}`));
          const tiles = figures && !icons && section.bullets.length <= 4 && section.bullets.every((bullet) => (bullet.detail ?? "").length <= 14);
          return (
            folds && i >= 2 && !openSet.has(i) ? (
              <button key={i} type="button" aria-expanded={false} onClick={() => setOpenSet((cur) => new Set(cur).add(i))} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left @[34rem]:px-[1.125rem]">
                <span className={type.title}>{section.heading}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ) : (
            <section key={i} className="space-y-2 px-4 py-4 @[34rem]:px-[1.125rem]">
              {(block.sections.length > 1 || i > 0) && <h3 className={type.title}>{section.heading}</h3>}
              {tiles ? (
                <dl className="grid grid-cols-2 gap-2.5 pt-1">
                  {section.bullets.map((bullet, j) => (
                    <div key={j} className="rounded-2xl bg-lagoon-soft px-3.5 py-3">
                      <dt className="eyebrow">{bullet.text}</dt>
                      <dd className="mt-1 font-display text-[1.625rem] leading-none font-medium tracking-[-0.025em] tabular-nums">{bullet.detail}</dd>
                    </div>
                  ))}
                </dl>
              ) : figures ? (
                <dl className="divide-y divide-border/60">
                  {section.bullets.map((bullet, j) => {
                    const glyph = icons ? factGlyph(`${bullet.text} ${bullet.detail ?? ""}`) : null;
                    const Icon = glyph?.icon ?? Info;
                    return (
                      <div key={j} className="flex items-start gap-3 py-2">
                        {icons && (
                          <span aria-hidden className="mt-px grid size-8 shrink-0 place-items-center rounded-xl bg-lagoon-soft text-lagoon">
                            <Icon className="size-4" />
                          </span>
                        )}
                        <dt className={cn(type.body, "min-w-0 flex-1 pt-1 text-ink-soft")}>{bullet.text}</dt>
                        <dd className={cn(type.body, type.num, "max-w-[55%] shrink-0 pt-1 text-right")}>{bullet.detail}</dd>
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
            )
          );
        })}
      </div>
    </Widget>
  );
}

type OptionsBlockData = Extract<AssistantBlock, { type: "options" }>;

function OptionsBlockView({ block, onFollowup }: { block: OptionsBlockData } & Pick<BlockHandlers, "onFollowup">) {
  const Icon = block.kind === "area" ? MapPin : Compass;
  const [showAll, setShowAll] = useState(false);
  // Three show; the rest are one tap away, so the card never grows without limit.
  const items = showAll || block.items.length <= 4 ? block.items : block.items.slice(0, 3);
  // Each option leads somewhere: the two next things a traveller asks about an area or a day trip.
  const actions = (name: string): Array<[label: string, prompt: string]> =>
    block.kind === "area"
      ? [["Stays here", `Show me places to stay in ${name}.`], ["What to do", `What is there to do in and around ${name}, and is it a good base for us?`]]
      : [["How to get there", `How do I get to ${name} for a day trip, and how long does it take each way?`], ["Plan the day", `Plan a day trip to ${name}: what to see, in what order, and when to head back.`]];
  return (
    <Widget
      glyph="place"
      tone="coral"
      eyebrow={block.kind === "area" ? "Areas" : "Day trips"}
      title={block.kind === "area" ? "Where to base yourselves" : "Day trips worth the journey"}
      status={<WidgetPill>{block.items.length} {block.kind === "area" ? "area" : "trip"}{block.items.length === 1 ? "" : "s"}</WidgetPill>}
      foot={block.estimated ? "Estimated from general knowledge, not backed by a current source" : undefined}
    >
      <div className="mt-3.5 divide-y divide-border border-t border-border">
        {items.map((item) => (
          <article key={item.name} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-4 @[34rem]:px-[1.125rem]">
            <span className="grid size-[4.5rem] shrink-0 place-items-center rounded-2xl bg-coral-soft text-coral-ink" aria-hidden>
              <Icon className="size-7" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1 basis-48 space-y-1">
              <h4 className="line-clamp-2 font-display text-[1.0625rem] leading-snug font-medium">{item.name}</h4>
              <Meta items={[item.meta]} />
              <p className={cn(type.body, "line-clamp-3 text-ink-soft")}>{item.blurb}</p>
              {(item.tags.length > 0 || item.bestFor) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {item.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
                  {item.bestFor && <Badge tone="positive" icon={Check}>Best for {item.bestFor}</Badge>}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2 @max-[34rem]:w-full @[34rem]:w-36 @[34rem]:flex-col">
              {actions(item.name).map(([label, prompt]) => (
                <button key={label} type="button" className={cn(controlSecondary, "h-9 flex-1 justify-between px-3.5 @[34rem]:flex-none")} onClick={() => onFollowup(prompt)}>
                  {label} <ArrowRight className="size-3.5" aria-hidden />
                </button>
              ))}
            </div>
          </article>
        ))}
        {items.length < block.items.length && (
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 @[34rem]:px-[1.125rem]">
            <span className={cn(type.meta, "min-w-0 truncate")}>{block.items.length - items.length} more · {block.items.slice(items.length).map((i) => i.name).join(", ")}</span>
            <button type="button" onClick={() => setShowAll(true)} className={controlSecondary}>Show {block.items.length - items.length} more <ChevronDown className="size-3.5" aria-hidden /></button>
          </div>
        )}
      </div>
    </Widget>
  );
}

type BudgetBlockData = Extract<AssistantBlock, { type: "budget" }>;

/** One colour per line, the same as the budget panel's ledger, so the card and its expanded form read as one thing. */
const BUDGET_COLOR = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)", "var(--color-muted-foreground)"] as const;

/** The day's spend as a ring: each category's share, with the total in the middle. */
function BudgetRing({ block }: { block: BudgetBlockData }) {
  const total = block.lines.reduce((sum, line) => sum + line.typical, 0) || 1;
  const r = 46, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="size-[8.25rem] shrink-0 @max-[34rem]:hidden" role="img" aria-label="Share of the day's spend by category">
      <circle cx="60" cy="60" r={r} fill="none" stroke="white" strokeOpacity="0.7" strokeWidth="14" />
      {block.lines.map((line, i) => {
        const len = (c * line.typical) / total;
        const seg = (
          <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={BUDGET_COLOR[Math.min(i, BUDGET_COLOR.length - 1)]} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${Math.max(0, len - 3)} ${c - Math.max(0, len - 3)}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
        );
        offset += len;
        return seg;
      })}
      <text x="60" y="58" textAnchor="middle" className="fill-foreground font-display text-[20px] font-medium">{compactMoney(block.dailyTotal.typical, block.currency)}</text>
      <text x="60" y="75" textAnchor="middle" className="fill-ink-soft text-[10px]">per day</text>
    </svg>
  );
}

function BudgetBlockView({ block, onOpenPanel }: { block: BudgetBlockData } & Pick<BlockHandlers, "onOpenPanel">) {
  const maxTypical = Math.max(...block.lines.map((line) => line.typical), 1);
  const hasBudget = typeof block.setBudget === "number";
  const under = hasBudget && block.dailyTotal.typical <= (block.setBudget as number);
  const cur = block.currency;
  const gap = hasBudget ? Math.abs(Math.round((block.setBudget as number) - block.dailyTotal.typical)) : 0;
  const scale = hasBudget ? Math.max(block.setBudget as number, block.dailyTotal.typical) * 1.05 : 1;
  return (
    <Widget
      glyph="budget"
      tone={hasBudget && !under ? "saffron" : "sage"}
      eyebrow={`Daily spend · ${block.perPerson ? "per person" : "for the group"}`}
      title={hasBudget ? (gap === 0 ? <>Right on your {money(Math.round(block.setBudget as number), cur)} a day</> : <>{under ? "Fits your" : "Over your"} {money(Math.round(block.setBudget as number), cur)} a day</>) : "Your typical day"}
      status={block.estimated ? <WidgetPill>Estimated</WidgetPill> : undefined}
      hero={
        <WidgetHero tone={hasBudget && !under ? "saffron" : "sage"} className="flex items-center gap-6">
          <div className="min-w-0 flex-1">
            <p className="eyebrow mb-1">Typical day</p>
            <WidgetFigure>{money(Math.round(block.dailyTotal.typical), cur)}</WidgetFigure>
            <p className={cn(type.meta, "mt-1 tabular-nums")}>usually {money(Math.round(block.dailyTotal.low), cur)} to {money(Math.round(block.dailyTotal.high), cur)}</p>
            {hasBudget && (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <WidgetPill tone={under ? "sage" : "saffron"} icon={under ? Check : undefined}>{gap === 0 ? "Exactly on budget" : `${money(gap, cur)} ${under ? "under" : "over"} budget`}</WidgetPill>
                  {block.tripNote && <span className={type.meta}>{block.tripNote}</span>}
                </div>
                <div className="relative mt-4 h-2 rounded-full bg-foreground/10" role="img" aria-label={`Typical day against a ${money(Math.round(block.setBudget as number), cur)} budget`}>
                  <div className={cn("h-full rounded-full", under ? "bg-positive" : "bg-caution")} style={{ width: `${Math.min(100, (block.dailyTotal.typical / scale) * 100)}%` }} />
                  <span className="absolute -top-1 h-4 w-0.5 bg-foreground" style={{ left: `${Math.min(100, ((block.setBudget as number) / scale) * 100)}%` }} aria-hidden />
                </div>
                <p className={cn(type.meta, "mt-1.5")}>Your budget {money(Math.round(block.setBudget as number), cur)}</p>
              </>
            )}
            {!hasBudget && block.tripNote && <p className={cn(type.meta, "mt-2")}>{block.tripNote}</p>}
          </div>
          <BudgetRing block={block} />
        </WidgetHero>
      }
      foot={block.estimated ? "Not backed by a current source: treat these as rough" : hasBudget && block.tripNote ? "Estimates from typical prices, not quotes" : "Estimates from typical prices, not quotes. Excludes flights and hotel."}
      action={onOpenPanel ? <WidgetAction onClick={() => onOpenPanel({ kind: "budget", block })} label="Budget details">Details</WidgetAction> : undefined}
    >
      <WidgetRows>
        {block.lines.map((line, i) => (
          <WidgetRow
            key={i}
            lead={<span aria-hidden className="size-3 shrink-0 rounded-[0.3125rem]" style={{ background: BUDGET_COLOR[Math.min(i, BUDGET_COLOR.length - 1)] }} />}
            title={line.category}
            detail={line.note}
            mid={<RowBar frac={line.typical === 0 ? 0 : line.typical / maxTypical} color={BUDGET_COLOR[Math.min(i, BUDGET_COLOR.length - 1)]} />}
            value={<RowValue sub={rangeOf(line.low, line.high, cur)}>{priceOrFree(line.typical, cur)}</RowValue>}
          />
        ))}
      </WidgetRows>
    </Widget>
  );
}

type ItineraryBlockData = Extract<AssistantBlock, { type: "itinerary" }>;

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

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

function ItineraryBlockView({ block: sourceBlock, tripId, onOpenPlace, onOpenPanel, onFollowup, replyText }: { block: ItineraryBlockData; tripId: string; replyText?: string } & Pick<BlockHandlers, "onOpenPlace" | "onOpenPanel" | "onFollowup">) {
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

  const dayIndex = Math.min(active, block.days.length - 1);
  const mapPoints = pointsFromItinerary(block);
  const timedStops = day.stops.length;
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
            className={cn(controlSecondary, status === "added" && "border-positive/40 bg-positive-soft text-positive")}
          >
            {status === "adding" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : status === "added" ? <Check className="size-3.5" aria-hidden /> : <CalendarPlus className="size-3.5" aria-hidden />}
            {status === "added" ? "Added to itinerary" : "Add whole plan"}
          </button>
        </>
      }
      foot={day.open ? "This day is open: yours to wander" : timedStops > 1 ? `${timedStops} stops · drag the grip to reorder` : `${timedStops} stop`}
      action={onOpenPanel && !day.open ? <WidgetAction onClick={() => onOpenPanel({ kind: "day", block, dayIndex })}>Open {day.label}</WidgetAction> : undefined}
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
                "min-w-[6.5rem] flex-1 rounded-[1.125rem] border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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
function TripSummaryBlockView({ block }: { block: TripSummaryBlockData }) {
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
function TripUpdateBlockView({ block, onFollowup }: { block: TripUpdateBlockData } & Pick<BlockHandlers, "onFollowup">) {
  const count = block.changes.length;
  return (
    <Widget
      glyph="update"
      tone="sage"
      eyebrow="Trip updated"
      title={count === 1 ? (showChange(block.changes[0].field, block.changes[0].to) === "Not set" && block.changes[0].from ? `${block.changes[0].label} cleared` : `${block.changes[0].label} updated`) : `${count} changes saved`}
      status={<WidgetPill tone="sage">{count} change{count === 1 ? "" : "s"}</WidgetPill>}
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

/** A temperature with a true minus sign: "−23°", "16°". */
const degrees = (n: number) => (n < 0 ? `−${Math.abs(n)}°` : `${n}°`);

/** Money for a row: zero is the word Free, never a bare 0. */
const priceOrFree = (amount: number, currency: string) => (Math.round(amount) === 0 ? "Free" : money(Math.round(amount), currency));

/** A range for a row ("£30–£100", "Free–£20", "Free"). */
const rangeOf = (low: number, high: number, currency: string) => (Math.round(high) === 0 ? "Free" : `${priceOrFree(low, currency)}–${money(Math.round(high), currency)}`);

/** Compact money for the middle of a ring ("¥22.9k"), so a big number never overflows it. */
function compactMoney(amount: number, currency: string): string {
  if (amount < 10000) return money(Math.round(amount), currency);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(amount);
  } catch {
    return money(Math.round(amount), currency);
  }
}

/** A journey's length as one figure: "26" min, "1:10" h, "1 d 2 h". */
function longDuration(minutes: number): { big: string; unit: string; rest?: { big: string; unit: string } } {
  if (minutes < 60) return { big: String(minutes), unit: "min" };
  if (minutes < 24 * 60) return { big: String(Math.floor(minutes / 60)), unit: "h", rest: { big: String(minutes % 60).padStart(2, "0"), unit: "min" } };
  return { big: String(Math.floor(minutes / 1440)), unit: "d", rest: { big: String(Math.floor((minutes % 1440) / 60)), unit: "h" } };
}

/** Minutes in a step's "35 min" / "1 h 05" text, for how wide its bar is. */
const stepMinutes = (duration?: string) => {
  if (!duration) return 0;
  const h = duration.match(/(\d+)\s*h/i), m = duration.match(/(\d+)\s*min/i);
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
};
const legColor = (leg: { mode: string; color?: string }) => (leg.color ? `#${leg.color.replace(/^#/, "")}` : MODE_COLOR[leg.mode === "walking" ? "walk" : leg.mode === "driving" ? "drive" : leg.mode] ?? MODE_COLOR.unknown);

/** The route drawn from its own coordinates on a quiet ground: each part in its mode's colour, a dark dot at the start, a coral pin at the end. */
function RouteSketch({ route }: { route: RouteSummaryBlockData }) {
  const parts = route.legs?.length ? route.legs.map((leg) => ({ path: leg.path, color: legColor(leg) })) : route.path ? [{ path: route.path, color: legColor({ mode: route.mode }) }] : [];
  const all = parts.flatMap((part) => part.path);
  if (all.length < 2) return null;
  const lat0 = (all.reduce((sum, [, lat]) => sum + lat, 0) / all.length) * (Math.PI / 180);
  const pts = (path: Array<[number, number]>) => path.map(([lng, lat]) => [lng * Math.cos(lat0), -lat] as const);
  const flat = pts(all);
  const minX = Math.min(...flat.map((p) => p[0])), maxX = Math.max(...flat.map((p) => p[0]));
  const minY = Math.min(...flat.map((p) => p[1])), maxY = Math.max(...flat.map((p) => p[1]));
  const W = 300, H = 176, pad = 22;
  const k = Math.min((W - pad * 2) / (maxX - minX || 1e-9), (H - pad * 2) / (maxY - minY || 1e-9));
  const ox = (W - (maxX - minX) * k) / 2, oy = (H - (maxY - minY) * k) / 2;
  const project = (path: Array<[number, number]>) => pts(path).map(([x, y]) => `${(ox + (x - minX) * k).toFixed(1)},${(oy + (y - minY) * k).toFixed(1)}`);
  const first = project(all)[0].split(",").map(Number), last = project(all).at(-1)!.split(",").map(Number);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full min-h-[11rem] w-full" role="img" aria-label={`The route from ${route.from} to ${route.to}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="route-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="white" strokeOpacity="0.7" strokeWidth="1" /></pattern>
      </defs>
      <rect width={W} height={H} fill="var(--lagoon-soft)" />
      <rect width={W} height={H} fill="url(#route-grid)" />
      {parts.map((part, i) => <polyline key={`c${i}`} points={project(part.path).join(" ")} fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />)}
      {parts.map((part, i) => <polyline key={i} points={project(part.path).join(" ")} fill="none" stroke={part.color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />)}
      <circle cx={first[0]} cy={first[1]} r="8" fill="white" />
      <circle cx={first[0]} cy={first[1]} r="4.5" fill="var(--foreground)" />
      <circle cx={last[0]} cy={last[1]} r="9" fill="white" />
      <circle cx={last[0]} cy={last[1]} r="5.5" fill="var(--coral)" />
    </svg>
  );
}

/** The journey as one ribbon, each part as wide as it takes. */
function RouteRibbon({ route }: { route: RouteSummaryBlockData }) {
  const parts = route.legs?.length
    ? route.legs.map((leg) => ({ minutes: leg.minutes, color: legColor(leg), walk: leg.mode === "walk" || leg.mode === "walking" }))
    : route.steps.map(parseRouteStep).map((step) => ({ minutes: stepMinutes(step.duration), color: step.glyph.label === "Walk" ? MODE_COLOR.walk : MODE_COLOR.transit, walk: step.glyph.label === "Walk" }));
  const total = parts.reduce((sum, part) => sum + part.minutes, 0);
  if (total <= 0) return null;
  return (
    <div className="flex h-2.5 gap-[3px]" role="img" aria-label="The journey, part by part">
      {parts.filter((part) => part.minutes > 0).map((part, i) => (
        <span key={i} className="min-w-1.5 rounded-full" style={{ flex: part.minutes, background: part.walk ? `repeating-linear-gradient(90deg, ${part.color} 0 3px, transparent 3px 6px)` : part.color, opacity: part.walk ? 0.7 : 1 }} />
      ))}
    </div>
  );
}

const clockOf = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null);

function RouteSummaryCard({ route, onOpenPanel }: { route: RouteSummaryBlockData } & Pick<BlockHandlers, "onOpenPanel">) {
  const distance = useDistance();
  const ends = splitRouteEnds(route.from, route.to);
  const minutes = Math.max(1, Math.round(route.durationSeconds / 60));
  const span = longDuration(minutes);
  const [allSteps, setAllSteps] = useState(false);
  // A short walk needs no map, ribbon or steps: one reassuring line is the whole answer.
  const nearby = route.mode === "walking" && minutes <= 5;
  const steps = route.steps.map(parseRouteStep).map((step) => ({ ...step, minutes: stepMinutes(step.duration) }));
  const longest = Math.max(...steps.map((step) => step.minutes), 1);
  const leaves = clockOf(route.departureTime), arrives = clockOf(route.arrivalTime);
  const drawable = (route.legs?.some((leg) => leg.path.length > 1) ?? false) || (route.path?.length ?? 0) > 1;
  // The same real street map the comparison card draws (the sketch stays underneath until it arrives, or if it never does).
  const lines = (route.legs?.length ? route.legs.map((leg) => ({ path: leg.path, color: legColor(leg) })) : route.path ? [{ path: route.path, color: legColor({ mode: route.mode }) }] : [])
    .filter((part) => part.path.length > 1);
  const mapRequest: RouteMapRequest | null = lines.length === 0 ? null : {
    lines: [
      ...lines.map((part) => ({ points: part.path, color: "#ffffff", width: 9 })),
      ...lines.map((part) => ({ points: part.path, color: part.color, width: 5 })),
    ],
    pins: [{ at: lines[0].path[0], color: "#27221e" }, { at: lines.at(-1)!.path.at(-1)!, color: "#ec6a3a" }],
    size: { width: 600, height: 352 },
  };
  return (
    <Widget
      glyph="route"
      tone="lagoon"
      eyebrow={`${ROUTE_MODE_LABEL[route.mode] ?? route.mode}${ends.where ? ` · ${ends.where}` : ""}`}
      title={<RouteEnds from={ends.from} to={ends.to} />}
      status={route.fare ? <WidgetPill tone="lagoon">{money(route.fare.amount, route.fare.currency)}</WidgetPill> : undefined}
      hero={nearby ? (
        <WidgetHero tone="lagoon" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="flex items-baseline gap-1.5"><span className="font-display text-[3.5rem] leading-none font-medium tracking-[-0.04em] tabular-nums">{span.big}</span> <span className="text-base text-ink-soft">{span.unit}</span></p>
          <p className={cn(type.body, "min-w-0 flex-1 text-ink-soft")}>You are nearly there ({distance(route.distanceMeters / 1000)}). A short walk, no map needed.</p>
        </WidgetHero>
      ) : (
        <div className="mx-4 mt-3.5 flex flex-col gap-3.5 @[34rem]:mx-[1.125rem] @[34rem]:flex-row">
          {drawable && mapRequest && <div className="aspect-[300/176] shrink-0 overflow-hidden rounded-[1.125rem] @[34rem]:aspect-auto @[34rem]:h-auto @[34rem]:w-[19rem]"><RouteMap request={mapRequest!} label={`The route from ${route.from} to ${route.to}`} fallback={<RouteSketch route={route} />} /></div>}
          <WidgetHero tone="lagoon" className="!m-0 flex min-w-0 flex-1 flex-col justify-between gap-3 @[34rem]:!p-[1.125rem]">
            <p className="flex items-baseline gap-1.5">
              <span className="font-display text-[3.5rem] leading-none font-medium tracking-[-0.04em] tabular-nums">{span.big}</span>{" "}
              <span className="text-base text-ink-soft">{span.unit}</span>
              {span.rest && (
                <>
                  {" "}
                  <span className="font-display text-[3.5rem] leading-none font-medium tracking-[-0.04em] tabular-nums">{span.rest.big}</span>{" "}
                  <span className="text-base text-ink-soft">{span.rest.unit}</span>
                </>
              )}
            </p>
            <p className={cn(type.meta, "tabular-nums")}>{[distance(route.distanceMeters / 1000), leaves ? `leaves ${leaves}` : null, arrives ? `arrives ${arrives}` : null].filter(Boolean).join(" · ")}</p>
            <RouteRibbon route={route} />
          </WidgetHero>
        </div>
      )}
      foot={nearby ? undefined : leaves && arrives ? <>Leaves {leaves}, arrives {arrives}</> : "Times are estimates and can change with traffic and service"}
      action={onOpenPanel && !nearby ? <WidgetAction onClick={() => onOpenPanel({ kind: "route", routes: [route], active: 0 })}>{route.path ? "Map" : "Steps"}</WidgetAction> : undefined}
    >
      {steps.length > 0 && !nearby && (
        <WidgetRows>
          {(allSteps ? steps : steps.slice(0, 5)).map((step, i) => (
            <WidgetRow
              key={i}
              lead={<span className="grid size-9 shrink-0 place-items-center rounded-xl bg-lagoon-soft text-lagoon" aria-hidden><step.glyph.icon className="size-[1.125rem]" /></span>}
              title={step.title}
              mid={step.minutes > 0 ? <RowBar frac={step.minutes / longest} color={step.glyph.label === "Walk" ? MODE_COLOR.walk : MODE_COLOR.transit} /> : undefined}
              value={step.duration ? <RowValue>{step.duration}</RowValue> : undefined}
            />
          ))}
        </WidgetRows>
      )}
      {steps.length > 5 && !nearby && !allSteps && (
        <div className="border-t border-border px-4 py-3 text-center">
          <button type="button" onClick={() => setAllSteps(true)} className={controlSecondary}>Show {steps.length - 5} more steps <ChevronDown className="size-3.5" aria-hidden /></button>
        </div>
      )}
    </Widget>
  );
}

/** 2+ modes between the same two places: a real map of every way, then one tab per mode with its routes listed under it. */
function RouteComparisonCard({ from, to, routes, onOpenPanel }: { from: string; to: string; routes: RouteSummaryBlockData[] } & Pick<BlockHandlers, "onOpenPanel">) {
  const distance = useDistance();
  const sorted = [...routes].sort((a, b) => a.durationSeconds - b.durationSeconds);
  const fastest = sorted[0];
  const ends = splitRouteEnds(from, to);
  // One group per mode, the quickest mode first; each group's routes stay quickest first.
  const groups = [...new Set(sorted.map((route) => route.mode))].map((mode) => ({ mode, routes: sorted.filter((route) => route.mode === mode) }));
  const [mode, setMode] = useState(groups[0].mode);
  const [pick, setPick] = useState(0);
  const group = groups.find((g) => g.mode === mode) ?? groups[0];
  const chosen = group.routes[Math.min(pick, group.routes.length - 1)];
  const minutes = (route: RouteSummaryBlockData) => formatDuration(route.durationSeconds / 60);
  const slowest = Math.max(...group.routes.map((route) => route.durationSeconds), 1);
  const linesOf = (route: RouteSummaryBlockData) => (route.legs?.length ? route.legs.map((leg) => ({ path: leg.path, color: legColor(leg) })) : route.path ? [{ path: route.path, color: legColor({ mode: route.mode }) }] : []).filter((part) => part.path.length > 1);
  const chosenLines = linesOf(chosen);
  const mapRequest: RouteMapRequest | null = chosenLines.length === 0 ? null : {
    lines: [
      // The other ways: one faint line each (a transit route is several legs, but only the chosen one needs them drawn apart).
      ...sorted.filter((route) => route !== chosen).map((route) => ({ points: route.path && route.path.length > 1 ? route.path : linesOf(route).flatMap((part) => part.path), color: "#9fb3c6", width: 3, opacity: 0.8 })).filter((line) => line.points.length > 1),
      ...chosenLines.map((part) => ({ points: part.path, color: "#ffffff", width: 9 })),
      ...chosenLines.map((part) => ({ points: part.path, color: part.color, width: 5 })),
    ],
    pins: [{ at: chosenLines[0].path[0], color: "#27221e" }, { at: chosenLines.at(-1)!.path.at(-1)!, color: "#ec6a3a" }],
    size: { width: 640, height: 260 },
  };
  return (
    <Widget
      glyph="route"
      tone="lagoon"
      eyebrow={`Ways to get there${ends.where ? ` · ${ends.where}` : ""}`}
      title={<RouteEnds from={ends.from} to={ends.to} />}
      status={<WidgetPill tone="lagoon" icon={Check}>{ROUTE_MODE_LABEL[fastest.mode] ?? fastest.mode} is fastest</WidgetPill>}
      foot={onOpenPanel ? "Tap a way to open it on the map" : "Times are estimates"}
      action={onOpenPanel ? <WidgetAction onClick={() => onOpenPanel({ kind: "route", routes: sorted, active: sorted.indexOf(chosen) })}>{chosen.path ? "Map" : "Steps"}</WidgetAction> : undefined}
      hero={mapRequest && (
        <div className="relative mx-4 mt-3.5 aspect-[640/260] overflow-hidden rounded-[1.125rem] bg-lagoon-soft @[34rem]:mx-[1.125rem]">
          <RouteMap request={mapRequest} label={`The ${ROUTE_MODE_LABEL[chosen.mode] ?? chosen.mode} route from ${from} to ${to}`} fallback={<RouteSketch route={chosen} />} />
          <span className="absolute top-2.5 left-2.5"><WidgetPill className="bg-white text-ink shadow-soft">{ROUTE_MODE_LABEL[chosen.mode] ?? chosen.mode} · {minutes(chosen)}</WidgetPill></span>
        </div>
      )}
    >
      <div role="tablist" aria-label="Ways to travel" className="mx-4 mt-3.5 flex gap-2 @[34rem]:mx-[1.125rem]">
        {groups.map((g) => {
          const Icon = routeModeIcon(g.mode);
          const on = g.mode === group.mode;
          return (
            <button
              key={g.mode}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => { setMode(g.mode); setPick(0); }}
              className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition-colors", on ? "border-ink bg-card ring-1 ring-ink" : "border-border bg-card hover:border-ink/30")}
            >
              <Icon className="size-5 shrink-0 @max-[27rem]:hidden" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-[0.9375rem] leading-tight font-medium">{ROUTE_MODE_LABEL[g.mode] ?? g.mode}</span>
                <span className="block truncate text-xs leading-tight text-muted-foreground tabular-nums">{g.routes.length > 1 ? `${g.routes.length} routes · ${minutes(g.routes[0])}` : (
                  <>{minutes(g.routes[0])}<span className="@max-[34rem]:hidden"> · {distance(g.routes[0].distanceMeters / 1000)}</span></>
                )}</span>
              </span>
              {g.routes[0] === fastest ? <WidgetPill tone="sage" className="ml-auto h-5 text-[0.6875rem] @max-[34rem]:hidden">Fastest</WidgetPill> : minutes(g.routes[0]) === minutes(fastest) ? <WidgetPill className="ml-auto h-5 text-[0.6875rem] @max-[34rem]:hidden">Same time</WidgetPill> : null}
            </button>
          );
        })}
      </div>
      <WidgetRows className="mt-3">
        {group.routes.map((route, i) => (
          <WidgetRow
            key={i}
            onClick={() => setPick(i)}
            label={`${ROUTE_MODE_LABEL[route.mode] ?? route.mode}, ${minutes(route)}: show on the map`}
            lead={<span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", route === chosen ? "bg-lagoon text-white" : "bg-lagoon-soft text-lagoon")} aria-hidden>{React.createElement(routeModeIcon(route.mode), { className: "size-[1.125rem]" })}</span>}
            title={<span className="inline-flex items-center gap-1.5">{(route.mode === "transit" && route.steps.length > 0 ? routeLines(route.steps) : null) || ROUTE_MODE_LABEL[route.mode] || route.mode}{group.routes.length > 1 && i === 0 ? <WidgetPill tone="sage" className="h-5 text-[0.6875rem]">Quickest</WidgetPill> : null}</span>}
            detail={[clockOf(route.departureTime) ? `leaves ${clockOf(route.departureTime)}` : null, route.fare ? money(route.fare.amount, route.fare.currency) : null, distance(route.distanceMeters / 1000)].filter(Boolean).join(" · ")}
            mid={<RowBar frac={route.durationSeconds / slowest} color={route === fastest ? "var(--positive)" : "var(--lagoon)"} />}
            value={<RowValue>{minutes(route)}</RowValue>}
          />
        ))}
      </WidgetRows>
    </Widget>
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

function StaysBlockView({ block, tripId, preview, onOpenStay, onOpenCollection, onOpenPanel }: { block: StaysBlockData; tripId: string; preview: boolean } & Pick<BlockHandlers, "onOpenStay" | "onOpenCollection" | "onOpenPanel">) {
  const [view, setView] = useState<StayView>(DEFAULT_STAY_VIEW);
  const trip = useTripDataMaybe()?.data?.trip;
  const tripDates = { start: trip?.start_date ?? null, end: trip?.end_date ?? null };
  const search = useStaySearch(block, tripId);
  // In the chat the card searches again as the bar changes; in the "see all" panel it is just the list it was handed.
  const live = preview;
  const source = live ? search.items : block.items;
  const where = live ? search.query.location : block.location;
  const nights = live ? search.nights : block.nights;
  const loading = live && search.status === "loading";
  const items = applyStayView(source, view);
  const filtersOn = view.refundable || view.breakfast || view.stars4;
  const { sorts, filters } = stayControls(source, view, setView);
  const dates = live ? { checkin: search.query.checkin, checkout: search.query.checkout, adults: search.query.adults } : { checkin: block.checkin, checkout: block.checkout, adults: block.adults };
  const searchForBar = {
    ...search,
    setLocation: (v: string) => { setView(DEFAULT_STAY_VIEW); search.setLocation(v); },
    setCheckin: search.setCheckin, setCheckout: search.setCheckout, setAdults: search.setAdults, setBoth: search.setBoth,
  };
          const visible = preview ? items.slice(0, MAX_CHAT_CARDS) : items;
          const seeAll = preview && items.length > MAX_CHAT_CARDS && onOpenCollection ? () => onOpenCollection(`All stays in ${where}`, { ...block, location: where, checkin: dates.checkin, checkout: dates.checkout, nights, items }) : undefined;
          // With a Sort row to sit on, "See all" goes to its right edge; a card with no controls keeps it in the header.
          const seeAllOnSortRow = Boolean(seeAll) && source.length >= 2 && sorts.length > 1;
          return (
            // @container: the search bar's narrow/wide layouts (@[34rem] / @max-[34rem]) are keyed to this card's own width, and nothing above it set one up.
            <div className="@container flex flex-col gap-3">
              <SectionHeader
                title={preview ? `Stays in ${where}` : undefined}
                count={preview ? items.length : undefined}
                onSeeAll={seeAllOnSortRow ? undefined : seeAll}
                onMap={preview && onOpenPanel && pointsFromStays(items).length > 0 ? () => onOpenPanel({ kind: "map", title: `Stays in ${where}`, points: pointsFromStays(items), connect: false }) : undefined}
              />
              {live ? <StaySearchBar search={searchForBar} tripId={tripId} trip={tripDates} defaultOpen={search.assumed} /> : <Meta items={[`${block.nights} night${block.nights > 1 ? "s" : ""}`, `${prettyDate(block.checkin)} – ${prettyDate(block.checkout)}`]} />}
              {live ? (search.assumed && <Notice tone="caution">Example dates, pick yours above for accurate prices.</Notice>) : block.dateNote && <Notice tone="caution">{block.dateNote.replace(/\d{4}-\d{2}-\d{2}/g, (m) => prettyDate(m) ?? m)}</Notice>}
              {search.status === "error" && live ? (
                <div role="alert" className={cn(surface, "space-y-3 px-4 py-8 text-center")}>
                  <p className={type.body}>We couldn’t load stays in {where} just now.</p>
                  <button type="button" onClick={search.retry} className={controlSecondary}>Try again</button>
                </div>
              ) : search.status === "empty" && live ? (
                <div className={cn(surface, "space-y-1.5 px-4 py-8 text-center")}>
                  <p className={type.body}>No stays found in {where} for those dates.</p>
                  <p className={type.meta}>Try other days, fewer guests, or a nearby area above.</p>
                </div>
              ) : (
              <>
              <div className={cn("transition-opacity duration-200", loading && "pointer-events-none opacity-50")} aria-busy={loading}>
              <ViewControls
                bordered={false}
                label="stays"
                noun="stays"
                sorts={sorts}
                sort={view.sort}
                onSort={(id) => setView({ ...view, sort: id as StayView["sort"] })}
                filters={filters}
                shown={items.length}
                total={source.length}
                onClear={() => setView({ ...DEFAULT_STAY_VIEW, sort: view.sort })}
                trailing={seeAllOnSortRow ? <SeeAllButton onClick={seeAll!} label={`See all stays in ${where}`} /> : undefined}
              />
              </div>
              <HoldHeight frozen={filtersOn || loading}>
              {loading ? (
                <StayCardsSkeleton className={preview ? rail : grid} cardClassName={preview ? cn(CARD_W, "shrink-0 snap-start") : undefined} />
              ) : (
              <>
              {items.length === 0 && <p className={cn(type.body, "py-6 text-center text-muted-foreground")}>No stays match those filters.</p>}
              <div className={preview ? rail : grid}>
                {visible.map((hotel, hotelIndex) => (
                  <motion.div
                    key={hotel.hotelId || `${hotel.name}-${hotelIndex}`}
                    initial={live && search.searched ? { opacity: 0, y: 12 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: live && search.searched ? Math.min(hotelIndex, 6) * 0.05 : 0 }}
                    className={preview ? cn(CARD_W, "shrink-0 snap-start") : undefined}
                  >
                    <StayCardView hotel={hotel} onOpen={onOpenStay && hotel.hotelId ? () => onOpenStay(hotel, dates) : undefined} />
                  </motion.div>
                ))}
              </div>
              </>
              )}
              </HoldHeight>
              </>
              )}
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

function FlightsBlockView({ block, tripId, onOpenPanel }: { block: FlightsBlockData; tripId: string } & Pick<BlockHandlers, "onOpenPanel">) {
  const [view, setView] = useState<FlightView>(DEFAULT_FLIGHT_VIEW);
  const trip = useTripDataMaybe()?.data?.trip;
  const tripDates = { start: trip?.start_date ?? null, end: trip?.end_date ?? null };
  const fares = useFlightSearch(block, tripId, tripDates);
  const [routeOpen, setRouteOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { query } = fares;
  const roundTrip = query.ret !== null;
  const offers = applyFlightView(fares.items, view);
  const filtersOn = view.nonstop || view.changes || view.airport !== null;
  const loading = fares.status === "loading";
  const ready = fares.status === "ready";
  const day = query.depart ? prettyDate(query.depart) : undefined;
  const picks = useMemo(() => pickFares(fares.items), [fares.items]);
  const chosenPick = picks.find((p) => offerKey(p.offer) === chosen) ?? picks[0] ?? null;
  // A long list shows its best rows and the rest on request; the card never grows without limit.
  const ROWS = 6;
  const shown = showAll || filtersOn ? offers : offers.slice(0, ROWS);
  // A new search starts with a clean view: an airport filter from the last one may not exist in this one.
  const resetView = () => {
    setView((v) => ({ ...v, airport: null }));
    setChosen(null);
    setShowAll(false);
  };
  const change = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
    resetView();
    fn(...args);
  };
  // A card saved before the trip had a currency (or before prices were converted) keeps its old one until it is searched again.
  const tripCurrency = resolveCurrency(useTripDataMaybe()?.data?.preferences);
  const shownCurrency = fares.items[0]?.currency;
  const staleCurrency = !fares.searched && ready && Boolean(shownCurrency) && shownCurrency !== tripCurrency && !fares.items.some((o) => o.listedCurrency);
  const dateNote = query.depart ? `${fares.assumed ? `Example date ${query.depart} — no travel date set yet` : `Departing ${query.depart}`}${query.ret ? `, returning ${query.ret}` : ""}` : block.dateNote;
  const searchForBar = { ...fares, setFrom: change(fares.setFrom), setTo: change(fares.setTo), swap: change(fares.swap), setDepart: change(fares.setDepart), setReturn: change(fares.setReturn), setRoundTrip: change(fares.setRoundTrip), setBoth: change(fares.setBoth) };
  const lowest = fares.items.length ? fares.items.reduce((best, o) => (Number(o.price) < Number(best.price) ? o : best), fares.items[0]) : null;
  const shortest = fares.items.length ? Math.min(...fares.items.map((o) => o.durationMinutes)) : 0;
  const fromName = query.fromLabel.split(",")[0];
  const toName = query.toLabel.split(",")[0];
  // No airport code known: the city name stands in for it.
  const fromCode = fares.items[0]?.originAirport ?? (fromName.length <= 14 ? fromName : fromName.slice(0, 3).toUpperCase());
  const toCode = fares.items[0]?.destinationAirport ?? (toName.length <= 14 ? toName : toName.slice(0, 3).toUpperCase());
  const panelFor = (offer: FlightsBlockData["items"][number]) => ({ kind: "flight" as const, flight: offer, route: { origin: query.fromLabel, destination: query.toLabel, dateNote, retrievedAt: fares.retrievedAt, offers: fares.items, departureDate: query.depart ?? undefined, returnDate: query.ret ?? undefined, originId: query.fromId, destinationId: query.toId } });
  const footNote = (
    <Notice>
      Prices are per person{roundTrip ? ", for the round trip" : ""}{fares.currency ? `, in ${fares.currency}` : ""}
      {fares.items.some((o) => o.listedCurrency) ? `, converted from ${[...new Set(fares.items.map((o) => o.listedCurrency).filter(Boolean))].join(", ")} at today’s rate, so approximate` : ""}. Fares change quickly — check the airline or a travel site before booking.
      {staleCurrency && <button type="button" onClick={() => { resetView(); fares.retry(); }} className={cn(textAction, "ml-1.5 align-baseline")}>Show prices in {tripCurrency}</button>}
    </Notice>
  );
  return (
    <section aria-label="Flights" className="roam-widget @container relative overflow-hidden rounded-3xl border border-border bg-card shadow-widget">
      <FlightHero
        eyebrow={`Flights · ${roundTrip ? "round trip" : "one way"}${day ? ` · ${day}` : ""}`}
        title={<>{fromName} to {toName}</>}
        from={{ code: fromCode, name: fromName }}
        to={{ code: toCode, name: toName }}
        duration={ready ? shortest : 0}
        dim={!ready}
        chip={loading ? <span className="inline-flex h-7 items-center rounded-full border border-white/25 bg-white/15 px-3 text-xs font-medium text-white">Searching…</span> : fares.status === "empty" && !fares.problem ? <span className="inline-flex h-7 items-center rounded-full border border-white/25 bg-white/15 px-3 text-xs font-medium text-white">No flights</span> : lowest && ready ? <span className="inline-flex h-7 items-center rounded-full border border-white/25 bg-white/15 px-3 text-xs font-semibold text-white tabular-nums">From {money(lowest.price, lowest.currency, true)}</span> : undefined}
        right={
          <button
            type="button"
            onClick={() => setRouteOpen((v) => !v)}
            aria-expanded={routeOpen}
            aria-controls="flight-route-editor"
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium backdrop-blur-md transition-[background-color,border-color,color,transform] active:scale-95", routeOpen ? "border-white/50 bg-white/25 text-white" : "border-white/25 bg-white/10 text-white/90 hover:bg-white/20")}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={routeOpen ? "done" : "edit"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }} className="inline-flex items-center gap-1.5">
                {routeOpen ? <X className="size-3.5" aria-hidden /> : <Pencil className="size-3.5" aria-hidden />}
                {routeOpen ? "Done" : "Edit route"}
              </motion.span>
            </AnimatePresence>
          </button>
        }
      />
      {loading && fares.items.length === 0 ? <FlightPicksSkeleton /> : ready && picks.length > 0 && <FlightPicks picks={picks} selected={chosenPick ? offerKey(chosenPick.offer) : null} onSelect={setChosen} roundTrip={roundTrip} />}
      <FlightSearchBar search={searchForBar} tripId={tripId} trip={tripDates} routeOpen={routeOpen} onRouteDone={() => setRouteOpen(false)} />
      {ready && fares.assumed && (
        <div role="note" className="mx-4 mb-1 flex items-center gap-2.5 rounded-2xl bg-caution-soft px-3.5 py-3 text-[0.84375rem] text-caution @[34rem]:mx-5">
          <Info className="size-4 shrink-0" aria-hidden />
          <span>No travel date set, so these are example prices. Pick your date above.</span>
        </div>
      )}
      {fares.insights && ready && fares.currency && <PriceInsight insights={fares.insights} currency={fares.currency} />}
      {ready && chosenPick && <FlightJourney offer={chosenPick.offer} labels={chosenPick.labels} roundTrip={roundTrip} onDetails={onOpenPanel ? () => onOpenPanel(panelFor(chosenPick.offer)) : undefined} tripCurrency={tripCurrency} />}
      {fares.items.length > 0 && fares.status !== "error" && (
        <div className={cn("mt-4 transition-opacity duration-200", loading && "pointer-events-none opacity-50")} aria-busy={loading}>
          <FlightControls items={fares.items} view={view} onChange={setView} shown={offers.length} />
        </div>
      )}
      {fares.status === "error" && (
        <motion.div role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={motionTokens.standard} className="space-y-3 px-4 py-9 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-caution-soft text-caution" aria-hidden><Info className="size-6" /></span>
          <p className="font-display text-lg font-medium">We couldn’t load flights{day ? ` for ${day}` : ""} just now</p>
          <p className={type.meta}>The fares service didn’t answer. Nothing is wrong with your search.</p>
          <button type="button" onClick={fares.retry} className={controlSecondary}>Try again</button>
        </motion.div>
      )}
      {fares.status === "empty" && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={motionTokens.standard} className="space-y-3 px-4 py-9 text-center">
          {fares.problem ? (
            <>
              <p className="font-display text-lg font-medium">We couldn’t find “{fares.problem}”</p>
              <p className={type.meta}>Try a nearby city, or the airport’s three-letter code.</p>
            </>
          ) : (
            <>
              <p className="font-display text-lg font-medium">No flights{day ? ` on ${day}` : ""}{roundTrip && query.ret ? ` to ${prettyDate(query.ret)}` : ""}</p>
              <p className={type.meta}>Nothing is flying this route that day. Nearby days often have fares.</p>
              {query.depart && (
                <div className="flex justify-center gap-2">
                  <button type="button" onClick={() => searchForBar.setDepart(shiftIso(query.depart!, -1))} className={controlSecondary}>Day before</button>
                  <button type="button" onClick={() => searchForBar.setDepart(shiftIso(query.depart!, 1))} className={controlSecondary}>Day after</button>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}
      {fares.status !== "error" && fares.status !== "empty" && (
      <div>
      {loading && <FlightRowsSkeleton />}
      {ready && offers.length === 0 && (
        <div className="space-y-2 px-4 py-8 text-center">
          <p className="font-display text-lg font-medium">No flights match those filters</p>
          <p className={type.meta}>The picks above ignore filters. Clear them to see all {fares.items.length}.</p>
          <button type="button" onClick={() => setView({ ...DEFAULT_FLIGHT_VIEW, sort: view.sort })} className={controlSecondary}>Clear filters</button>
        </div>
      )}
      {ready && fares.items.length > 1 && (
      <ul className="divide-y divide-border">
        {shown.map((offer, offerIndex) => {
          const flightPanel = panelFor(offer);
          const openFlight = () => onOpenPanel?.(flightPanel);
          const key = offerKey(offer);
          const isPicked = chosenPick ? offerKey(chosenPick.offer) === key : false;
          return (
            <motion.li
              layout="position"
              transition={{ ...motionTokens.standard, delay: fares.searched ? Math.min(offerIndex, 6) * 0.045 : 0 }}
              initial={fares.searched ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              key={key + offerIndex}
              className={cn("px-4 py-3.5 @[34rem]:px-[1.125rem]", onOpenPanel && "cursor-pointer transition-colors hover:bg-muted/35 focus-visible:bg-muted/45 focus-visible:outline-none")}
              onClick={onOpenPanel ? () => openFlight() : undefined}
              onKeyDown={onOpenPanel ? (event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openFlight();
                }
              } : undefined}
              role={onOpenPanel ? "button" : undefined}
              tabIndex={onOpenPanel ? 0 : undefined}
              aria-label={onOpenPanel ? `Open details for ${offer.airline}, ${clock(offer.departAt)} to ${clock(offer.arriveAt)}` : undefined}
            >
              <FlightRowBody offer={offer} roundTrip={roundTrip} cheapest={offers.length > 1 && offer === lowest} selected={isPicked} onDetails={onOpenPanel ? openFlight : undefined} />
            </motion.li>
          );
        })}
      </ul>
      )}
      {ready && !showAll && !filtersOn && offers.length > ROWS && (
        <div className="border-t border-border px-4 py-3.5 text-center">
          <button type="button" onClick={() => setShowAll(true)} className={controlSecondary}>Show {offers.length - ROWS} more <ChevronDown className="size-3.5" aria-hidden /></button>
        </div>
      )}
      </div>
      )}
      <WidgetFoot foot={footNote} />
    </section>
  );
}

/** Blocks that open with a Roam line icon in their header (the first of them in a live reply plays the handoff). */
const ICON_WIDGETS = new Set(["weather", "comparison", "structured_answer", "options", "budget", "itinerary", "trip_summary", "trip_update", "route_group", "checklist", "empty_result"]);

export function MessageBlocks({ blocks, tripId, onFollowup, onOpenPlace, onOpenStay, onOpenEvent, onOpenCollection, onOpenPanel, preview = true, replyText, live = false }: { blocks: AssistantBlock[]; preview?: boolean; replyText?: string; /** A reply that just arrived: its blocks rise in one after another. Restored history stays still. */ live?: boolean } & BlockHandlers) {
  const grouped = groupRouteSummaries(blocks);
  const firstWidget = grouped.findIndex((b) => ICON_WIDGETS.has(b.type));
  return (
    <LiveReplyContext.Provider value={live}>
    <div className="roam-blocks mt-4 flex flex-col gap-6 [overflow-wrap:anywhere]">
      {grouped.map((block, index, all) => {
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
                    <PlaceCardView place={place} tripId={tripId} onOpenPlace={onOpenPlace} />
                  </div>
                ))}
              </div>
              {!preview && block.places.length > 0 && <MorePlaces block={block} tripId={tripId} onOpenPlace={onOpenPlace} />}
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
          return <div key={index}><FlightsBlockView block={block} tripId={tripId} onOpenPanel={onOpenPanel} /></div>;
        }

        if (block.type === "stays") {
          return <StaysBlockView key={index} block={block} tripId={tripId} preview={preview} onOpenStay={onOpenStay} onOpenCollection={onOpenCollection} onOpenPanel={onOpenPanel} />;
        }

        if (block.type === "weather") {
          return <div key={index}><WeatherBlockView block={block} /></div>;
        }

        if (block.type === "itinerary") {
          return <div key={index}><ItineraryBlockView block={block} tripId={tripId} onOpenPlace={onOpenPlace} onOpenPanel={onOpenPanel} onFollowup={onFollowup} replyText={replyText} /></div>;
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
              <span className="grid size-10 shrink-0 place-items-center rounded-[0.8125rem] bg-caution-soft text-caution"><RoamIcon name="search" size={26} /></span>
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
        return node ? <Enter key={`${block.type}-${occurrence}`} live={live} index={index}><HandoffContext.Provider value={index === firstWidget}>{node}</HandoffContext.Provider></Enter> : null;
      })}
    </div>
    </LiveReplyContext.Provider>
  );
}
