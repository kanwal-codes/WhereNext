"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Loader2, Scale, Search } from "lucide-react";
import type { Place } from "@/packages/contracts/place";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { PlaceCard } from "@/components/PlaceCard";
import { Stagger, StaggerItem } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

const MAX_COMPARE = 4;
const CATEGORY_TABS = ["all", "lodging", "restaurant", "tourist_attraction", "store", "park"] as const;
const TAB_LABEL: Record<(typeof CATEGORY_TABS)[number], string> = {
  all: "Everything",
  lodging: "Stays",
  restaurant: "Food",
  tourist_attraction: "Sights",
  store: "Shops",
  park: "Outdoors",
};

export function DiscoverySurface({ tripId, initialSaved }: { tripId: string; initialSaved?: Array<Record<string, unknown>> }) {
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const seedSaved = (initialSaved ?? []).map((item) => (item.places ?? item) as unknown as Place).filter((p) => p?.providerId);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [saved, setSaved] = useState<Place[]>(seedSaved);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"results" | "saved">(seedSaved.length && !initialSaved ? "saved" : "results");
  const [tab, setTab] = useState<(typeof CATEGORY_TABS)[number]>("all");

  useEffect(() => {
    fetch(`/api/trips/${tripId}/places`)
      .then((r) => r.json())
      .then((body) => setSaved((body.places ?? []).map((item: { places?: Place }) => item.places ?? item)))
      .catch(() => undefined);
  }, [tripId]);

  const savedIds = new Set(saved.map((p) => p.providerId));

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setMessage("");
    setView("results");
    try {
      const response = await fetch(`/api/trips/${tripId}/places?query=${encodeURIComponent(q)}`);
      const body = await response.json();
      setResults(body.places ?? []);
      setMessage(
        response.ok
          ? body.places?.length
            ? `${body.places.length} results${body.freshness ? ` · checked ${new Date(body.freshness.retrievedAt).toLocaleTimeString()}` : ""}`
            : "No places matched — try different words."
          : "Place search is unavailable right now.",
      );
    } catch {
      setMessage("Place search is unavailable right now.");
    } finally {
      setSearching(false);
    }
  }

  async function toggleSave(place: Place) {
    if (savedIds.has(place.providerId)) {
      setSaved((cur) => cur.filter((p) => p.providerId !== place.providerId));
      const response = await fetch(`/api/trips/${tripId}/places`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId: place.providerId }),
      });
      if (response.ok) announceWorkspaceChange("places");
      else setSaved((cur) => [...cur, place]);
      return;
    }
    setSaved((cur) => [...cur, place]);
    const response = await fetch(`/api/trips/${tripId}/places`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(place),
    });
    if (response.ok) announceWorkspaceChange("places");
    else {
      setSaved((cur) => cur.filter((p) => p.providerId !== place.providerId));
      setMessage(`${place.name} could not be saved.`);
    }
  }

  function toggleCompare(place: Place) {
    if (compareIds.includes(place.providerId)) setCompareIds((ids) => ids.filter((id) => id !== place.providerId));
    else if (compareIds.length < MAX_COMPARE) setCompareIds((ids) => [...ids, place.providerId]);
    else setMessage(`Compare up to ${MAX_COMPARE} at a time.`);
  }

  const list = (view === "saved" ? saved : results).filter((p) => tab === "all" || (p.category ?? "").includes(tab));

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        className="flex items-center gap-2 rounded-2xl border border-input bg-card px-3 py-2 shadow-soft focus-within:ring-2 focus-within:ring-ring/25"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search places for this trip — “ramen in Gion”, “temples near Arashiyama”"
          aria-label="Search places"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-border p-0.5 text-xs">
          {(["results", "saved"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn("rounded-full px-3 py-1 font-medium capitalize transition-colors", view === v ? "bg-primary text-primary-foreground" : "text-ink-soft")}
            >
              {v === "saved" ? `Saved (${saved.length})` : "Results"}
            </button>
          ))}
        </div>
        {CATEGORY_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              tab === t ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-background text-ink-soft hover:bg-accent",
            )}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
        {compareIds.length >= 2 && (
          <motion.a
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            href={`/trips/${tripId}/compare?ids=${encodeURIComponent(compareIds.join(","))}`}
            className="ml-auto inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground"
          >
            <Scale className="h-3.5 w-3.5" /> Compare {compareIds.length}
          </motion.a>
        )}
      </div>

      {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}

      {list.length > 0 ? (
        <Stagger className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((place) => (
            <StaggerItem key={place.providerId}>
              <PlaceCard
                tripId={tripId}
                place={place}
                saved={savedIds.has(place.providerId)}
                inCompare={compareIds.includes(place.providerId)}
                onSave={(p) => void toggleSave(p)}
                onCompare={toggleCompare}
              />
            </StaggerItem>
          ))}
        </Stagger>
      ) : (
        <p className="mt-8 rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
          {view === "saved"
            ? "Nothing saved yet. Search above, or ask the assistant for ideas."
            : "Search to discover places for this trip."}
        </p>
      )}
    </div>
  );
}
