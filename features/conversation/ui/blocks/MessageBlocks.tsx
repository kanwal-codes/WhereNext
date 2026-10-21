"use client";

import React from "react";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { AddToTripControl } from "@/features/trip/ui/AddToTripControl";
import { CompareView } from "@/components/CompareView";
import { cn } from "@/lib/utils";
import { categoryLabel } from "@/lib/places-ui";
import { HandoffContext, LiveReplyContext, RoamIcon } from "@/features/roam/ui/RoamIcon";
import { portableProxyPhotoUrl } from "../portable-photo-url";
import { DiscoverTile } from "@/features/places/ui/DiscoverTile";
import { warmPlace } from "@/features/places/application/placeDetailsCache";
import { Enter } from "@/components/motion-primitives";
import { ChecklistBlock } from "./ChecklistBlock";
import { pointsFromPlaces } from "./mapPoints";
import { placeGlyph } from "./glyphs";
import { cardWidth, SectionHeader, grid, rail, surface, type } from "./ui";
import { BlockHandlers, MAX_CHAT_CARDS } from "./blockShared";
import { RouteComparisonCard, RouteSummaryCard, groupRouteSummaries } from "./RouteBlocks";
import { ItineraryBlockView, TripSummaryBlockView, TripUpdateBlockView } from "./TripBlocks";
import { MorePlaces, PlaceCardView, cleanSectionTitle, toPlace } from "./PlaceBlocks";
import { ComparisonBlockView, OptionsBlockView, StructuredAnswerBlockView } from "./AnswerBlocks";
import { EventsBlockView } from "./EventBlocks";
import { FlightsBlockView } from "./FlightBlocks";
import { StaysBlockView } from "./StayBlocks";
import { WeatherBlockView } from "./WeatherBlock";
import { BudgetBlockView } from "./BudgetBlock";
export type { BlockHandlers } from "./blockShared";

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
              {!preview && (
                // "See all" on a phone is the same two-to-a-row tiles Discover uses, not one tall card per place.
                <div className="grid grid-cols-2 gap-x-3 gap-y-6 lg:hidden">
                  {visible.map((place) => {
                    const category = place.category ? categoryLabel(place.category) : undefined;
                    return (
                      <DiscoverTile
                        key={place.providerId}
                        label={`Open ${place.name}`}
                        onOpen={() => onOpenPlace?.(place)}
                        warm={() => warmPlace(tripId, place.providerId, { title: place.name, subtitle: category, photo: portableProxyPhotoUrl(place.photoUrl), rating: place.rating })}
                        src={portableProxyPhotoUrl(place.photoUrl)}
                        icon={placeGlyph(place.category, place.name).icon}
                        title={place.name}
                        meta={category}
                        rating={place.rating}
                        add={<AddToTripControl tripId={tripId} place={toPlace(place)} variant="orb" size="sm" />}
                      />
                    );
                  })}
                </div>
              )}
              <div className={cn(preview ? rail : grid, !preview && "max-lg:hidden")}>
                {visible.map((place) => (
                  <div key={place.providerId} className={preview ? cn(cardWidth(visible.length), "shrink-0 snap-start") : undefined}>
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
                <RouteSummaryCard route={block.routes[0]} onOpenPanel={onOpenPanel} onFollowup={onFollowup} />
              ) : (
                <RouteComparisonCard from={block.from} to={block.to} routes={block.routes} onOpenPanel={onOpenPanel} onFollowup={onFollowup} />
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
          return <div key={index}><WeatherBlockView block={block} onOpenPanel={onOpenPanel} /></div>;
        }

        if (block.type === "itinerary") {
          return <div key={index}><ItineraryBlockView block={block} tripId={tripId} onOpenPlace={onOpenPlace} onOpenPanel={onOpenPanel} onFollowup={onFollowup} replyText={replyText} /></div>;
        }

        if (block.type === "budget") {
          return <div key={index}><BudgetBlockView block={block} onOpenPanel={onOpenPanel} /></div>;
        }

        if (block.type === "options") {
          return <div key={index}><OptionsBlockView block={block} onFollowup={onFollowup} onOpenPanel={onOpenPanel} /></div>;
        }

        if (block.type === "structured_answer") {
          return <div key={index}><StructuredAnswerBlockView block={block} /></div>;
        }

        if (block.type === "empty_result") {
          return (
            <div key={index} className={cn(surface, "flex items-start gap-3 border-dashed p-4")}>
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-caution-soft text-caution"><RoamIcon name="search" size={26} /></span>
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
          return <div key={index}><ChecklistBlock groups={block.groups} tripId={tripId} onOpen={onOpenPanel ? () => onOpenPanel({ kind: "checklist", block }) : undefined} /></div>;
        }

        return null;
        })();
        return node ? <Enter key={`${block.type}-${occurrence}`} live={live} index={index}><HandoffContext.Provider value={index === firstWidget}>{node}</HandoffContext.Provider></Enter> : null;
      })}
    </div>
    </LiveReplyContext.Provider>
  );
}
