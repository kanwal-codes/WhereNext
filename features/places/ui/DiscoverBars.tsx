"use client";

import { AnimatePresence, motion } from "motion/react";
import { SlidersHorizontal, X } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { sheetPrimary } from "@/components/motion/sheetActions";
import type { useTripPanelMaybe } from "@/components/TripPanelProvider";
import { cn } from "@/lib/utils";
import type { useDiscoverFeed } from "../application/useDiscoverFeed";
import { CATEGORIES, type CATEGORY_BY_KEY } from "./discoverTaxonomy";

type Feed = ReturnType<typeof useDiscoverFeed>;
type PanelCtx = ReturnType<typeof useTripPanelMaybe>;
type Category = NonNullable<ReturnType<(typeof CATEGORY_BY_KEY)["get"]>>;

/** On a phone: one chip row (All, the categories, or the search being shown) with a filter button; the filters and Compare open in a bottom sheet. */
export function PhoneDiscoverBar({ feed, panelCtx, activeCat, filtersOpen, setFiltersOpen, filterCount, phone }: {
  feed: Feed;
  panelCtx: PanelCtx;
  activeCat: Category | null;
  filtersOpen: boolean;
  setFiltersOpen: (update: (open: boolean) => boolean) => void;
  filterCount: number;
  phone: boolean;
}) {
  const { catKey, subs, setSubs, searchLabel, setSearchLabel, searchMode, setSearchMode, pickCategory, toggleSub } = feed;
  const chips = (
    <div className="flex flex-wrap gap-2 pb-1">
      {panelCtx && (
        <button type="button" onClick={() => { panelCtx.setCompareMode(!panelCtx.compareMode); panelCtx.compareClear(); }} aria-pressed={panelCtx.compareMode} className="btn-chip">
          {panelCtx.compareMode ? `Comparing · ${panelCtx.compareList.length}` : "Compare places"}
        </button>
      )}
      {activeCat?.subs.map((s) => (
        <button key={s.label} type="button" onClick={() => toggleSub(s.label)} aria-pressed={subs.includes(s.label)} className="btn-chip">{s.label}</button>
      ))}
      {subs.length > 0 && <button type="button" onClick={() => setSubs([])} className="px-2 text-sm text-ink-soft">Clear</button>}
    </div>
  );
  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="flex items-center gap-2">
        <div className="-mr-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain pr-6 no-scrollbar [mask-image:linear-gradient(to_right,#000_88%,transparent)]">
          {searchMode && searchLabel ? (
            <button type="button" onClick={() => { setSearchMode(false); setSearchLabel(""); pickCategory(null); }} aria-label={`Clear search: ${searchLabel}`} className="btn-chip max-w-[16rem] shrink-0">
              <span className="truncate">{searchLabel}</span> <X className="size-3.5 shrink-0" aria-hidden />
            </button>
          ) : (
            <>
              <button type="button" onClick={() => pickCategory(null)} aria-pressed={catKey === null} className="btn-chip shrink-0">All</button>
              {CATEGORIES.map((c) => {
                const on = catKey === c.key;
                return (
                  <button key={c.key} type="button" onClick={() => pickCategory(on ? null : c.key)} aria-pressed={on} className="btn-chip shrink-0">
                    {c.label}
                  </button>
                );
              })}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-pressed={filtersOpen}
          aria-label={filterCount ? `Filters and compare, ${filterCount} on` : "Filters and compare"}
          className={cn("relative grid size-11 shrink-0 place-items-center rounded-full border border-input bg-background transition-colors", "max-lg:border-0 max-lg:bg-muted", filtersOpen && "border-foreground bg-foreground text-background", filtersOpen && "max-lg:bg-foreground")}
        >
          <SlidersHorizontal className="size-[1.125rem]" aria-hidden />
          {filterCount > 0 && !filtersOpen && <span aria-hidden className="absolute top-2 right-2 size-2.5 rounded-full bg-coral ring-2 ring-background" />}
        </button>
      </div>
      {/* A phone gets a bottom sheet, like every other set of options in the app (a popover over the feed is a card nobody else uses); a wide screen keeps the row that unfolds under the chips. */}
      {phone ? (
        <Sheet open={filtersOpen} onClose={() => setFiltersOpen(() => false)} ariaLabel="Compare and filter" padded footer={<button type="button" onClick={() => setFiltersOpen(() => false)} className={sheetPrimary}>Done</button>}>
          <p className="px-1 pb-3 pt-1 font-display text-xl font-medium tracking-[-0.02em]">Compare and filter</p>
          <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">{chips}</div>
        </Sheet>
      ) : (
        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              {chips}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

/** On a wide screen: Compare, the search chip that clears it, and the broad categories. One row, scrolls sideways. */
export function CategoryStrip({ feed, panelCtx }: { feed: Feed; panelCtx: PanelCtx }) {
  const { catKey, searchLabel, setSearchLabel, searchMode, setSearchMode, pickCategory } = feed;
  return (
    <div className="mt-4 flex items-center gap-2 overflow-x-auto overscroll-x-contain scrollbar-slim px-1 py-1">
        {panelCtx && (
          <button
            type="button"
            onClick={() => {
              panelCtx.setCompareMode(!panelCtx.compareMode);
              panelCtx.compareClear();
            }}
            aria-pressed={panelCtx.compareMode}
            className="btn-chip shrink-0"
          >
            {panelCtx.compareMode ? `Comparing · ${panelCtx.compareList.length}` : "Compare"}
          </button>
        )}
        {/* What the search resolved to, as a chip that clears it: the one way back to the digest while the category chips are away. */}
        {searchMode && searchLabel && (
          <button
            type="button"
            onClick={() => { setSearchMode(false); setSearchLabel(""); pickCategory(null); }}
            aria-label={`Clear search: ${searchLabel}`}
            className="btn-chip max-w-[18rem] shrink-0"
          >
            <span className="truncate">{searchLabel}</span> <X className="size-3.5 shrink-0" aria-hidden />
          </button>
        )}
        {/* The category chips narrow the digest, so they mean nothing beside a search's own results: the strip keeps only Compare until the search is cleared. */}
        <AnimatePresence initial={false}>
          {!searchMode && (
            <motion.div key="categories" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }} className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => pickCategory(null)}
                aria-pressed={!searchMode && catKey === null}
                className="btn-chip shrink-0"
              >
                All
              </button>
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const on = !searchMode && catKey === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    // Pressing the chosen category again lets go of it: back to the whole digest.
                    onClick={() => pickCategory(on ? null : c.key)}
                    aria-pressed={on}
                    className="btn-chip shrink-0"
                  >
                    <Icon className="size-3.5" /> {c.label}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
}

/** The sub-types of the chosen category (and a Clear), as one sideways row. Rendered inside an AnimatePresence. */
export function SubTypeRow({ activeCat, subs, toggleSub, setSubs }: { activeCat: Category; subs: string[]; toggleSub: (label: string) => void; setSubs: (subs: string[]) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="mt-3 flex gap-1.5 overflow-x-auto overscroll-x-contain scrollbar-slim pb-1">
        {activeCat.subs.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => toggleSub(s.label)}
            aria-pressed={subs.includes(s.label)}
            className="btn-chip h-7 shrink-0 px-3"
          >
            {s.label}
          </button>
        ))}
        {subs.length > 0 && (
          <button type="button" onClick={() => setSubs([])} className="shrink-0 rounded-full px-2 py-1 text-2xs text-muted-foreground transition-colors hover:text-foreground">
            Clear
          </button>
        )}
      </div>
    </motion.div>
  );
}
