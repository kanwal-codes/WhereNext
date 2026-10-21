"use client";

import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Heart } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { CityChips } from "@/components/CityChips";
import { useTripCity } from "@/lib/client/use-trip-city";
import { AiSearchBar } from "@/components/AiSearchBar";
import { useTripPanelMaybe } from "@/components/TripPanelProvider";
import { useShowMore } from "@/lib/use-show-more";
import { CATEGORY_BY_KEY } from "./discoverTaxonomy";
import { useDiscoverFeed } from "../application/useDiscoverFeed";
import { useSavedPlaces } from "../application/useSavedPlaces";
import { flatFeed, interestTerms, interestsKeyOf, type Item } from "../domain/discover";
import { cn } from "@/lib/utils";
import { CategoryStrip, PhoneDiscoverBar, SubTypeRow } from "./DiscoverBars";
import { DiscoverFeed } from "./DiscoverFeed";
import { CityPill } from "@/components/CityPill";
import { PHONE_ROUND, useSetPhoneHeader } from "@/components/shell/PhoneHeader";
import { useMediaQuery } from "@/lib/use-media-query";


export function DiscoverTabs({ view, onChange, savedCount }: { view: "results" | "saved"; onChange: (v: "results" | "saved") => void; savedCount: number }) {
  return (
    <SegmentedSwitch
      label="Discover view"
      value={view}
      onChange={onChange}
      options={[
        { key: "results", label: "Discover" },
        { key: "saved", label: `Saved (${savedCount})` },
      ]}
    />
  );
}

