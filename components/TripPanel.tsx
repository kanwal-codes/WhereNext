"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowUpRight, Eraser, Loader2, Maximize2, Scale, Send, X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanelMaybe, panelSubjectKey, type CompareEntry, type PanelState } from "@/components/TripPanelProvider";
import { PlaceDetailView } from "@/features/places/ui/PlaceDetailView";
import { StayDetailView } from "@/features/stays/ui/StayDetailView";
import { EventDetailView } from "@/features/events/ui/EventDetailView";
import { readStayDecision } from "@/packages/contracts/stay";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { ContentSwap, Sheet } from "@/components/motion-primitives";
import { MessageBlocks } from "@/features/conversation/ui/blocks/MessageBlocks";
import { AssistantMessage } from "@/features/conversation/ui/AssistantMessage";

const KIND_LABEL: Record<CompareEntry["kind"], string> = { place: "Place", stay: "Stay", event: "Event", route: "Route" };
/** The question auto-asked the moment a fresh comparison opens — never shown as a "user" bubble
 *  since the traveller didn't type it; only Roam's answer to it is worth displaying. */
const COMPARE_VERDICT_PROMPT = "Which of these should I pick, and why? One short paragraph.";

const R = 6371;
const toRad = (n: number) => (n * Math.PI) / 180;
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
type Anchor = { name: string; lat: number; lng: number } | null;
function distanceLabel(entry: CompareEntry, anchor: Anchor): string {
  if (!anchor || entry.attrs.lat == null || entry.attrs.lng == null) return "—";
  const d = km(anchor, { lat: entry.attrs.lat, lng: entry.attrs.lng });
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
}
function titleFor(panel: PanelState): string {
  switch (panel.kind) {
    case "place":
      return panel.name;
    case "stay":
      return panel.name;
    case "event":
      return panel.seed.name;
    case "collection":
      return panel.title;
    default:
      return "Compare";
  }
}

/** The routed full-page equivalent of whatever the panel is showing. */
function fullPageHref(panel: PanelState, tripId: string, compareIds: string[]): string {
  const base = `/trips/${tripId}`;
  switch (panel.kind) {
    case "place":
      return `${base}/place/${encodeURIComponent(panel.placeId)}`;
    case "stay": {
      const qs = new URLSearchParams();
      if (panel.checkin) qs.set("checkin", panel.checkin);
      if (panel.checkout) qs.set("checkout", panel.checkout);
      return `${base}/stay/${encodeURIComponent(panel.hotelId)}${qs.toString() ? `?${qs}` : ""}`;
    }
    case "event": {
      const { name, url, source, imageUrl, date, venue } = panel.seed;
      const qs = new URLSearchParams({ name, url, source });
      if (imageUrl) qs.set("img", imageUrl);
      if (date) qs.set("date", date);
      if (venue) qs.set("venue", venue);
      return `${base}/event?${qs}`;
    }
    case "collection":
      return `${base}/discover`;
    default:
      return `${base}/compare${compareIds.length ? `?ids=${compareIds.map(encodeURIComponent).join(",")}` : ""}`;
  }
}

