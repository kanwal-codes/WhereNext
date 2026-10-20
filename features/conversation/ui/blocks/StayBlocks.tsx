"use client";

import { useState } from "react";
import { ArrowUpRight, BedDouble, Check, MapPin } from "lucide-react";
import type { AssistantBlock, StayCardItem } from "@/packages/contracts/assistant";
import { cn } from "@/lib/utils";
import { CINE_ORB, CINE_ORB_WHITE, CineCard, CinePill, CineRating } from "./CineCard";
import { prefetchStayDetails } from "@/features/stays/application/useStayDetails";
import { motion } from "motion/react";
import { ease } from "@/components/motion-primitives";
import { PHONE_V2 } from "@/lib/phone-v2";
import { pointsFromStays } from "./mapPoints";
import { StayCardsSkeleton, StaySearchBar, useStaySearch } from "./StaySearch";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { HoldHeight, ViewControls } from "./ListControls";
import { DEFAULT_STAY_VIEW, applyStayView, stayControls, type StayView } from "./listViews";
import { Badge, CARD_W, cardWidth, Meta, Notice, SectionHeader, SeeAllButton, compactCount, controlSecondary, grid, money, prettyDate, rail, surface, type } from "./ui";
import { BlockHandlers, MAX_CHAT_CARDS } from "./blockShared";

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
          <span className="font-display text-title leading-none font-medium tracking-[-0.025em] tabular-nums">{money(hotel.nightlyPrice, hotel.currency)}</span>
          <span className="text-xs text-white/70">/ night</span>
          <span className="w-full pt-0.5 text-xs text-white/60 tabular-nums">{money(hotel.totalPrice, hotel.currency)} total</span>
        </p>
      ) : (
        <p className="text-xs text-white/70">Price unavailable for these dates</p>
      )}
      action={onOpen && priced ? (
        <button type="button" onClick={onOpen} aria-label={`Rooms & details: ${hotel.name}`} className={cn(CINE_ORB, CINE_ORB_WHITE)}>
          <ArrowUpRight className="size-5" aria-hidden />
        </button>
      ) : undefined}
    />
  );
}

type StaysBlockData = Extract<AssistantBlock, { type: "stays" }>;

export function StaysBlockView({ block, tripId, preview, onOpenStay, onOpenCollection, onOpenPanel }: { block: StaysBlockData; tripId: string; preview: boolean } & Pick<BlockHandlers, "onOpenStay" | "onOpenCollection" | "onOpenPanel">) {
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
              {live ? <StaySearchBar search={searchForBar} tripId={tripId} trip={tripDates} defaultOpen={search.assumed && !PHONE_V2} /> : <Meta items={[`${block.nights} night${block.nights > 1 ? "s" : ""}`, `${prettyDate(block.checkin)} – ${prettyDate(block.checkout)}`]} />}
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
                    transition={{ duration: 0.4, ease, delay: live && search.searched ? Math.min(hotelIndex, 6) * 0.05 : 0 }}
                    className={preview ? cn(cardWidth(visible.length), "shrink-0 snap-start") : undefined}
                    // Same dates the panel will ask for, so its load is already under way (or done) by the click.
                    onPointerEnter={onOpenStay && hotel.hotelId ? () => prefetchStayDetails(tripId, hotel.hotelId, { checkin: dates.checkin, checkout: dates.checkout, adults: dates.adults }) : undefined}
                    onFocusCapture={onOpenStay && hotel.hotelId ? () => prefetchStayDetails(tripId, hotel.hotelId, { checkin: dates.checkin, checkout: dates.checkout, adults: dates.adults }) : undefined}
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