export function DiscoverySurface({
  tripId,
  initialSaved,
  initialQuery,
  view,
  onViewChange,
  onSavedCountChange,
}: {
  tripId: string;
  initialSaved?: Array<Record<string, unknown>>;
  initialQuery?: string;
  view: "results" | "saved";
  onViewChange: (v: "results" | "saved") => void;
  onSavedCountChange?: (n: number) => void;
}) {
  const { data } = useTripData();
  const panelCtx = useTripPanelMaybe();
  const narrow = useMediaQuery("(max-width: 1023.98px)");
  const phone = narrow;
  const [filtersOpen, setFiltersOpen] = useState(false);
  // A multi-city trip shows one city at a time (the one the group is in, or the one picked); a one-city trip is just its destination.
  const cities = useTripCity(data?.trip);
  const destination = cities.hasChoice ? cities.city : (data?.trip.destination?.trim() ?? "");
  // Phone redesign: the city is the pill in the middle of the header, and Saved is the heart at its right edge (no Discover | Saved switch).
  const cityLabel = (cities.hasChoice ? cities.city : destination).split(",")[0].trim();
  const headerTitle = useMemo(() => (phone && cityLabel ? <CityPill stops={cities.stops} city={cityLabel} onPick={cities.setCity} /> : undefined), [phone, cityLabel, cities.stops, cities.setCity]);
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const interestsKey = interestsKeyOf(prefs);
  const interests = useMemo(() => interestTerms(interestsKey), [interestsKey]);

  const { saved } = useSavedPlaces({ tripId, initialSaved, onSavedCountChange });
  const headerHeart = useMemo(
    () => phone ? (
      <button
        type="button"
        onClick={() => onViewChange(view === "saved" ? "results" : "saved")}
        aria-pressed={view === "saved"}
        aria-label={view === "saved" ? "Back to ideas" : `Saved places${saved.length ? `, ${saved.length}` : ""}`}
        className={cn(PHONE_ROUND, "relative", view === "saved" && "border-foreground bg-foreground text-background")}
      >
        <Heart className={cn("size-[1.2rem]", view === "saved" && "fill-current")} />
        {view !== "saved" && saved.length > 0 && <span aria-hidden className="absolute top-2 right-2 size-2.5 rounded-full bg-coral ring-2 ring-background" />}
      </button>
    ) : undefined,
    [phone, view, saved.length, onViewChange],
  );
  useSetPhoneHeader({ titleNode: headerTitle, trailing: headerHeart });

  const feed = useDiscoverFeed({
    tripId, destination, cities, view, data, prefs, saved, interests, interestsKey, initialQuery,
  });
  const { catKey, subs, setSubs, searchLabel, searchMode, bands, items, loading, message, eventsBusy, moreEvents, pickCategory, applyDirective, toggleSub, loadMoreEvents } = feed;
  const activeCat = catKey ? CATEGORY_BY_KEY.get(catKey) ?? null : null;
  const gridView = view === "saved" || searchMode || catKey !== null;
  const savedItems: Item[] = saved.map((p) => ({ kind: "place", place: p }));
  const gridItems = view === "saved" ? savedItems : items;
  // Reset the reveal only when the list itself changes — not when `saved` re-fetches under us.
  const gridMore = useShowMore(gridItems.length, view === "saved" ? `saved:${saved.length}` : items);
  // ---- Phone redesign: ask field, one chip row with a filter button, a wide first result, then two to a row. ----
  const phoneFlat = useMemo(() => flatFeed(bands), [bands]);
  const phoneItems = view === "saved" ? savedItems : gridView ? items : phoneFlat;
  // The "All" feed pages too: a first screenful of everything, then "Show more", like each category does.
  const flatMore = useShowMore(phoneFlat.length, phoneFlat, { first: 9, step: 9 });
  const phoneMore = view === "saved" || gridView ? gridMore : flatMore;
  const phoneShown = phoneItems.slice(0, phoneMore.visible);
  const askQuery = searchLabel || activeCat?.label || "";
  const filterCount = subs.length + (panelCtx?.compareMode ? 1 : 0);


  return (
    <div className={cn("@container flex min-h-[calc(100svh-13rem)] flex-col", "max-lg:pb-24")}>
      {view === "results" && !phone && <CityChips stops={cities.stops} current={cities.city} onPick={cities.setCity} estimated={cities.estimated} className="mt-3 -mb-1" />}
      {phone && view === "results" && (
        <PhoneDiscoverBar feed={feed} panelCtx={panelCtx} activeCat={activeCat} filtersOpen={filtersOpen} setFiltersOpen={setFiltersOpen} filterCount={filterCount} phone={phone} />
      )}
      {phone && view === "saved" && (
        <h2 className="pt-2 font-display text-title leading-tight font-medium tracking-[-0.03em]">Saved places <span className="ml-1 text-lg text-muted-foreground tabular-nums">{saved.length}</span></h2>
      )}

      {view === "results" && !phone && (!searchMode || panelCtx || searchLabel) && (
        <CategoryStrip feed={feed} panelCtx={panelCtx} />
      )}
      {/* Tier 2 — sub-types for the active category. One row, scrolls sideways. */}
      <AnimatePresence initial={false}>
        {view === "results" && !phone && activeCat && activeCat.subs.length > 0 && <SubTypeRow activeCat={activeCat} subs={subs} toggleSub={toggleSub} setSubs={setSubs} />}
      </AnimatePresence>

      {message && <p className="mt-3 text-xs text-muted-foreground max-lg:hidden">{message}</p>}

      {/* Feed: each state (skeleton, grid, digest) crossfades into the next. */}
      <div className="relative">
        <DiscoverFeed tripId={tripId} view={view} phone={phone} destination={destination} activeCat={activeCat} askQuery={askQuery} feed={feed} gridView={gridView} gridItems={gridItems} gridMore={gridMore} phoneItems={phoneItems} phoneShown={phoneShown} phoneMore={phoneMore} />
      </div>

      {/* Last in the column so it can rest on the bottom edge of the page (see `.ask-dock`). On a phone it is the same floating bar, with a shorter prompt. */}
      {(!phone || view === "results") && <AiSearchBar
        variant="dock"
        tripId={tripId}
        scope="discover"
        placeholder={phone ? "Ask Roam about places" : destination ? `Ask — “rooftop bars near ${destination.split(",")[0].trim()}”, “kid-friendly museums”, “ramen”` : "Ask for places for this trip"}
        onDirective={applyDirective}
      />}
    </div>
  );
}
