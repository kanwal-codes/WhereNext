"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Heart, Utensils, X } from "lucide-react";
import { AiSearchBar } from "@/components/AiSearchBar";
import { AnswerSkeleton, AnswerText } from "@/components/AnswerText";
import { CityPill } from "@/components/CityPill";
import { PlaceCard } from "@/components/PlaceCard";
import { PHONE_ROUND, useSetPhoneHeader } from "@/components/shell/PhoneHeader";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { StateMessage, stateButton } from "@/components/StateMessage";
import { SkeletonBand } from "@/components/Skeleton";
import { useTripData } from "@/components/TripDataProvider";
import { TripFrostedGround, tripStickyRow, useTripStickyRow } from "@/components/StickyBar";
import { EatFilters } from "@/features/eat/ui/EatFilters";
import { EatFailedState, EatNoMatchState, EatResults } from "@/features/eat/ui/EatResults";
import { applyEatView, activeEatFilters, availableEat, DEFAULT_EAT_VIEW, type EatView } from "@/features/eat/domain/eat-view";
import { useDiscoverFeed } from "@/features/places/application/useDiscoverFeed";
import { useSavedPlaces } from "@/features/places/application/useSavedPlaces";
import { interestTerms, interestsKeyOf, type Item } from "@/features/places/domain/discover";
import { useTripCity } from "@/lib/client/use-trip-city";
import { useMediaQuery } from "@/lib/use-media-query";
import { useShowMore } from "@/lib/use-show-more";
import { cn } from "@/lib/utils";


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

  const feed = useDiscoverFeed({ tripId, destination, cities, view, data, prefs, saved, interests, interestsKey, initialCatKey: "eat", withPrice: true });
  const { subs, toggleSub, setSubs, items, loading, message } = feed;

  const [eat, setEat] = useState<EatView>(DEFAULT_EAT_VIEW);
  const { rowRef, stuck } = useTripStickyRow();
  // The model's short answer to the last ask, above the places; it belongs to the city and the types it was asked with.
  const [answer, setAnswer] = useState<string | null>(null);
  // An ask is on its way: the answer and the places show as loading until it comes back.
  const [asking, setAsking] = useState(false);
  // While a search is on (an ask, or a search by words) the heart becomes a cross that puts the tab back as it started.
  const searchActive = view === "results" && (Boolean(answer) || feed.searchMode || Boolean(feed.searchLabel));
  const cancelRef = useRef<() => void>(() => undefined);
  cancelRef.current = () => { feed.pickCategory("eat"); setAnswer(null); setEat(DEFAULT_EAT_VIEW); window.scrollTo(0, 0); };
  const headerHeart = useMemo(
    () => phone && searchActive ? (
      <button type="button" onClick={() => cancelRef.current()} aria-label="Clear the search" className={PHONE_ROUND}><X className="size-[1.2rem]" /></button>
    ) : phone ? (
      <button type="button" onClick={() => onViewChange(view === "saved" ? "results" : "saved")} aria-pressed={view === "saved"} aria-label={view === "saved" ? "Back to places to eat" : `Saved places${saved.length ? `, ${saved.length}` : ""}`} className={cn(PHONE_ROUND, "relative")}>
        <Heart className={cn("size-[1.2rem]", view === "saved" && "fill-current")} />
        {view !== "saved" && saved.length > 0 && <span aria-hidden className="absolute top-2 right-2 size-2.5 rounded-full bg-coral ring-2 ring-background" />}
      </button>
    ) : undefined,
    [phone, searchActive, view, saved.length, onViewChange],
  );
  useSetPhoneHeader({ titleNode: headerTitle, trailing: headerHeart });
  const [sheet, setSheet] = useState(false);
  const places = useMemo(() => items.filter((i): i is Extract<Item, { kind: "place" }> => i.kind === "place"), [items]);
  const available = useMemo(() => availableEat(places), [places]);
  const shown = useMemo(() => applyEatView(places, eat), [places, eat]);
  const savedRows = useMemo(() => saved.map((place) => ({ place })), [saved]);
  const list = view === "saved" ? savedRows : shown;
  const more = useShowMore(list.length, view === "saved" ? `saved:${saved.length}` : shown, { first: 9, step: 9 });
  const visible = list.slice(0, more.visible);
  const filterCount = activeEatFilters(eat) + subs.length;

  const clearAll = () => { setEat({ ...DEFAULT_EAT_VIEW, sort: eat.sort }); setSubs([]); setAnswer(null); };
  useEffect(() => { setAnswer(null); }, [cityLabel]);

  const tile = (row: { place: (typeof saved)[number]; why?: string | null }, mode: "feature" | "grid") => <PlaceCard key={row.place.providerId} tripId={tripId} place={row.place} why={row.why ?? undefined} phoneTile={mode} />;
  const empty = !loading && visible.length === 0;
  const emptyState = view === "saved" ? (
            <StateMessage icon={Heart} title="No saved places yet" actions={<button type="button" onClick={() => onViewChange("results")} className={stateButton.primary}>Find places to eat</button>}>
              Tap the heart on a place to keep it here.
            </StateMessage>
  ) : !destination ? (
            <StateMessage icon={Utensils} title="Where are you going?" actions={<Link href={`/trips/${tripId}`} className={stateButton.primary}>Open the trip</Link>}>
              Add a destination to this trip and the places to eat appear here.
            </StateMessage>
  ) : feed.error ? (
    <EatFailedState onRetry={feed.retry} />
  ) : filterCount > 0 ? (
    <EatNoMatchState onClear={clearAll} />
  ) : (
            <StateMessage icon={Utensils} title="No places to show" actions={<button type="button" onClick={feed.retry} className={stateButton.primary}>Try again</button>}>
              Nothing came back for {cityLabel || "this trip"}. Try a different type, or ask Roam.
            </StateMessage>
  );

  return (
    <div className="@container flex min-h-[calc(100svh-13rem)] flex-col gap-4 max-lg:pb-24">
      <TripFrostedGround stuck={stuck} />
      {view === "results" && (asking ? <AnswerSkeleton /> : answer && <AnswerText body={answer} />)}
      {view === "saved" ? (
        <h2 className="pt-2 font-display text-title leading-tight font-medium tracking-[-0.03em]">Saved places <span className="ml-1 text-lg text-muted-foreground tabular-nums">{saved.length}</span></h2>
      ) : null}
      <EatFilters eat={eat} onChange={setEat} subs={subs} onToggleSub={toggleSub} onClearSubs={() => setSubs([])} available={available} shown={shown.length} showPills={view !== "saved" && (places.length > 0 || loading)} sheetOpen={sheet} onSheetOpen={setSheet} rowRef={rowRef} rowClassName={cn("pt-1", tripStickyRow(stuck).className)} rowStyle={tripStickyRow(stuck).style} />

      {phone ? (
        <EatResults
          busy={loading}
          skeleton={asking || loading}
          empty={empty ? emptyState : undefined}
          first={visible.length > 0 ? tile(visible[0]!, "feature") : undefined}
          rest={visible.slice(1).map((r) => tile(r, "grid"))}
          footer={more.remaining > 0 && <ShowMoreButton next={more.next} visible={more.visible} total={list.length} onClick={more.showMore} noun="places" />}
        />
      ) : (
        <div className="relative" aria-busy={loading}>
          {asking || (loading && visible.length === 0) ? <SkeletonBand count={6} /> : empty ? emptyState : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((r) => <PlaceCard key={r.place.providerId} tripId={tripId} place={r.place} why={("why" in r ? (r as { why?: string | null }).why : undefined) ?? undefined} />)}
            </div>
          )}
          {more.remaining > 0 && <ShowMoreButton next={more.next} visible={more.visible} total={list.length} onClick={more.showMore} noun="places" />}
        </div>
      )}

      {view === "results" && (
        <AiSearchBar onPendingChange={setAsking} variant="dock" tripId={tripId} scope="discover" wantAnswer place={cityLabel || undefined} placeholder={phone ? "Ask Roam about places to eat" : cityLabel ? `Ask — “ramen near ${cityLabel}”, “a quiet brunch”, “vegan, under $30”` : "Ask Roam about places to eat"} onDirective={(d, raw) => { feed.applyDirective(d, raw); setAnswer(d.answer?.trim() || null); }} />
      )}
    </div>
  );
}