function CompareGrid({ list, anchor, onRemove }: { list: CompareEntry[]; anchor: Anchor; onRemove: (id: string) => void }) {
  // "Lowest" / "Top" only make sense when every card is the same kind.
  const uniform = list.every((e) => e.kind === list[0]?.kind);
  const bestPrice = uniform ? Math.min(...list.map((e) => e.attrs.priceValue ?? Infinity)) : NaN;
  const bestRating = uniform ? Math.max(...list.map((e) => e.attrs.ratingValue ?? -Infinity)) : NaN;

  const ROWS: Array<{ label: string; get: (e: CompareEntry) => ReactNode }> = [
    { label: "Type", get: (e) => e.attrs.detail ?? KIND_LABEL[e.kind] },
    {
      label: "Price",
      get: (e) => (
        <span className="inline-flex items-center gap-1.5">
          {e.attrs.price ?? "—"}
          {e.attrs.priceValue != null && e.attrs.priceValue === bestPrice && Number.isFinite(bestPrice) && (
            <span className="rounded-full bg-leaf-soft px-1.5 py-0.5 text-[10px] font-medium text-leaf">Lowest</span>
          )}
        </span>
      ),
    },
    {
      label: "Rating",
      get: (e) => (
        <span className="inline-flex items-center gap-1.5">
          {e.attrs.rating ?? "—"}
          {e.attrs.ratingValue != null && e.attrs.ratingValue === bestRating && Number.isFinite(bestRating) && (
            <span className="rounded-full bg-coral-soft px-1.5 py-0.5 text-[10px] font-medium text-coral">Top</span>
          )}
        </span>
      ),
    },
    { label: "When", get: (e) => e.attrs.when ?? "—" },
    { label: anchor ? `From ${anchor.name}` : "From your stay", get: (e) => distanceLabel(e, anchor) },
    { label: "Address", get: (e) => e.attrs.address ?? "—" },
  ];

  if (list.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Pick a few cards to compare — the Compare button is on every place, stay and event.</p>;
  }

  return (
    <div className="overflow-x-auto scrollbar-slim">
      <div className="grid gap-x-3" style={{ gridTemplateColumns: `104px repeat(${list.length}, minmax(150px, 1fr))` }}>
        <div />
        {list.map((e) => (
          <div key={e.id} className="relative rounded-2xl border border-border bg-card p-3">
            <button type="button" onClick={() => onRemove(e.id)} aria-label={`Remove ${e.name}`} className="absolute top-1.5 right-1.5 rounded-full bg-background/90 p-1 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="pr-5 font-display text-sm leading-tight">{e.name}</p>
            {e.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{e.subtitle}</p>}
            {e.href && (
              <Link href={e.href} className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-primary">
                Open <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        ))}
        {ROWS.map((row, i) => (
          <div key={row.label} className="col-span-full grid grid-cols-subgrid">
            <div className={cn("py-2.5 pr-2 text-[10px] tracking-[0.1em] text-muted-foreground uppercase", i === 0 && "mt-3")}>{row.label}</div>
            {list.map((e) => (
              <div key={e.id + row.label} className={cn("border-t border-border py-2.5 text-sm", i === 0 && "mt-3")}>
                {row.get(e)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The one shared trip side panel: detail views, comparisons, and a composer wired to the trip chat. */
export function TripPanel({ layout = "drawer" }: { layout?: "drawer" | "inline" }) {
  const ctx = useTripPanelMaybe();
  const { tripId, data } = useTripData();
  const pathname = usePathname();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [chat, setChat] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const scrollMem = useRef(new Map<string, number>());

  const panel = ctx?.panel ?? null;
  const closePanel = ctx?.closePanel;
  const navDirection = ctx?.navDirection ?? "forward";
  const compareList = ctx?.compareList ?? [];
  // The panel content survives a close so the sheet slides out with something in it.
  const lastPanelRef = useRef<PanelState | null>(null);
  if (panel) lastPanelRef.current = panel;
  const shown = panel ?? lastPanelRef.current;
  const sk = panelSubjectKey(shown, compareList.map((e) => e.id));

  // A scratch chat, scoped to whatever the panel currently shows. Cleared when the subject changes.
  useEffect(() => {
    setChat([]);
  }, [sk]);
  // A raw side-by-side table doesn't tell anyone which option to actually pick — kick off
  // Roam's take the moment a fresh comparison (2+ items) opens, so there's always a plain-
  // language verdict above the numbers, not just the numbers themselves. Aborted on cleanup
  // so Strict Mode's dev-only double-invoke (mount → cleanup → mount) cancels the first,
  // stale call instead of leaving two concurrent requests racing to write the same state.
  //
  // Depends on panel?.kind too, not just sk: compareList reaches its final 2+ items (and sk
  // its final value) while the user is still picking cards, before the panel ever opens —
  // clicking "Open" afterward flips panel.kind to "compare" without sk changing at all, so
  // sk alone misses that transition and a second comparison in the same session never asks.
  useEffect(() => {
    if (panel?.kind !== "compare" || compareList.length < 2) return;
    const controller = new AbortController();
    void ask(COMPARE_VERDICT_PROMPT, [], controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sk, panel?.kind]);
  // Inline (docked chat-rail) panel: Escape still closes it. The drawer's modal focus /
  // scroll-lock / return-focus is handled by <Sheet> further down.
  useEffect(() => {
    if (layout !== "inline" || !panel || typeof document === "undefined") return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel?.(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [layout, panel, closePanel]);
  // Scroll memory: remember where each subject was left, restore it on the in-panel Back,
  // land at the top on a forward open.
  useEffect(() => {
    const el = scrollRef.current;
    const mem = scrollMem.current;
    const key = sk;
    return () => { if (el) mem.set(key, el.scrollTop); };
  }, [sk]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || sk === "none") return;
    const target = navDirection === "back" ? scrollMem.current.get(sk) ?? 0 : 0;
    const id = requestAnimationFrame(() => el.scrollTo({ top: target }));
    return () => cancelAnimationFrame(id);
  }, [sk, navDirection]);

  // The chat route renders its own <TripPanel layout="inline" />; the layout-level drawer stands down there.
  if (!ctx || (layout === "drawer" && pathname?.endsWith("/chat"))) return null;
  const { compareRemove, goBack, canGoBack } = ctx;

  const stay = readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);
  const anchor: Anchor = stay && stay.latitude != null && stay.longitude != null ? { name: stay.hotelName, lat: stay.latitude, lng: stay.longitude } : null;

  /** The options the scratch chat should reason about — the compare set, or just the one thing on screen. */
  function itemsFor(p: PanelState) {
    if (p.kind === "compare") {
      return compareList.map((e) => ({
        name: e.name,
        detail: e.attrs.detail,
        price: e.attrs.price,
        rating: e.attrs.rating,
        when: e.attrs.when,
        address: e.attrs.address,
        lat: e.attrs.lat,
        lng: e.attrs.lng,
      }));
    }
    if (p.kind === "collection") return [];
    return [{ name: titleFor(p), detail: p.kind === "stay" ? "Hotel" : p.kind === "event" ? "Event" : "Place" }];
  }

  async function ask(raw: string, historyOverride?: Array<{ role: "user" | "assistant"; content: string }>, externalSignal?: AbortSignal) {
    if (!panel) return;
    const q = raw.trim();
    if (!q || sending) return;
    setInput("");
    const history = historyOverride ?? chat.filter((m) => m.content.trim());
    setChat((c) => [...c, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setSending(true);
    // The upstream call has its own connect-time deadline, but nothing bounds how long an
    // already-open stream can go quiet mid-response — without this, a stall leaves the
    // spinner running forever with no way out.
    const timeout = AbortSignal.timeout(30_000);
    const signal = externalSignal ? AbortSignal.any([timeout, externalSignal]) : timeout;
    try {
      const res = await fetch(`/api/trips/${tripId}/compare-chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: itemsFor(panel), messages: [...history, { role: "user", content: q }] }),
        signal,
      });
      if (!res.ok || !res.body) throw new Error("compare-chat");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setChat((c) => c.map((m, i) => (i === c.length - 1 ? { role: "assistant", content: acc } : m)));
      }
      if (!acc.trim()) throw new Error("empty");
    } catch {
      // Superseded by a newer call (React Strict Mode's double-invoke, or the comparison set
      // changed again mid-flight) — that call owns the chat now; don't stomp its state.
      if (externalSignal?.aborted) return;
      setChat((c) => c.map((m, i) => (i === c.length - 1 ? { role: "assistant", content: "Roam couldn’t answer just now. Try again in a moment." } : m)));
    } finally {
      setSending(false);
    }
  }

  const body: ReactNode = !shown ? null : shown.kind === "place" ? (
    <PlaceDetailView tripId={tripId} placeId={shown.placeId} variant="panel" />
  ) : shown.kind === "stay" ? (
    <StayDetailView tripId={tripId} hotelId={shown.hotelId} checkin={shown.checkin} checkout={shown.checkout} variant="panel" />
  ) : shown.kind === "event" ? (
    <EventDetailView tripId={tripId} seed={shown.seed} variant="panel" />
  ) : shown.kind === "collection" ? (
    <div className="p-4">
      <MessageBlocks
        blocks={[shown.block]}
        tripId={tripId}
        preview={false}
        onFollowup={() => undefined}
        onOpenPlace={(place) => ctx.openPanel({ kind: "place", placeId: place.providerId, name: place.name })}
        onOpenStay={(stay, dates) => ctx.openPanel({ kind: "stay", hotelId: stay.hotelId, name: stay.name, ...dates })}
        onOpenEvent={(seed) => ctx.openPanel({ kind: "event", seed })}
      />
    </div>
  ) : (
    <div className="p-4">
      <CompareGrid list={compareList} anchor={anchor} onRemove={compareRemove} />
    </div>
  );
  // The surface (header + scroll frame) stays put; only this crossfades between subjects.
  const animatedBody = <ContentSwap swapKey={sk} className="min-h-full">{body}</ContentSwap>;
  const header = shown && (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="inline-flex min-w-0 items-center gap-1.5 font-display text-sm">
        {canGoBack && <button type="button" onClick={goBack} aria-label="Back to previous item" className="mr-1 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><ArrowLeft className="h-4 w-4" /></button>}
        {shown.kind === "compare" && <Scale className="h-3.5 w-3.5 shrink-0 text-coral" />}
        <span className="min-w-0 truncate">{titleFor(shown)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {chat.length > 0 && (
          <button type="button" onClick={() => setChat([])} aria-label="Clear this chat" title="Clear this chat" className="rounded-full border border-border p-1.5 text-muted-foreground hover:text-foreground">
            <Eraser className="h-3.5 w-3.5" />
          </button>
        )}
        <Link
          href={fullPageHref(shown, tripId, compareList.map((e) => e.id))}
          onClick={() => closePanel?.()}
          aria-label="Expand to full page"
          title="Expand to full page"
          className="rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Link>
        <button ref={closeButtonRef} type="button" onClick={closePanel} aria-label="Close panel" className="rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );

  const composer = layout === "drawer" && panel && (
    <>
      {chat.length > 0 && (
        <div className="max-h-[40%] shrink-0 space-y-3 overscroll-contain overflow-y-auto scrollbar-slim border-t border-border px-4 py-3">
          {chat.map((m, i) => {
            // The auto-verdict prompt is never something the traveller typed — show its answer, not the prompt.
            if (m.role === "user" && m.content === COMPARE_VERDICT_PROMPT) return null;
            const loading = sending && i === chat.length - 1;
            if (m.role === "user") return <div key={i} className="text-sm leading-relaxed font-medium">{m.content}</div>;
            return (
              <div key={i} className="space-y-2">
                {m.content ? (
                  <AssistantMessage content={m.content} />
                ) : loading ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="flex shrink-0 items-center gap-2 border-t border-border p-3"
      >
        <input
          aria-label="Ask about this item"
          name="panel-question"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={panel.kind === "compare" ? "Ask about these — value, location, what to pick…" : "Ask about this — does it fit my trip?"}
          className="min-w-0 flex-1 rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/25"
        />
        <button type="submit" disabled={sending || !input.trim()} className="btn-primary-sm shrink-0" aria-label="Send">
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </form>
    </>
  );

  // Chat route: render inline in its own column — no drawer chrome, no composer (the main chat serves).
  if (layout === "inline") {
    return panel ? (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <div ref={scrollRef} className="min-h-0 flex-1 overscroll-contain overflow-y-auto scrollbar-slim">{animatedBody}</div>
      </div>
    ) : null;
  }

  const pill = ctx.compareMode && compareList.length > 0 && panel?.kind !== "compare" && (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 shadow-lift">
        <span className="inline-flex items-center gap-1.5 pl-2 text-sm font-medium">
          <Scale className="h-3.5 w-3.5 text-coral" /> Compare {compareList.length}
        </span>
        <button type="button" onClick={ctx.openCompare} className="btn-primary-sm">
          Open
        </button>
        <button type="button" onClick={ctx.compareClear} aria-label="Clear comparison" className="rounded-full p-1.5 text-muted-foreground hover:bg-accent">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );

  return (
    <>
      <AnimatePresence>{pill}</AnimatePresence>
      <Sheet
        open={Boolean(panel)}
        onClose={() => closePanel?.()}
        side={desktop ? "right" : "bottom"}
        ariaLabel={shown ? titleFor(shown) : undefined}
      >
        {header}
        <div ref={scrollRef} className="min-h-0 flex-1 overscroll-contain overflow-y-auto scrollbar-slim">{animatedBody}</div>
        {composer}
      </Sheet>
    </>
  );
}
