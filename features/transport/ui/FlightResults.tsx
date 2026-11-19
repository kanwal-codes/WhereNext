"use client";

import { useMemo } from "react";
import { Sheet } from "@/components/motion-primitives";
import { SheetHeader } from "@/components/SheetHeader";
import { sheetPrimary } from "@/components/motion/sheetActions";
import type { FlightOffer as WidgetOffer } from "@/components/TripPanelProvider";
import { textAction } from "@/features/conversation/ui/blocks/ui";
import { FlightJourney, FlightPicks, FlightRowBody, offerKey, pickFares } from "@/features/conversation/ui/blocks/FlightWidget";
import { arrangeFlights, fitsTime } from "@/lib/application/travel-time";
import { cn } from "@/lib/utils";
import type { useTransportSearch } from "../application/useTransportSearch";
import { flightSaveValue, flightPrice, type Flight } from "../domain/route-view";

/** A search result in the shape Roam's flight widget draws (the same fares; only the price fields are named differently). */
export const asWidget = (f: Flight): WidgetOffer => ({ ...f, id: f.id, price: f.priceAmount, currency: f.priceCurrency, listedPrice: f.listedAmount }) as WidgetOffer;

const allowsChanges = (o: Flight) => Boolean(o.fareConditions?.some((c) => /changes? allowed/i.test(c) && !/not allowed/i.test(c)));

/**
 * The Flights tab, drawn like Roam's flight widget: the three picks (Best, Cheapest, Fastest) on top, then every fare as a row with its times,
 * stops and price. Taking a pick or a row opens the whole journey in a bottom sheet (each flight, each wait, the fare's terms) with Save to my
 * trip. The sort and the filters that would change the list are the pills under the switch, in ResultPills.
 */
export function FlightResults({ t }: { t: ReturnType<typeof useTransportSearch> }) {
  const { flights, tab, flightsLoading, when, sort, nonstopOnly, changesOnly, airport, anyTime, setAnyTime, openFlight, setOpenFlight, returnDate, saveChoice } = t;
  const onTime = flights.filter((f) => anyTime || fitsTime(f, when));
  const shown = useMemo(
    () => arrangeFlights(onTime, sort, nonstopOnly).filter((f) => (!changesOnly || allowsChanges(f)) && (!airport || f.destinationAirport === airport)),
    [onTime, sort, nonstopOnly, changesOnly, airport],
  );
  const offers = useMemo(() => shown.map(asWidget), [shown]);
  const picks = useMemo(() => pickFares(offers), [offers]);
  const roundTrip = Boolean(returnDate) || flights.some((f) => f.returnLegs?.length);
  const cheapest = picks.find((p) => p.labels.includes("Cheapest"))?.offer;
  const index = Math.max(0, offers.findIndex((o) => offerKey(o) === openFlight));
  const opened = openFlight && offers.length ? offers[index] : null;
  const openedFlight = opened ? shown[index] : null;
  const labelsOf = (o: WidgetOffer) => picks.find((p) => p.offer === o)?.labels ?? [];

  return (
    <>
      {tab === "flight" && !flightsLoading && flights.length > 0 && (
        <div className="space-y-3">
          {when && !anyTime && onTime.length < flights.length && (
            <p className="text-xs text-muted-foreground">
              Showing flights {when.kind === "depart" ? "leaving after" : "landing by"} {when.time}.{" "}
              <button type="button" onClick={() => setAnyTime(true)} className={cn(textAction, "text-xs underline")}>
                Show all {flights.length}
              </button>
            </p>
          )}
          {shown.length === 0 && <p className="rounded-2xl bg-surface px-4 py-5 text-sm leading-relaxed text-ink-soft">No flights match those filters. Try another time, or turn a filter off.</p>}
        </div>
      )}

      {tab === "flight" && !flightsLoading && shown.length > 0 && (
        <div className="space-y-4">
          <FlightPicks picks={picks} selected={openFlight} onSelect={setOpenFlight} />
          <ul className="space-y-3" aria-label="Flights">
            {offers.map((offer) => {
              const key = offerKey(offer);
              return (
                <li key={key} className="rounded-2xl bg-card ring-1 ring-border transition-shadow hover:ring-input">
                  <button type="button" onClick={() => setOpenFlight(key)} aria-haspopup="dialog" aria-label={`${offer.airline}, ${flightPrice(shown[offers.indexOf(offer)])}`} className="block w-full rounded-2xl p-4 text-left">
                    <FlightRowBody offer={offer} cheapest={shown.length > 1 && offer === cheapest} onDetails={() => {}} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Sheet open={tab === "flight" && opened != null} onClose={() => setOpenFlight(null)} side="bottom" ariaLabel="Flight details" footerClassName="px-4" footer={opened && openedFlight ? (<>
              <button type="button" onClick={() => void saveChoice(flightSaveValue(openedFlight, flightPrice(openedFlight)))} className={sheetPrimary}>
                Save to my trip
              </button>
</>) : undefined} className="icons-fine px-0 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {opened && openedFlight && (
          <>
            <SheetHeader eyebrow="Flight" title={[opened.originAirport, opened.destinationAirport].filter(Boolean).join(" → ") || opened.airline} onClose={() => setOpenFlight(null)} />
            <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <FlightJourney offer={opened} labels={labelsOf(opened)} roundTrip={roundTrip} />
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
