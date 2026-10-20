"use client";

import Link from "next/link";
import { Compass, Heart, Sparkles } from "lucide-react";
import { SwapView } from "@/components/SwapView";
import { PlaceCard } from "@/components/PlaceCard";
import { EventCard } from "@/components/EventCard";
import { SkeletonBand, SkeletonList } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { Stagger, StaggerItem } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";
import type { useShowMore } from "@/lib/use-show-more";
import type { useDiscoverFeed } from "../application/useDiscoverFeed";
import type { Item } from "../domain/discover";
import { CATEGORIES, type CATEGORY_BY_KEY } from "./discoverTaxonomy";
import { StayMiniCard } from "./StayMiniCard";

type Category = NonNullable<ReturnType<(typeof CATEGORY_BY_KEY)["get"]>>;

/** What Discover shows under the filters: the skeleton, the phone's feed, a grid of results, or the "All" digest of bands; each crossfades into the next. */
export function DiscoverFeed({ tripId, view, phone, destination, activeCat, askQuery, feed, gridView, gridItems, gridMore, phoneItems, phoneShown, phoneMore }: {
  tripId: string;
  view: "results" | "saved";
  phone: boolean;
  destination: string;
  activeCat: Category | null;
  /** What to carry to the chat when nothing matched. */
  askQuery: string;
  feed: ReturnType<typeof useDiscoverFeed>;
  gridView: boolean;
  gridItems: Item[];
  gridMore: ReturnType<typeof useShowMore>;
  phoneItems: Item[];
  phoneShown: Item[];
  phoneMore: ReturnType<typeof useShowMore>;
}) {
  const { bands, loading, eventsBusy, moreEvents, pickCategory, loadMoreEvents } = feed;
  // In a band on a phone each card is a swipeable slide (the next one peeks in), not a half-width tile: two to a row cramped the buttons.
  const slide = "max-sm:w-[15.5rem] max-sm:shrink-0 max-sm:snap-start";
  // From sm up the cards are about 11:10, not 3:4: three across a wide screen made each one 350px wide and 470 tall. 11:10 is the height the
  // Discover cards had before the cinematic ones (a 16:10 photo with its text under it, roughly 330px at this width).
  const squareOnWide = "sm:[&_article]:aspect-[11/10]";
  const renderItem = (item: Item, inRail = false, row = false) => {
    if (item.kind === "place") {
      return (
        <StaggerItem key={`p:${item.place.providerId}`} className={cn(squareOnWide, inRail && slide)}>
          <PlaceCard tripId={tripId} place={item.place} why={item.why ?? undefined} phoneRow={row} />
        </StaggerItem>
      );
    }
    if (item.kind === "event") {
      return (
        <StaggerItem key={`e:${item.event.url}|${item.event.date ?? ""}`} className={cn(squareOnWide, inRail && slide)}>
          <EventCard tripId={tripId} event={item.event} phoneRow={row} />
        </StaggerItem>
      );
    }
    return (
      <StaggerItem key={`s:${item.stay.hotelId}`} className={cn(squareOnWide, inRail && slide)}>
        <StayMiniCard tripId={tripId} stay={item.stay} phoneRow={row} />
      </StaggerItem>
    );
  };
  const phoneTile = (item: Item, mode: "feature" | "grid") =>
    item.kind === "place" ? <PlaceCard key={`p:${item.place.providerId}`} tripId={tripId} place={item.place} why={item.why ?? undefined} phoneTile={mode} />
    : item.kind === "event" ? <EventCard key={`e:${item.event.url}|${item.event.date ?? ""}`} tripId={tripId} event={item.event} phoneTile={mode} />
    : <StayMiniCard key={`s:${item.stay.hotelId}`} tripId={tripId} stay={item.stay} phoneTile={mode} />;
  // Columns follow the width of this area, not the window, so an open side panel does not squeeze the cards.
  const grid = "grid gap-4 sm:grid-cols-2 @[46rem]:grid-cols-3";

  return (
    <SwapView id={loading && gridItems.length === 0 && (bands === null || gridView) ? "skeleton" : gridView ? "grid" : loading && !bands ? "digest-loading" : "digest"}>
      {phone && !(loading && phoneItems.length === 0) ? (
        phoneShown.length > 0 ? (
          <div className="mt-5 flex flex-col gap-5">
            {phoneTile(phoneShown[0], "feature")}
            {phoneShown.length > 1 && <div className="grid grid-cols-2 gap-x-3 gap-y-6">{phoneShown.slice(1).map((it) => phoneTile(it, "grid"))}</div>}
            {phoneMore.remaining > 0 && <ShowMoreButton next={phoneMore.next} visible={phoneMore.visible} total={phoneItems.length} onClick={phoneMore.showMore} noun="results" />}
          </div>
        ) : (
          <div className="mt-12 flex flex-col items-center px-3 text-center">
            <span aria-hidden className="grid size-16 place-items-center rounded-full bg-coral-soft text-coral-ink">{view === "saved" ? <Heart className="size-7" /> : <Compass className="size-7" />}</span>
            <h2 className="mt-5 font-display text-2xl font-medium tracking-[-0.03em]">{view === "saved" ? "Nothing saved yet" : "Nothing matched that"}</h2>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft text-pretty">
              {view === "saved"
                ? "Tap the heart on a place and it lands here. Roam can suggest a few to start."
                : destination
                  ? `${askQuery ? `No ${askQuery.toLowerCase()}` : "Nothing"} for these dates. Try a wider area, or let Roam look.`
                  : "Set a destination for this trip to see ideas here."}
            </p>
            {view !== "saved" && destination && (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {CATEGORIES.slice(0, 2).map((c) => (
                  <button key={c.key} type="button" onClick={() => pickCategory(c.key)} className="btn-chip">{c.label}</button>
                ))}
              </div>
            )}
            <Link prefetch={false} href={`/trips/${tripId}/chat${askQuery ? `?ask=${encodeURIComponent(askQuery)}` : ""}`} className="btn-primary mt-5 h-12 rounded-full px-6">
              <Sparkles className="size-4" aria-hidden /> {view === "saved" ? "Ask Roam for ideas" : "Ask Roam instead"}
            </Link>
          </div>
        )
      ) : loading && gridItems.length === 0 && (bands === null || gridView) ? (
        gridView ? <SkeletonList count={6} className="mt-5 @[46rem]:grid-cols-3" /> : <SkeletonBand count={6} className="mt-5" />
      ) : gridView ? (
        gridItems.length > 0 ? (
          <>
            <Stagger className={cn(grid, "mt-5")}>{gridItems.slice(0, gridMore.visible).map((it) => renderItem(it, false, true))}</Stagger>
            {/* Rows already in hand come first (no request); an events list that has run out of them asks the provider for its next page. */}
            {gridMore.remaining > 0 ? (
              <div className="mt-6"><ShowMoreButton next={gridMore.next} visible={gridMore.visible} total={gridItems.length} onClick={gridMore.showMore} noun="results" /></div>
            ) : view !== "saved" && activeCat?.kind === "event" && moreEvents ? (
              <div className="mt-6"><ShowMoreButton force busy={eventsBusy} next={0} visible={gridItems.length} total={gridItems.length} onClick={() => void loadMoreEvents()} noun="events" /></div>
            ) : null}
          </>
        ) : (
          <EmptyState icon={Compass} className="mt-8">
            {view === "saved"
              ? "Nothing shortlisted yet. Use Add to trip on any card, or ask Roam for ideas."
              : "Nothing here right now — try a different filter or search."}
          </EmptyState>
        )
      ) : (
        // "All" digest
        <div className="mt-5">
          {loading && !bands ? (
            <SkeletonBand count={6} className="mt-4" />
          ) : !bands || bands.length === 0 ? (
            <EmptyState icon={Compass} className="mt-8">
              {destination ? "Nothing came back just now. Try a search or a different category." : "Set a destination for this trip to see ideas here."}
            </EmptyState>
          ) : (
            <div className="mt-4 space-y-9">
              {(bands ?? []).map((band) => (
                <section key={band.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-lg">{band.label}</h3>
                    {band.key && (
                      <button type="button" onClick={() => pickCategory(band.key)} className="shrink-0 text-xs font-medium text-primary hover:underline relative after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']">
                        See all &rarr;
                      </button>
                    )}
                  </div>
                  {/* Two rows of three per band; the rest lives behind "See all". */}
                  <Stagger className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 max-sm:-mx-5 max-sm:-mb-10 max-sm:flex max-sm:snap-x max-sm:snap-mandatory max-sm:items-stretch max-sm:overflow-x-auto max-sm:overscroll-x-contain max-sm:px-5 max-sm:pt-2 max-sm:pb-10 max-sm:scroll-px-5 no-scrollbar">
                    {band.items.slice(0, 6).map((it) => renderItem(it, true))}
                  </Stagger>
                  {band.key && band.items.length > 6 && (
                    <button
                      type="button"
                      onClick={() => pickCategory(band.key)}
                      className="mt-3 inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-soft transition-colors hover:bg-accent max-sm:hidden"
                    >
                      See all {band.label.toLowerCase()} &rarr;
                    </button>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </SwapView>
  );
}
