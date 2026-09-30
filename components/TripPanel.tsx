"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowUpRight, BedDouble, CalendarDays, CalendarRange, Eraser, LayoutGrid, Loader2, Map as MapIcon, MapPin, Route as RouteIcon, Maximize2, Plane, Scale, Send, Wallet, X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanelMaybe, panelSubjectKey, panelTitle, type CompareEntry, type PanelState } from "@/components/TripPanelProvider";
import { PlaceDetailView } from "@/features/places/ui/PlaceDetailView";
import { StayDetailView } from "@/features/stays/ui/StayDetailView";
import { EventDetailView } from "@/features/events/ui/EventDetailView";
import { FlightDetail } from "@/features/conversation/ui/panels/FlightDetail";
import { DayDetail } from "@/features/conversation/ui/panels/DayDetail";
import { BudgetDetail } from "@/features/conversation/ui/panels/BudgetDetail";
import { RouteDetail } from "@/features/conversation/ui/panels/RouteDetail";
import { MapDetail } from "@/features/conversation/ui/panels/MapDetail";
import { readStayDecision } from "@/packages/contracts/stay";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { ContentSwap, Sheet } from "@/components/motion-primitives";
import { MessageBlocks } from "@/features/conversation/ui/blocks/MessageBlocks";
import { AssistantMessage } from "@/features/conversation/ui/AssistantMessage";
import { haversineKm } from "@/lib/application/geo";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { Badge, controlGhost } from "@/features/conversation/ui/blocks/ui";

const KIND_LABEL: Record<CompareEntry["kind"], string> = { place: "Place", stay: "Stay", event: "Event", route: "Route" };
/** The question auto-asked the moment a fresh comparison opens — never shown as a "user" bubble
 *  since the traveller didn't type it; only Roam's answer to it is worth displaying. */
const COMPARE_VERDICT_PROMPT = "Which of these should I pick, and why? One short paragraph.";
/** Routes that mount their own `layout="inline"` TripPanel (via RoamShell) — the layout-level
 *  drawer instance stands down on these so the two don't both try to show the same panel. */
const SELF_HOSTED_INLINE_PANEL_ROUTES = ["/chat", "/group"];

/** The control that opened the inline panel, so closing it can hand focus back. Module-level because the
 *  inline panel remounts on every subject change and would otherwise forget where the user started. */
let panelOpener: HTMLElement | null = null;

const KIND_ICON = { place: MapPin, stay: BedDouble, event: CalendarDays, collection: LayoutGrid, flight: Plane, day: CalendarRange, budget: Wallet, map: MapIcon, route: RouteIcon, compare: Scale } as const;

type Anchor = { name: string; lat: number; lng: number } | null;
function distanceLabel(entry: CompareEntry, anchor: Anchor): string {
  if (!anchor || entry.attrs.lat == null || entry.attrs.lng == null) return "—";
  // Was a private re-implementation of `lib/application/geo.ts`'s `haversineKm` — missing that
  // function's `Math.min(1, ...)` clamp before `Math.asin()`, which guards against floating-point
  // rounding pushing the pre-asin value fractionally past 1 (asin of >1 is `NaN`) for two very
  // close or near-antipodal points. Same bug, same fix as `route-plan/route.ts`'s copy.
  const d = haversineKm({ latitude: anchor.lat, longitude: anchor.lng }, { latitude: entry.attrs.lat, longitude: entry.attrs.lng });
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
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
    case "flight":
      return `${base}/transport`;
    case "day":
      return `${base}/itinerary`;
    case "budget":
      return `${base}/budget`;
    case "map":
    case "route":
      return `${base}/map`;
    default:
      return `${base}/compare${compareIds.length ? `?ids=${compareIds.map(encodeURIComponent).join(",")}` : ""}`;
  }
}

