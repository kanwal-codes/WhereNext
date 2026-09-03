import React from "react";
import {
  ArrowUpRight,
  BedDouble,
  Car,
  Footprints,
  MapPin,
  Plane,
  Star,
  TicketCheck,
  TrainFront,
} from "lucide-react";
import type { AssistantBlock, PlaceCard, StayCardItem, TrustLabel } from "@/packages/contracts/assistant";
import type { Place } from "@/packages/contracts/place";
import { AddToTripControl } from "@/features/trip/ui/AddToTripControl";
import { ExternalLink } from "@/components/ExternalLink";
import { CompareView } from "@/components/CompareView";
import { cn } from "@/lib/utils";

export type BlockHandlers = {
  /** The trip these blocks belong to — card actions write against it. */
  tripId: string;
  onFollowup: (prompt: string) => void;
  /** When set, the card head opens this place in the chat side-panel. */
  onOpenPlace?: (place: PlaceCard) => void;
  /** When set, a stay card opens the hotel (rooms + details) in the chat side-panel. */
  onOpenStay?: (stay: StayCardItem, dates: { checkin: string; checkout: string }) => void;
};

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
const rowDivider = "border-b border-border last:border-b-0";
const iconBtn = "btn-chip";
const freshness = "mt-2 text-[11px] text-muted-foreground";
const carousel = "-mx-3.5 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto scrollbar-slim px-3.5 pb-1 sm:-mx-4 sm:px-4";

