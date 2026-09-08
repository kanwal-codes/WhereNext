"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssistantBlock } from "@/packages/contracts/assistant";

export const COMPARE_MAX = 4;

export type CompareKind = "place" | "stay" | "event" | "route";

/** A snapshot of something to compare — captured at select time so the panel never re-fetches. */
export type CompareEntry = {
  id: string;
  kind: CompareKind;
  name: string;
  subtitle?: string;
  image?: string;
  href?: string;
  attrs: {
    price?: string;
    priceValue?: number;
    rating?: string;
    ratingValue?: number;
    lat?: number;
    lng?: number;
    address?: string;
    detail?: string;
    when?: string;
  };
};

export type EventSeed = { name: string; url: string; source: string; imageUrl?: string; date?: string; venue?: string };

/**
 * Everything the shared drawer can show, on the Discover / Stays / Getting-around tabs.
 * (The conversation tab renders comparisons and details inline, not here.)
 */
export type PanelState =
  | { kind: "place"; placeId: string; name: string }
  | { kind: "stay"; hotelId: string; name: string; checkin?: string; checkout?: string }
  | { kind: "event"; seed: EventSeed }
  | { kind: "collection"; title: string; block: AssistantBlock }
  | { kind: "compare" }; // the multi-kind selection bucket → CompareGrid + scratch chat

type Ctx = {
  panel: PanelState | null;
  openPanel: (panel: PanelState) => void;
  goBack: () => void;
  canGoBack: boolean;
  closePanel: () => void;
  /** "back" when the last move was the in-panel back button, else "forward". Drives scroll restore. */
  navDirection: "forward" | "back";
  compareList: CompareEntry[];
  compareHas: (id: string) => boolean;
  compareToggle: (entry: CompareEntry) => void;
  compareRemove: (id: string) => void;
  compareClear: () => void;
  openCompare: () => void;
  compareMode: boolean;
  setCompareMode: (on: boolean) => void;
};

/** The stable identity of whatever the panel is showing — one definition, imported everywhere. */
export function panelSubjectKey(panel: PanelState | null, compareIds: string[] = []): string {
  if (!panel) return "none";
  return panel.kind === "place"
    ? `place:${panel.placeId}`
    : panel.kind === "stay"
      ? `stay:${panel.hotelId}:${panel.checkin ?? ""}:${panel.checkout ?? ""}`
      : panel.kind === "event"
        ? `event:${panel.seed.url}`
        : panel.kind === "collection"
          ? `collection:${panel.title}:${panel.block.type}`
          : `compare:${compareIds.join(",")}`;
}
const panelKey = (panel: PanelState) => panelSubjectKey(panel);

const TripPanelCtx = createContext<Ctx | null>(null);

export function TripPanelProvider({ tripId, children }: { tripId: string; children: ReactNode }) {
  const key = `compare:${tripId}`;
  const pathname = usePathname();
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [history, setHistory] = useState<PanelState[]>([]);
  const [navDirection, setNavDirection] = useState<"forward" | "back">("forward");
  const [compareList, setCompareList] = useState<CompareEntry[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const browserEntryRef = useRef(false);
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      browserEntryRef.current = false;
      setPanel(null);
      setHistory([]);
      previousPathnameRef.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) setCompareList(JSON.parse(raw) as CompareEntry[]);
    } catch {
      /* blocked storage */
    }
  }, [key]);
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(compareList));
    } catch {
      /* ignore */
    }
  }, [key, compareList]);

  const openPanel = useCallback((next: PanelState) => {
    setNavDirection("forward");
    setPanel((current) => {
      if (current && panelKey(current) === panelKey(next)) return current;
      if (current) setHistory((stack) => [...stack, current]);
      return next;
    });
  }, []);
  const closePanel = useCallback(() => { setPanel(null); setHistory([]); }, []);
  const goBack = useCallback(() => {
    setNavDirection("back");
    setHistory((stack) => {
      const previous = stack.at(-1);
      if (!previous) return stack;
      setPanel(previous);
      return stack.slice(0, -1);
    });
  }, []);

  // Browser Back closes the panel — one history entry per open, popped on close, so the
  // hardware/gesture back and the X button do the same thing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const open = panel !== null;
    if (open && !browserEntryRef.current) {
      window.history.pushState({ ...(window.history.state as object | null), __tripPanel: true }, "");
      browserEntryRef.current = true;
    } else if (!open && browserEntryRef.current) {
      browserEntryRef.current = false;
      if ((window.history.state as { __tripPanel?: boolean } | null)?.__tripPanel) window.history.back();
    }
  }, [panel]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      if (!browserEntryRef.current) return;
      browserEntryRef.current = false;
      setPanel(null);
      setHistory([]);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const compareHas = useCallback((id: string) => compareList.some((e) => e.id === id), [compareList]);
  const compareToggle = useCallback((entry: CompareEntry) => {
    setCompareList((cur) => {
      if (cur.some((e) => e.id === entry.id)) return cur.filter((e) => e.id !== entry.id);
      return cur.length >= COMPARE_MAX ? cur : [...cur, entry];
    });
  }, []);
  const compareRemove = useCallback((id: string) => setCompareList((cur) => cur.filter((e) => e.id !== id)), []);
  const compareClear = useCallback(() => {
    setCompareList([]);
    setPanel((p) => (p?.kind === "compare" ? null : p));
  }, []);
  const openCompare = useCallback(() => {
    setNavDirection("forward");
    setPanel((current) => {
      if (current?.kind === "compare") return current;
      if (current) setHistory((stack) => [...stack, current]);
      return { kind: "compare" };
    });
    setCompareMode(false);
  }, []);

  const value = useMemo(
    () => ({ panel, openPanel, closePanel, goBack, canGoBack: history.length > 0, navDirection, compareList, compareHas, compareToggle, compareRemove, compareClear, openCompare, compareMode, setCompareMode }),
    [panel, openPanel, closePanel, goBack, history.length, navDirection, compareList, compareHas, compareToggle, compareRemove, compareClear, openCompare, compareMode],
  );
  return <TripPanelCtx.Provider value={value}>{children}</TripPanelCtx.Provider>;
}

export const useTripPanelMaybe = () => useContext(TripPanelCtx);
export function useTripPanel(): Ctx {
  const ctx = useContext(TripPanelCtx);
  if (!ctx) throw new Error("useTripPanel must be used inside <TripPanelProvider>");
  return ctx;
}

/** Drop-in "add to comparison" toggle for any card. Renders nothing outside a TripPanelProvider. */
export function CompareButton({ entry, className }: { entry: CompareEntry; className?: string }) {
  const ctx = useTripPanelMaybe();
  if (!ctx) return null;
  const on = ctx.compareHas(entry.id);
  const full = !on && ctx.compareList.length >= COMPARE_MAX;
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={full}
      title={full ? `Comparing ${COMPARE_MAX} already` : on ? "Remove from compare" : "Add to compare"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.compareToggle(entry);
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
        on ? "border-coral bg-coral-soft text-coral" : "border-border bg-background/90 text-muted-foreground hover:text-foreground",
        full && "cursor-not-allowed opacity-40",
        className,
      )}
    >
      <Scale className="h-3 w-3" />
      {on ? "Comparing" : "Compare"}
    </button>
  );
}