function CompareGrid({ list, anchor, onRemove }: { list: CompareEntry[]; anchor: Anchor; onRemove: (id: string) => void }) {
  // "Lowest" / "Top" only make sense when every card is the same kind.
  const uniform = list.every((e) => e.kind === list[0]?.kind);
  const bestPrice = uniform ? Math.min(...list.map((e) => e.attrs.priceValue ?? Infinity)) : NaN;
  const bestRating = uniform ? Math.max(...list.map((e) => e.attrs.ratingValue ?? -Infinity)) : NaN;

  const ALL_ROWS: Array<{ label: string; has: (e: CompareEntry) => boolean; get: (e: CompareEntry) => ReactNode }> = [
    { label: "Type", has: () => true, get: (e) => e.attrs.detail ?? KIND_LABEL[e.kind] },
    {
      label: "Price",
      has: (e) => e.attrs.price != null,
      get: (e) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {e.attrs.price ?? "—"}
          {e.attrs.priceValue != null && e.attrs.priceValue === bestPrice && Number.isFinite(bestPrice) && <Badge tone="positive">Lowest</Badge>}
        </span>
      ),
    },
    {
      label: "Rating",
      has: (e) => e.attrs.rating != null,
      get: (e) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {e.attrs.rating ?? "—"}
          {e.attrs.ratingValue != null && e.attrs.ratingValue === bestRating && Number.isFinite(bestRating) && <Badge tone="brand">Top</Badge>}
        </span>
      ),
    },
    { label: "When", has: (e) => e.attrs.when != null, get: (e) => e.attrs.when ?? "—" },
    { label: anchor ? `From ${anchor.name}` : "From your stay", has: (e) => Boolean(anchor) && e.attrs.lat != null && e.attrs.lng != null, get: (e) => distanceLabel(e, anchor) },
    { label: "Address", has: (e) => e.attrs.address != null, get: (e) => e.attrs.address ?? "—" },
  ];
  // A row that is a dash for every option adds noise, not information.
  const ROWS = ALL_ROWS.filter((row) => list.some(row.has));

  if (list.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Pick a few cards to compare — the Compare button is on every place, stay and event.</p>;
  }

  return (
    <div className="overflow-x-auto overscroll-x-contain scrollbar-slim">
      <div className="grid gap-x-3" style={{ gridTemplateColumns: `5.5rem repeat(${list.length}, minmax(9.5rem, 1fr))` }}>
        <div />
        {list.map((e) => (
          <div key={e.id} className="relative rounded-2xl border border-border bg-card p-3">
            <button type="button" onClick={() => onRemove(e.id)} aria-label={`Remove ${e.name}`} className={cn(controlGhost, "absolute top-1 right-1 size-7")}>
              <X className="size-3.5" />
            </button>
            <p className="pr-6 font-display text-base font-semibold leading-tight">{e.name}</p>
            {e.subtitle && <p className="mt-1 text-xs text-muted-foreground">{e.subtitle}</p>}
            {e.href && (
              <Link href={e.href} className="relative mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']">
                Open <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            )}
          </div>
        ))}
        {ROWS.map((row, i) => (
          <div key={row.label} className="col-span-full grid grid-cols-subgrid">
            <div className={cn("flex min-h-12 items-center border-t border-transparent pr-2 text-xs font-medium leading-5 text-muted-foreground", i === 0 && "mt-3")}>{row.label}</div>
            {list.map((e) => (
              <div key={e.id + row.label} className={cn("flex min-h-12 items-center border-t border-border text-sm leading-5", i === 0 && "mt-3")}>
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
  const { guest, openGate } = useGuest();
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
  // Inline (docked chat-rail) panel: Escape closes it, unless the key was meant for something on top
  // of it (an open menu or dialog). The drawer's modal focus / scroll-lock / return-focus is
  // handled by <Sheet> further down.
  useEffect(() => {
    if (layout !== "inline" || !panel || typeof document === "undefined") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"],[role="menu"],[role="listbox"],[aria-modal="true"]')) return;
      closePanel?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [layout, panel, closePanel]);
  // Move focus into the inline panel when it opens (and to the new subject when it changes), and hand it
  // back to the control that opened it when it closes — so keyboard and screen-reader users aren't left behind.
  const panelRef = useRef<HTMLDivElement>(null);
  const isOpen = Boolean(panel);
  useEffect(() => {
    if (layout !== "inline") return;
    if (isOpen) {
      const active = document.activeElement as HTMLElement | null;
      if (!panelOpener && active && active !== document.body && !panelRef.current?.contains(active)) panelOpener = active;
      panelRef.current?.focus({ preventScroll: true });
    } else if (panelOpener) {
      panelOpener.focus?.({ preventScroll: true });
      panelOpener = null;
    }
  }, [layout, isOpen, sk]);
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

  // RoamShell (Roam + Group chat) renders its own <TripPanel layout="inline" />; the
  // layout-level drawer stands down on those routes. `endsWith` doesn't match "/group/details",
  // which has no inline panel of its own and must keep using this ambient drawer normally.
  if (!ctx || (layout === "drawer" && SELF_HOSTED_INLINE_PANEL_ROUTES.some((seg) => pathname?.endsWith(seg)))) return null;
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
    if (p.kind === "flight") return [{ name: panelTitle(p), detail: "Flight", price: `${p.flight.price} ${p.flight.currency}`, when: p.flight.departAt }];
    if (p.kind === "day") return [{ name: panelTitle(p), detail: `Itinerary day: ${p.block.days[p.dayIndex]?.stops.map((stop) => stop.title).join(", ")}` }];
    if (p.kind === "route") return [{ name: panelTitle(p), detail: `Ways to get there: ${p.routes.map((r) => `${r.mode} ${Math.round(r.durationSeconds / 60)} min`).join(", ")}` }];
    if (p.kind === "map") return [{ name: panelTitle(p), detail: `Map of: ${p.points.map((point) => point.name).join(", ")}` }];
    if (p.kind === "budget") return [{ name: panelTitle(p), detail: `About ${p.block.dailyTotal.typical} ${p.block.currency} a day, ${p.block.perPerson ? "per person" : "for the group"}` }];
    return [{ name: panelTitle(p), detail: p.kind === "stay" ? "Hotel" : p.kind === "event" ? "Event" : "Place" }];
  }

  async function ask(raw: string, historyOverride?: Array<{ role: "user" | "assistant"; content: string }>, externalSignal?: AbortSignal) {
    if (!panel) return;
    // The side-chat is a second, uncounted door to the model; a guest's free messages are in the main chat.
    if (guest) return openGate("ask Roam to compare options");
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

  // The auto-asked comparison verdict belongs above the numbers, not buried in the chat below them.
  const verdictMsg = shown?.kind === "compare" && chat[0]?.content === COMPARE_VERDICT_PROMPT ? chat[1] : undefined;
  const verdictFailed = Boolean(verdictMsg?.content.startsWith("Roam couldn’t answer"));

  const body: ReactNode = !shown ? null : shown.kind === "place" ? (
    <PlaceDetailView tripId={tripId} placeId={shown.placeId} variant="panel" />
  ) : shown.kind === "stay" ? (
    <StayDetailView tripId={tripId} hotelId={shown.hotelId} checkin={shown.checkin} checkout={shown.checkout} variant="panel" />
  ) : shown.kind === "event" ? (
    <EventDetailView tripId={tripId} seed={shown.seed} variant="panel" />
  ) : shown.kind === "flight" ? (
    <FlightDetail flight={shown.flight} route={shown.route} />
  ) : shown.kind === "day" ? (
    <DayDetail block={shown.block} dayIndex={shown.dayIndex} tripId={tripId} />
  ) : shown.kind === "budget" ? (
    <BudgetDetail block={shown.block} />
  ) : shown.kind === "route" ? (
    <RouteDetail routes={shown.routes} active={shown.active} />
  ) : shown.kind === "map" ? (
    <MapDetail tripId={tripId} panel={shown} />
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
        onOpenPanel={ctx.openPanel}
      />
    </div>
  ) : (
    <div className="space-y-4 p-4">
      {verdictMsg && (
        <section aria-label="Roam’s take" className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h3 className="font-display text-base font-semibold">Roam’s take</h3>
          {verdictMsg.content ? (
            <AssistantMessage content={verdictMsg.content} />
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Comparing your options…</span>
          )}
          {verdictFailed && (
            <button type="button" className="text-xs font-medium underline underline-offset-4" onClick={() => void ask(COMPARE_VERDICT_PROMPT, [])}>Try again</button>
          )}
        </section>
      )}
      <CompareGrid list={compareList} anchor={anchor} onRemove={compareRemove} />
    </div>
  );
  // The surface (header + scroll frame) stays put; only this crossfades between subjects.
  const animatedBody = <ContentSwap swapKey={sk} className="min-h-full">{body}</ContentSwap>;
  const KindIcon = shown ? KIND_ICON[shown.kind] : null;
  const header = shown && (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-1.5">
        {canGoBack && (
          <button type="button" onClick={goBack} aria-label="Back to previous item" className={controlGhost}>
            <ArrowLeft className="size-4" aria-hidden />
          </button>
        )}
        {KindIcon && <KindIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
        <span className="min-w-0 truncate font-display text-base font-semibold tracking-[-0.01em]">{panelTitle(shown)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {chat.length > 0 && (
          <button type="button" onClick={() => setChat([])} aria-label="Clear this chat" title="Clear this chat" className={controlGhost}>
            <Eraser className="size-4" aria-hidden />
          </button>
        )}
        <Link
          href={fullPageHref(shown, tripId, compareList.map((e) => e.id))}
          onClick={() => closePanel?.()}
          aria-label="Open as full page"
          title="Open as full page"
          className={controlGhost}
        >
          <Maximize2 className="size-4" aria-hidden />
        </Link>
        <button ref={closeButtonRef} type="button" onClick={closePanel} aria-label="Close panel" title="Close (Esc)" className={controlGhost}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </header>
  );

  const composer = layout === "drawer" && panel && (
    <>
      {chat.filter((m) => m !== verdictMsg && !(m.role === "user" && m.content === COMPARE_VERDICT_PROMPT)).length > 0 && (
        <div className="max-h-[40%] shrink-0 space-y-3 overscroll-contain overflow-y-auto scrollbar-slim border-t border-border px-4 py-3">
          {chat.map((m, i) => {
            // The auto-verdict prompt is never something the traveller typed — show its answer, not the prompt.
            if (m.role === "user" && m.content === COMPARE_VERDICT_PROMPT) return null;
            if (verdictMsg && m === verdictMsg) return null;
            const loading = sending && i === chat.length - 1;
            if (m.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-lg bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                    {m.content}
                  </p>
                </div>
              );
            }
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
          className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-base outline-none focus:ring-2 focus:ring-ring/25"
        />
        <button type="submit" disabled={sending || !input.trim()} className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-[opacity,transform] active:scale-95 disabled:opacity-40" aria-label="Send">
          {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
        </button>
      </form>
    </>
  );

  // Chat route: render inline in its own column — no drawer chrome, no composer (the main chat serves).
  if (layout === "inline") {
    // `shown` (not `panel`): while the shell slides the panel away the content must still be there, not an empty frame.
    return shown ? (
      <div ref={panelRef} role="complementary" aria-label={shown ? panelTitle(shown) : "Details"} tabIndex={-1} className="flex h-full min-h-0 flex-col outline-none">
        {header}
        <div ref={scrollRef} className="min-h-0 flex-1 overscroll-contain overflow-y-auto scrollbar-slim">{animatedBody}</div>
      </div>
    ) : null;
  }

  const pill = ctx.compareMode && compareList.length > 0 && panel?.kind !== "compare" && (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 shadow-lift">
        <span className="inline-flex items-center gap-1.5 pl-2 text-sm font-medium">
          Compare {compareList.length}
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
        // A fixed height on phones, so the sheet does not grow when the content arrives.
        className={desktop ? undefined : "h-[92dvh]"}
        ariaLabel={shown ? panelTitle(shown) : undefined}
      >
        {header}
        <div ref={scrollRef} className="min-h-0 flex-1 overscroll-contain overflow-y-auto scrollbar-slim">{animatedBody}</div>
        {composer}
      </Sheet>
    </>
  );
}
