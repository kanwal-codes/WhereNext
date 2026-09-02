"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, Loader2, Star, X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { PageHeader } from "@/components/PageHeader";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { categoryLabel, detailsToPlace, priceLabel, priceRank, type GooglePlaceDetails } from "@/lib/places-ui";
import { cn } from "@/lib/utils";

const ROWS = [
  { key: "category", label: "Type" },
  { key: "rating", label: "Rating" },
  { key: "price", label: "Price" },
  { key: "address", label: "Address" },
  { key: "hours", label: "Hours" },
  { key: "source", label: "Source" },
] as const;

function CompareInner({ tripId }: { tripId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ids = useMemo(
    () => (params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4),
    [params],
  );

  const [items, setItems] = useState<Record<string, GooglePlaceDetails | null>>({});
  const [loading, setLoading] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch(`/api/trips/${tripId}/places`)
      .then((r) => r.json())
      .then((b) => setSavedIds(new Set((b.places ?? []).map((p: { providerId?: string }) => p.providerId).filter(Boolean))))
      .catch(() => undefined);
  }, [tripId]);

  useEffect(() => {
    const missing = ids.filter((id) => !(id in items));
    if (missing.length === 0) return;
    setLoading(true);
    Promise.all(
      missing.map((id) =>
        fetch(`/api/trips/${tripId}/places/google?placeId=${encodeURIComponent(id)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((b) => [id, b?.place ?? null] as const)
          .catch(() => [id, null] as const),
      ),
    )
      .then((pairs) => setItems((cur) => ({ ...cur, ...Object.fromEntries(pairs) })))
      .finally(() => setLoading(false));
  }, [ids, items, tripId]);

  const setIds = useCallback(
    (next: string[]) => {
      const p = new URLSearchParams(params.toString());
      if (next.length) p.set("ids", next.join(","));
      else p.delete("ids");
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  async function choose(id: string, d: GooglePlaceDetails) {
    const place = detailsToPlace(d);
    if (!place) return;
    setSavedIds((cur) => new Set(cur).add(id));
    const r = await fetch(`/api/trips/${tripId}/places`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(place),
    });
    if (r.ok) {
      announceWorkspaceChange("places");
      setNotice(`${place.name} saved to the trip.`);
    } else {
      setSavedIds((cur) => {
        const n = new Set(cur);
        n.delete(id);
        return n;
      });
      setNotice("Could not save that one.");
    }
  }

  const present = ids.map((id) => [id, items[id]] as const).filter(([, d]) => d);

  if (ids.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <h3 className="font-display text-lg">Nothing to compare yet</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Pick two to four places from{" "}
          <Link href={`/trips/${tripId}/discover`} className="font-medium text-primary">
            Discover
          </Link>
          , or ask the assistant to &ldquo;compare these&rdquo;.
        </p>
      </div>
    );
  }

  if (loading && present.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        <p className="mt-3">Loading comparison…</p>
      </div>
    );
  }

  const rated = present.filter(([, d]) => typeof d!.rating === "number");
  const bestRating = rated.length ? Math.max(...rated.map(([, d]) => d!.rating as number)) : -1;
  const bestPrice = Math.min(...present.map(([, d]) => priceRank(d!.priceLevel)));

  const cell = (id: string, d: GooglePlaceDetails, key: (typeof ROWS)[number]["key"]) => {
    switch (key) {
      case "category":
        return categoryLabel(d.primaryType);
      case "rating":
        return typeof d.rating === "number" ? (
          <span className="inline-flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 fill-current text-coral" />
            {d.rating.toFixed(1)}
            {d.rating === bestRating && (
              <span className="rounded-full bg-coral-soft px-2 py-0.5 text-[10px] font-medium text-coral">Best rated</span>
            )}
          </span>
        ) : (
          "—"
        );
      case "price":
        return (
          <span className="inline-flex items-center gap-2">
            {priceLabel(d.priceLevel) ?? "—"}
            {priceLabel(d.priceLevel) && priceRank(d.priceLevel) === bestPrice && (
              <span className="rounded-full bg-leaf-soft px-2 py-0.5 text-[10px] font-medium text-leaf">Lowest</span>
            )}
          </span>
        );
      case "address":
        return d.formattedAddress ?? "—";
      case "hours":
        return d.regularOpeningHours?.weekdayDescriptions?.[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] ?? "See listing";
      case "source":
        return d.googleMapsUri ? (
          <a href={d.googleMapsUri} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-primary">
            Google Maps <ArrowUpRight className="h-3 w-3" />
          </a>
        ) : (
          "Google Places"
        );
    }
  };

  return (
    <>
      {notice && <p className="mb-3 text-xs text-leaf">{notice}</p>}
      <div className="overflow-x-auto scrollbar-slim">
        <div
          className="grid min-w-[640px] gap-x-4"
          style={{ gridTemplateColumns: `130px repeat(${present.length}, minmax(190px, 1fr))` }}
        >
          <div />
          <AnimatePresence initial={false}>
            {present.map(([id, d]) => (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                className="relative rounded-2xl border border-border bg-card p-3"
              >
                <button
                  onClick={() => setIds(ids.filter((x) => x !== id))}
                  aria-label={`Remove ${d!.displayName?.text ?? "place"} from comparison`}
                  className="absolute top-2 right-2 rounded-full bg-background/90 p-1.5 backdrop-blur"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <Link href={`/trips/${tripId}/place/${encodeURIComponent(id)}`} className="block pr-6 font-display text-base leading-tight hover:text-primary">
                  {d!.displayName?.text ?? "Place"}
                </Link>
                <button
                  onClick={() => void choose(id, d!)}
                  disabled={savedIds.has(id)}
                  className={cn(
                    "mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    savedIds.has(id) ? "border-leaf/40 bg-leaf-soft text-leaf" : "border-border hover:bg-accent",
                  )}
                >
                  {savedIds.has(id) ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> On the trip
                    </>
                  ) : (
                    "Choose this"
                  )}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {ROWS.map((row, i) => (
            <div key={row.key} className="col-span-full grid grid-cols-subgrid">
              <div className={cn("py-3 text-[11px] tracking-[0.1em] text-muted-foreground uppercase", i === 0 && "mt-4")}>{row.label}</div>
              {present.map(([id, d]) => (
                <div key={id + row.key} className={cn("border-t border-border py-3 text-sm leading-relaxed", i === 0 && "mt-4")}>
                  {cell(id, d!, row.key)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function ComparePage() {
  const { tripId } = useTripData();
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <PageHeader
        eyebrow="Compare"
        title="Side by side, so you can decide"
        description="Two to four places, aligned on what matters: rating, price, hours and where the data came from."
      />
      <div className="mt-7">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <CompareInner tripId={tripId} />
        </Suspense>
      </div>
    </div>
  );
}
