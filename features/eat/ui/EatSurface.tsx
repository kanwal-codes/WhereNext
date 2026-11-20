"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, Check, Heart, SearchX, Utensils, WifiOff } from "lucide-react";
import { AiSearchBar } from "@/components/AiSearchBar";
import { CityPill } from "@/components/CityPill";
import { FilterPills, type FilterPill } from "@/components/FilterPills";
import { PlaceCard } from "@/components/PlaceCard";
import { Sheet } from "@/components/motion-primitives";
import { sheetPrimary } from "@/components/motion/sheetActions";
import { PHONE_ROUND, useSetPhoneHeader } from "@/components/shell/PhoneHeader";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { StateMessage, stateButton } from "@/components/StateMessage";
import { SkeletonBand } from "@/components/Skeleton";
import { useTripData } from "@/components/TripDataProvider";
import { applyEatView, activeEatFilters, availableEat, DEFAULT_EAT_VIEW, dollars, EAT_SORTS, RATING_STEPS, type EatView } from "@/features/eat/domain/eat-view";
import { useDiscoverFeed } from "@/features/places/application/useDiscoverFeed";
import { useSavedPlaces } from "@/features/places/application/useSavedPlaces";
import { CATEGORY_BY_KEY } from "@/features/places/ui/discoverTaxonomy";
import { interestTerms, interestsKeyOf, type Item } from "@/features/places/domain/discover";
import { useTripCity } from "@/lib/client/use-trip-city";
import { useMediaQuery } from "@/lib/use-media-query";
import { useShowMore } from "@/lib/use-show-more";
import { cn } from "@/lib/utils";

const EAT = CATEGORY_BY_KEY.get("eat")!;
const toggled = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

/**
 * Eat, as a page of its own: Discover's "Eat & Drink" search with the screen laid out as Stay and Flights are. The place in the header, a row of pills
 * (Filters, Open now, Sort, Type, Price, Rating) that open small panels over the list, then the places as the same photo tiles Discover uses (the first one
 * wide). Saved places are the heart at the right of the header. The words follow docs/design/LANGUAGE.md.
 */