function fmtTime(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function PlaceCardView({
  place,
  tripId,
  onOpenPlace,
}: { place: PlaceCard; tripId: string } & Pick<BlockHandlers, "onOpenPlace">) {
  const head = (
    <>
      {place.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy
        <img src={place.photoUrl} alt={place.name} width={320} height={160} loading="lazy" className="h-32 w-full object-cover" />
      )}
      <h4 className="px-3.5 pt-3.5 font-display text-base leading-tight">{place.name}</h4>
    </>
  );

  return (
    <article className={cn(card, "group flex h-full flex-col overflow-hidden")}>
      {onOpenPlace ? (
        <button
          type="button"
          onClick={() => onOpenPlace(place)}
          aria-label={`Open ${place.name}`}
          className="block w-full text-left transition-colors hover:bg-accent/50"
        >
          {head}
        </button>
      ) : (
        head
      )}
      <div className="flex flex-1 flex-col gap-2 px-3.5 pt-2 pb-3.5">
        {(place.category || place.address) && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{[place.category?.replaceAll("_", " "), place.address].filter(Boolean).join(" · ")}</span>
          </p>
        )}
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
        {/* "From provider" is the default for every card — only a non-default trust label carries information. */}
        {place.trust !== "sourced" && <p className="eyebrow">{TRUST_LABEL[place.trust] ?? place.trust}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {/* One control: shortlist (still deciding) → a day (going in the plan) → remove. */}
          <AddToTripControl tripId={tripId} place={toPlace(place)} size="sm" />
          {onOpenPlace ? (
            <button type="button" className={iconBtn} onClick={() => onOpenPlace(place)}>
              Details <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            place.sourceUrl && /^https?:\/\//i.test(place.sourceUrl) && (
              <a href={place.sourceUrl} target="_blank" rel="noreferrer noopener" className={iconBtn}>
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
        <img src={hotel.thumbnailUrl} alt={hotel.name} width={320} height={160} loading="lazy" className="h-32 w-full object-cover" />
      ) : (
        <div className="grid h-32 w-full place-items-center bg-muted">
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
    <article className={cn(card, "group flex h-full flex-col overflow-hidden")}>
      {onOpen ? (
        <button type="button" onClick={onOpen} aria-label={`Open ${hotel.name}`} className="block w-full text-left transition-colors hover:bg-accent/50">
          {head}
        </button>
      ) : (
        head
      )}
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
          <div className="mt-auto pt-1">
            <button type="button" className={iconBtn} onClick={onOpen}>
              Rooms &amp; details <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function MessageBlocks({ blocks, tripId, onFollowup, onOpenPlace, onOpenStay }: { blocks: AssistantBlock[] } & BlockHandlers) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      {blocks.map((block, index) => {
        if (block.type === "place_list") {
          return (
            <div key={index} className={carousel}>
              {block.places.map((place) => (
                <div key={place.providerId} className="w-[228px] shrink-0 snap-start">
                  <PlaceCardView place={place} tripId={tripId} onOpenPlace={onOpenPlace} />
                </div>
              ))}
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
          return (
            <div key={index} className={cn(card, "p-3.5")}>
              <p className="font-display text-sm">{block.title}</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full border-collapse text-xs tabular-nums">
                  <thead>
                    <tr>
                      <th aria-hidden="true" className="border border-border p-0" />
                      {block.columns.map((column) => (
                        <th key={column} scope="col" className="border border-border bg-muted px-2 py-1.5 text-left font-medium">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row" className="border border-border bg-muted px-2 py-1.5 text-left font-medium">{row.label}</th>
                        {row.cells.map((cell, cellIndex) => (
                          <td key={cellIndex} className="border border-border px-2 py-1.5">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {block.bestForYou && (
                <p className="mt-2 text-xs text-leaf">
                  <strong className="font-medium">{block.bestForYou.label}</strong> — {block.bestForYou.reason}
                </p>
              )}
            </div>
          );
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

        if (block.type === "route_summary") {
          const Icon = block.mode === "walking" ? Footprints : block.mode === "driving" ? Car : TrainFront;
          return (
            <div key={index} className={cn(card, "p-3.5")}>
              <p className="flex items-center gap-2 font-display text-sm">
                <Icon className="h-4 w-4 text-coral" /> {block.from} → {block.to}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {Math.round(block.durationSeconds / 60)} min · {(block.distanceMeters / 1000).toFixed(1)} km
                {block.departureTime
                  ? ` · leaves ${new Date(block.departureTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </p>
              {block.steps.length > 0 && (
                <ol className="mt-2 list-decimal pl-4 text-xs text-ink-soft marker:text-muted-foreground">
                  {block.steps.map((step, stepIndex) => (
                    <li key={stepIndex} className="my-0.5">{step}</li>
                  ))}
                </ol>
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
          const rel = (event: (typeof block.items)[number]) =>
            event.relToTrip === "before" ? `${event.offsetDays ?? ""} day${event.offsetDays === 1 ? "" : "s"} before your trip`
              : event.relToTrip === "after" ? `${event.offsetDays ?? ""} day${event.offsetDays === 1 ? "" : "s"} after your trip`
              : event.relToTrip === "in" ? "during your trip" : null;
          return (
            <div key={index} className={cn(card, "px-3.5 py-2.5")}>
              {block.window && (
                <p className="pb-1 text-[11px] text-muted-foreground">Checked against your trip · {block.window.start} → {block.window.end}</p>
              )}
              {block.items.map((event, eventIndex) => (
                <div key={eventIndex} className={cn("flex items-baseline justify-between gap-3 py-2", rowDivider)}>
                  <div className="min-w-0">
                    <span className="text-sm font-medium">{event.title}</span>
                    {typeof event.rank === "number" && event.rank >= 65 && (
                      <span className="ml-1.5 rounded-full bg-coral-soft px-1.5 py-0.5 text-[10px] font-medium text-coral">Major event</span>
                    )}
                    {(event.date || event.venue) && (
                      <span className="block text-xs text-muted-foreground">{[event.date, event.venue].filter(Boolean).join(" · ")}</span>
                    )}
                    {rel(event) && (
                      <span className={cn(
                        "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                        event.relToTrip === "in" ? "bg-leaf-soft text-leaf" : "bg-muted text-muted-foreground",
                      )}>
                        {rel(event)}
                      </span>
                    )}
                  </div>
                  <ExternalLink href={event.url} className="shrink-0 whitespace-nowrap">
                    Tickets
                  </ExternalLink>
                </div>
              ))}
              <p className={freshness}>
                <TicketCheck className="mr-1 inline h-3 w-3" />
                Dates and availability can change — check the ticket page before you buy.
              </p>
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
                    {Math.floor(offer.durationMinutes / 60)}h {offer.durationMinutes % 60}m ·{" "}
                    {offer.stops === 0 ? "nonstop" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`} · {fmtTime(offer.departAt)}
                  </span>
                  <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
                    {offer.price} {offer.currency}
                  </span>
                </div>
              ))}
              <p className={freshness}>Fares change quickly — check the airline or a travel site before booking.</p>
            </div>
          );
        }

        if (block.type === "stays") {
          const dates = { checkin: block.checkin, checkout: block.checkout };
          return (
            <div key={index} className="flex flex-col gap-2">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-display text-sm">
                <BedDouble className="h-4 w-4 text-coral" /> Stays in {block.location}
                <span className="text-xs font-normal text-muted-foreground">
                  · {block.nights} night{block.nights > 1 ? "s" : ""}
                  {block.dateNote ? ` · ${block.dateNote}` : ""}
                </span>
              </p>
              <div className={carousel}>
                {block.items.map((hotel, hotelIndex) => (
                  <div key={hotel.hotelId || `${hotel.name}-${hotelIndex}`} className="w-[228px] shrink-0 snap-start">
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