export function EatSurface({ tripId, view, onViewChange, onSavedCountChange }: { tripId: string; view: "results" | "saved"; onViewChange: (v: "results" | "saved") => void; onSavedCountChange?: (n: number) => void }) {
  const { data } = useTripData();
  const phone = useMediaQuery("(max-width: 1023.98px)");
  const cities = useTripCity(data?.trip);
  const destination = cities.scoped ? cities.city : (data?.trip.destination?.trim() ?? "");
  const cityLabel = (cities.area?.name ?? (cities.hasChoice ? cities.city : destination)).split(",")[0].trim();
  const refine = useMemo(() => (cities.broad ? { tripId, parent: cities.parent, activeStop: cities.stop?.city ?? cities.parent, area: cities.area, onPickArea: cities.setArea } : undefined), [cities.broad, tripId, cities.parent, cities.stop, cities.area, cities.setArea]);
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const interestsKey = interestsKeyOf(prefs);
  const interests = useMemo(() => interestTerms(interestsKey), [interestsKey]);
  const { saved } = useSavedPlaces({ tripId, initialSaved: data?.savedPlaces, onSavedCountChange });

  // The header: the place pill in the middle, Saved places as the heart at the right.
  const headerTitle = useMemo(() => (phone && cityLabel ? <CityPill stops={cities.stops} city={cityLabel} onPick={cities.setCity} refine={refine} /> : undefined), [phone, cityLabel, cities.stops, cities.setCity, refine]);
  const headerHeart = useMemo(
    () => phone ? (
      <button type="button" onClick={() => onViewChange(view === "saved" ? "results" : "saved")} aria-pressed={view === "saved"} aria-label={view === "saved" ? "Back to places to eat" : `Saved places${saved.length ? `, ${saved.length}` : ""}`} className={cn(PHONE_ROUND, "relative")}>
        <Heart className={cn("size-[1.2rem]", view === "saved" && "fill-current")} />
        {view !== "saved" && saved.length > 0 && <span aria-hidden className="absolute top-2 right-2 size-2.5 rounded-full bg-coral ring-2 ring-background" />}
      </button>
    ) : undefined,
    [phone, view, saved.length, onViewChange],
  );
  useSetPhoneHeader({ titleNode: headerTitle, trailing: headerHeart });

  const feed = useDiscoverFeed({ tripId, destination, cities, view, data, prefs, saved, interests, interestsKey, initialCatKey: "eat" });
  const { subs, toggleSub, setSubs, items, loading, message } = feed;

  const [eat, setEat] = useState<EatView>(DEFAULT_EAT_VIEW);
  const [sheet, setSheet] = useState(false);
  const places = useMemo(() => items.filter((i): i is Extract<Item, { kind: "place" }> => i.kind === "place"), [items]);
  const available = useMemo(() => availableEat(places), [places]);
  const shown = useMemo(() => applyEatView(places, eat), [places, eat]);
  const savedRows = useMemo(() => saved.map((place) => ({ place })), [saved]);
  const list = view === "saved" ? savedRows : shown;
  const more = useShowMore(list.length, view === "saved" ? `saved:${saved.length}` : shown, { first: 9, step: 9 });
  const visible = list.slice(0, more.visible);
  const filterCount = activeEatFilters(eat) + subs.length;
  const set = (patch: Partial<EatView>) => setEat((v) => ({ ...v, ...patch }));

  // The controls of each group, shared by the pills' panels and the sheet.
  const sortBody = (close?: () => void) => (
    <div className="grid grid-cols-2 gap-2">
      {EAT_SORTS.map((s) => <button key={s.id} type="button" onClick={() => { set({ sort: s.id }); close?.(); }} aria-pressed={eat.sort === s.id} className="btn-chip justify-center">{s.label}</button>)}
    </div>
  );
  const typeBody = () => (
    <div className="flex flex-wrap gap-2">
      {EAT.subs.map((s) => (
        <button key={s.label} type="button" onClick={() => toggleSub(s.label)} aria-pressed={subs.includes(s.label)} className="btn-chip gap-1.5">
          {subs.includes(s.label) && <Check className="size-3.5" aria-hidden />}{s.label}
        </button>
      ))}
    </div>
  );
  const priceBody = () => (
    <div className="grid grid-cols-4 gap-2">
      {available.prices.map((r) => <button key={r} type="button" onClick={() => set({ prices: toggled(eat.prices, r) })} aria-pressed={eat.prices.includes(r)} className="btn-chip justify-center">{dollars(r)}</button>)}
    </div>
  );
  const ratingBody = () => (
    <div className="flex flex-wrap gap-2">
      {RATING_STEPS.map((r) => <button key={r} type="button" onClick={() => set({ minRating: eat.minRating === r ? null : r })} aria-pressed={eat.minRating === r} className="btn-chip">{r}+</button>)}
    </div>
  );

  const pills: FilterPill[] = [
    ...(available.openNow ? [{ key: "open", label: "Open now", on: eat.openNow, onPress: () => set({ openNow: !eat.openNow }) }] : []),
    { key: "sort", label: `Sort: ${EAT_SORTS.find((s) => s.id === eat.sort)?.label}`, on: eat.sort !== "pick", title: "Sort by", body: sortBody },
    { key: "type", label: subs.length === 1 ? subs[0]! : subs.length > 1 ? `${subs.length} types` : "Type", on: subs.length > 0, title: "Type of place", body: typeBody, clear: () => setSubs([]) },
    ...(available.prices.length ? [{ key: "price", label: eat.prices.length ? [...eat.prices].sort().map(dollars).join(", ") : "Price", on: eat.prices.length > 0, title: "Price", body: priceBody, clear: () => set({ prices: [] }) }] : []),
    ...(available.ratings ? [{ key: "rating", label: eat.minRating !== null ? `${eat.minRating}+ stars` : "Rating", on: eat.minRating !== null, title: "Rating", body: ratingBody, clear: () => set({ minRating: null }) }] : []),
  ];

  const group = (title: string, children: ReactNode) => (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
  const clearAll = () => { setEat({ ...DEFAULT_EAT_VIEW, sort: eat.sort }); setSubs([]); };

  const tile = (row: { place: (typeof saved)[number]; why?: string | null }, mode: "feature" | "grid") => <PlaceCard key={row.place.providerId} tripId={tripId} place={row.place} why={row.why ?? undefined} phoneTile={mode} />;
  const empty = !loading && visible.length === 0;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  return (
    <div className="@container flex min-h-[calc(100svh-13rem)] flex-col gap-4 max-lg:pb-24">
      {view === "saved" ? (
        <h2 className="pt-2 font-display text-title leading-tight font-medium tracking-[-0.03em]">Saved places <span className="ml-1 text-lg text-muted-foreground tabular-nums">{saved.length}</span></h2>
      ) : places.length > 0 || loading ? (
        <FilterPills pills={pills} filterCount={filterCount} onFilters={() => setSheet(true)} className="pt-1" />
      ) : null}

      <div className="relative" aria-busy={loading}>
        {loading && visible.length === 0 ? (
          <SkeletonBand count={6} />
        ) : empty ? (
          view === "saved" ? (
            <StateMessage icon={Heart} title="No saved places yet" actions={<button type="button" onClick={() => onViewChange("results")} className={stateButton.primary}>Find places to eat</button>}>
              Tap the heart on a place to keep it here.
            </StateMessage>
          ) : !destination ? (
            <StateMessage icon={Utensils} title="Where are you going?" actions={<Link href={`/trips/${tripId}`} className={stateButton.primary}>Open the trip</Link>}>
              Add a destination to this trip and the places to eat appear here.
            </StateMessage>
          ) : feed.error ? (
            <StateMessage icon={offline ? WifiOff : AlertCircle} title={offline ? "You’re offline" : "We couldn’t load places"} actions={<button type="button" onClick={feed.retry} className={stateButton.primary}>Try again</button>}>
              {offline ? "Reconnect and the places will load." : "The problem is on our end, not with your search."}
            </StateMessage>
          ) : filterCount > 0 ? (
            <StateMessage icon={SearchX} title="No places match" actions={<button type="button" onClick={clearAll} className={stateButton.primary}>Clear filters</button>}>
              Loosen a filter to see more places.
            </StateMessage>
          ) : (
            <StateMessage icon={Utensils} title="No places to show" actions={<button type="button" onClick={feed.retry} className={stateButton.primary}>Try again</button>}>
              Nothing came back for {cityLabel || "this trip"}. Try a different type, or ask Roam.
            </StateMessage>
          )
        ) : phone ? (
          <div className="space-y-6">
            {tile(visible[0]!, "feature")}
            {visible.length > 1 && <div className="grid grid-cols-2 gap-x-3 gap-y-6">{visible.slice(1).map((r) => tile(r, "grid"))}</div>}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((r) => <PlaceCard key={r.place.providerId} tripId={tripId} place={r.place} why={("why" in r ? (r as { why?: string | null }).why : undefined) ?? undefined} />)}
          </div>
        )}
        {more.remaining > 0 && <ShowMoreButton next={more.next} visible={more.visible} total={list.length} onClick={more.showMore} noun="places" />}
      </div>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        side="bottom"
        ariaLabel="Sort and filter places"
        padded
        footer={shown.length === 0 ? <button type="button" onClick={clearAll} className={sheetPrimary}>No places match. Clear filters</button> : <button type="button" onClick={() => setSheet(false)} className={sheetPrimary}>Show {shown.length} {shown.length === 1 ? "place" : "places"}</button>}
      >
        <div className="flex items-baseline justify-between gap-3 pb-3 pt-1">
          <p className="font-display text-xl font-medium tracking-[-0.02em]">Sort and filter</p>
          {filterCount > 0 && <button type="button" onClick={clearAll} className="-my-2 -mr-2 rounded-full px-3 py-2 text-sm font-semibold text-ink-soft underline underline-offset-2 active:bg-muted">Clear all</button>}
        </div>
        <div className="scrollbar-slim -mx-1 min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-1 pb-1">
          {group("Sort by", sortBody())}
          {group("Type of place", typeBody())}
          {available.prices.length > 0 && group("Price", priceBody())}
          {available.ratings && group("Rating", ratingBody())}
          {available.openNow && (
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-muted px-4 py-3 text-body">
              <input type="checkbox" checked={eat.openNow} onChange={() => set({ openNow: !eat.openNow })} className="size-5 shrink-0 accent-primary" />
              Open now
            </label>
          )}
        </div>
      </Sheet>

      {view === "results" && (
        <AiSearchBar variant="dock" tripId={tripId} scope="discover" placeholder={phone ? "Ask Roam about places to eat" : cityLabel ? `Ask — “ramen near ${cityLabel}”, “a quiet brunch”, “vegan, under $30”` : "Ask Roam about places to eat"} onDirective={feed.applyDirective} />
      )}
    </div>
  );
}
