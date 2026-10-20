"use client";

import React, { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ChevronRight, Info } from "lucide-react";
import { MicButton, SendButton } from "@/components/ComposerButtons";
import { PHONE_V2 } from "@/lib/phone-v2";
import { Reveal, Stagger, StaggerItem, ease, motionTokens } from "@/components/motion-primitives";
import type { AssistantBlock, AssistantTurnMeta, PlaceCard, ProposedCommand, StayCardItem } from "@/packages/contracts/assistant";
import type { EventSeed } from "@/components/TripPanelProvider";
import type { Message } from "../domain/message";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { useSpeechInput } from "@/lib/use-speech-input";
import { haptic } from "@/lib/haptics";
import { useAutoGrowTextarea } from "@/lib/use-autogrow-textarea";
import { useKeepScrollGap } from "@/lib/use-keep-scroll-gap";
import { AssistantMessage, type BlockHandlers } from "./AssistantMessage";
import type { CardPanel } from "@/components/TripPanelProvider";
import { CopyButton, controlSecondary, textAction } from "./blocks/ui";
import { AssistantRequestError } from "../application/streamAssistantResponse";
import { sendConversationMessage } from "../application/sendConversationMessage";
import { GuestSavePrompt } from "@/features/identity/ui/GuestSavePrompt";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { GUEST_TURN_LIMIT } from "@/lib/guest-limits";
import { cn } from "@/lib/utils";
import { RoamMark } from "@/features/roam/ui/RoamMark";

const RTL = new Set(["ar", "he", "fa", "ur", "ps", "sd"]);

/** Human names for the providers RETRIEVE may report as unavailable. */
const PROVIDER_LABEL: Record<string, string> = {
  liteapi: "hotel rates",
  duffel: "flight fares",
  ticketmaster: "events",
  eventbrite: "events",
  "google-routes": "transit",
  "transit-app": "transit",
  mapbox: "directions",
  openweather: "the weather",
  tavily: "the web",
  "google-places": "places",
};
const unavailableLabels = (names?: string[]) => Array.from(new Set((names ?? []).map((name) => PROVIDER_LABEL[name] ?? name)));

const conversationCacheKey = (tripId: string) => `where-next:conversation:${tripId}`;
type ConversationCache = { savedAt: number; messages: Message[] };
const CONVERSATION_CACHE_TTL_MS = 60_000;

function readConversationCache(tripId: string): ConversationCache | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(conversationCacheKey(tripId)) ?? "null") as Partial<ConversationCache> | null;
    if (!parsed || !Array.isArray(parsed.messages)) return null;
    const messages = parsed.messages.filter((message): message is Message => Boolean(message && typeof message === "object" && (message as Message).role && typeof (message as Message).content === "string"));
    return messages.length > 0 ? { savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0, messages } : null;
  } catch {
    return null;
  }
}

/** `verifiedAt` is when this content was last confirmed against the server — NOT "now". Passing
 *  the real verification time (rather than always stamping the write) is what makes the 60s TTL
 *  below mean anything: otherwise every local edit (an optimistic send, a settled stream) would
 *  re-arm the freshness window and a revisit could skip server reconciliation indefinitely. */
function writeConversationCache(tripId: string, messages: Message[], verifiedAt: number) {
  if (typeof window === "undefined" || messages.length === 0) return;
  try {
    window.sessionStorage.setItem(conversationCacheKey(tripId), JSON.stringify({ savedAt: verifiedAt, messages } satisfies ConversationCache));
  } catch {
    // Session storage can be unavailable or full; the server remains the source of truth.
  }
}

export function mergeConversationMessages(current: Message[], fresh: Message[]): Message[] {
  const byId = new Map(fresh.map((message) => [message.id, message]));
  // `current` is in the order the messages were sent. A local message carries the BROWSER's clock and a server row the
  // SERVER's, so sorting them together by time can put Roam's streaming reply above the question that caused it
  // whenever the two clocks differ by a second or two (a first message sent while the thread's load is still finishing
  // merges in exactly that state). So a message with no server row keeps its place after the one before it.
  let previous = -Infinity;
  for (let message of current) {
    const served = byId.get(message.id);
    if (served) {
      previous = Date.parse(served.created_at);
      continue;
    }
    // A locally-streamed message keeps its client-generated id, so it never matches the server
    // row by id. Both roles' local ids are deterministic from the turn's own send idempotency
    // key (`local-${key}` for the user's own echo, `local-assistant-${key}` for the reply
    // placeholder — see sendConversationMessage.ts), and the server row carries that same key
    // back (`user:${key}` / `assistant:${key}`, see scopedMessageIdempotencyKey) — matching on
    // that instead of content+timing means two genuinely identical messages/replies sent
    // moments apart each match their own row, rather than the second one matching the first's
    // already-confirmed twin and vanishing (or, under a slow/backed-up queue, surviving past
    // the old fixed 5-minute window as a visible duplicate).
    const userLocalKey = message.role === "user" && message.id.startsWith("local-") ? message.id.slice("local-".length) : null;
    const assistantLocalKey = message.role === "assistant" && message.id.startsWith("local-assistant-") ? message.id.slice("local-assistant-".length) : null;
    const twin = userLocalKey
      ? fresh.find((c) => c.role === "user" && c.idempotency_key === `user:${userLocalKey}`)
      : assistantLocalKey
        ? fresh.find((c) => c.role === "assistant" && c.idempotency_key === `assistant:${assistantLocalKey}`)
        : message.role === "user"
          ? fresh.find((c) => c.role === "user" && c.content === message.content && Math.abs(Date.parse(c.created_at) - Date.parse(message.created_at)) < 60_000)
          : message.content.trim().length > 0
            ? fresh.find((c) => c.role === "assistant" && c.content.trim() === message.content.trim() && Math.abs(Date.parse(c.created_at) - Date.parse(message.created_at)) < 5 * 60_000)
            : undefined;
    if (twin) {
      previous = Date.parse(twin.created_at);
      continue;
    }
    let at = Date.parse(message.created_at);
    if (!(at > previous)) {
      at = previous + 1;
      message = { ...message, created_at: new Date(at).toISOString() };
    }
    previous = at;
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

const humanKey = (key: string) => key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const humanValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(humanValue).join(", ") || "—";
  if (value && typeof value === "object") return JSON.stringify(value);
  if (value === "" || value == null) return "—";
  return String(value);
};

/** The exact fields a proposed change will write — shown behind an expander so the user can check before confirming.
 *  Exported for `tests/unit/describe-proposal.test.ts` — a pure function, no need to mount the component to test it. */
export function describeProposal(proposal: ProposedCommand): Array<[string, string]> {
  switch (proposal.type) {
    case "update_preferences":
      // `operations` (add/remove/replace/clear on a list field) is the update's own control
      // structure, not a preference — showing it as a raw "Operations: —" row is meaningless to a
      // user, and worse, misleading when the model includes an empty `operations: []` alongside a
      // real field (seen live: a single-field update rendered a phantom "Operations" row). Expand
      // each operation into a proper labeled row instead of hiding it outright, so a pure
      // list-edit (e.g. "remove museums from dislikes") still shows what's actually changing.
      return Object.entries(proposal.preferences).flatMap(([key, value]) => {
        if (key !== "operations") return [[humanKey(key), humanValue(value)] as [string, string]];
        const ops = value as Array<{ action: string; field: string; values?: string[] }> | undefined;
        if (!ops || ops.length === 0) return [];
        return ops.map((op) => [
          humanKey(op.field),
          op.action === "clear" ? "clear" : `${op.action}: ${humanValue(op.values)}`,
        ] as [string, string]);
      });
    case "record_decision":
      return [["Type", proposal.kind.replaceAll("_", " ")], ...Object.entries(proposal.value).map(([key, value]) => [humanKey(key), humanValue(value)] as [string, string])];
    case "add_itinerary_item":
      return [["Title", proposal.title], ["Day", String(proposal.dayIndex)]];
    case "save_place":
      return [
        ["Name", proposal.place.name],
        ["Category", humanValue(proposal.place.category)],
        ["Address", humanValue(proposal.place.address)],
      ];
    default:
      return [];
  }
}

// Phase 2.6.2 (docs/overhaul/roadmap/phase-2-speed.md): the first three labels now track real
// backend milestones (RESOLVE started / RETRIEVE started / COMPOSE started — see `progressStage`,
// driven by streamAssistantResponse's `onProgress`), not a fixed-timer guess. The last two stay
// timer-driven: once COMPOSE starts there's no finer server-side signal until its first token
// arrives, so these are a fallback ceiling for a turn that's still genuinely slow at that point —
// `Math.max` in `Typing` below means they only ever ADVANCE the label past wherever the real
// stage already put it, never regress it back to a stale-sounding one.
// index 1 ("Looking into it…") is itself a fallback now — `Typing` swaps it for
// `progressLabel` ("Finding places…", "Plotting the route…") whenever RESOLVE planned a tool
// this session recognizes, so the wait names what's actually happening instead of staying generic.
// Roam's voice while it works: a travel companion thinking out loud. Short, concrete, no jargon
// ("live sources"), and never a promise it might not keep ("Almost there" on a slow turn is a small
// lie). The long-wait line is honest instead of apologetic.
const THINKING_STATES = [
  "Thinking it through…",
  "Looking into it…",
  "Putting it together…",
  "Still on it…",
  "This one’s taking a little longer…",
];
const TYPING_MARK = ["thinking", "searching", "planning", "answering"] as const;
/** Ways into an empty conversation: three things nearly every trip starts with. */
const STARTERS = ["Plan my first day", "Where should we stay?", "What will this cost?"] as const;

/** Turns rendered when the chat opens, and added each time "Show earlier messages" is pressed. The
 *  thread itself is loaded whole (it is small); this is only how much of it is laid out at once. */
const VISIBLE_TURNS = 30;
/** How much of the remaining distance the follow-scroll covers each frame (lower = softer). */
const FOLLOW_EASE = 0.09;
const STAGE_PHASE: Record<"resolve" | "retrieve" | "compose", number> = { resolve: 0, retrieve: 1, compose: 2 };

/** "www.example.com/path" → "example.com": which site a source is, at a glance. */
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

function Typing({ stage, label }: { stage?: "resolve" | "retrieve" | "compose"; label?: string }) {
  const [timerPhase, setTimerPhase] = useState(0);
  useEffect(() => {
    const timers = [
      setTimeout(() => setTimerPhase(3), 11000),
      setTimeout(() => setTimerPhase(4), 20000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);
  const phase = Math.max(stage ? STAGE_PHASE[stage] : 0, timerPhase);
  // `label` names what RESOLVE actually planned ("checking places") — only meaningful while
  // "retrieve" is still the current phase; once the timer or a later stage has moved past it,
  // the phase-indexed generic text below takes back over rather than a now-stale activity name.
  const text = label && phase === STAGE_PHASE.retrieve ? `${label[0]!.toUpperCase()}${label.slice(1)}…` : THINKING_STATES[phase];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={motionTokens.swap}
      className="flex items-center gap-1.5 px-1 py-2"
    >
      {/* Roam's path mark mirrors the real stage: branching while it works out what you asked,
          searching while it checks sources, folding routes into one while it composes. */}
      <RoamMark state={TYPING_MARK[Math.min(phase, TYPING_MARK.length - 1)]} size={32} className="text-foreground" />
      {/* The label follows the stage: the old one lifts away as the new one settles in. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={text}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.22, ease }}
          className="shimmer-text ml-1 text-xs"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}

/** Roam's mark when a turn fails: the route breaks. Shown briefly under the log, then cleared
 *  by `ConversationSurface`. */
function TurnOutcome({ kind }: { kind: "error" }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      className="flex items-center gap-1.5 px-1 py-2"
    >
      <RoamMark state={kind} size={32} className="text-foreground" />
      <span className="ml-1 text-xs text-muted-foreground">Roam couldn’t reply</span>
    </motion.div>
  );
}

/** The width of the text beside an open detail panel: the narrowest the column ever is (512px less its padding), so the
 *  words never re-wrap when the column around them grows or shrinks (the sidebar collapsing, the window resizing). */
export const RAIL_MEASURE = "max-w-[28.5rem]";

/** An older reply's blocks without its follow-up chips. Cached per source array so the result keeps its identity (a fresh array each render would defeat the memoised AssistantMessage). */
const settledBlocks = new WeakMap<AssistantBlock[], AssistantBlock[]>();
function withoutChips(blocks: AssistantBlock[] | undefined) {
  if (!blocks) return blocks;
  let kept = settledBlocks.get(blocks);
  if (!kept) settledBlocks.set(blocks, (kept = blocks.filter((b) => b.type !== "actions" && b.type !== "clarifying_question")));
  return kept;
}

/**
 * Memoized: the Roam shell re-renders on every tab switch (and every panel open), and rebuilding a
 * long thread of cards, maps and tables for a change that touches neither cost ~180 ms of blocked
 * main thread on a mid-range phone. Every prop the shell passes is stable there, so this simply
 * does not re-render unless its own state does.
 */
export const ConversationSurface = React.memo(function ConversationSurface({
  tripId,
  onSurfaceSelect,
  onOpenPlace,
  onOpenStay,
  onOpenEvent,
  onOpenCollection,
  onOpenPanel,
  viewContext,
  rail = false,
  onLogScroll,
}: {
  tripId: string;
  onSurfaceSelect?: (surface: string) => void;
  onOpenPlace?: (place: PlaceCard) => void;
  /** `ask` hands Roam a question straight from the stay panel: the surface's own submit, so the panel never needs its own send path. */
  onOpenStay?: (stay: StayCardItem, dates: { checkin: string; checkout: string; adults?: number }, ask: (prompt: string) => void) => void;
  onOpenEvent?: (seed: EventSeed) => void;
  onOpenCollection?: (title: string, block: AssistantBlock) => void;
  onOpenPanel?: (panel: CardPanel) => void;
  /** Name of the place/stay the user has open beside the chat, for deictic references. */
  viewContext?: string;
  rail?: boolean;
  /** Wired directly to this surface's own scrollable log — not sniffed via a capture listener
   *  on some ancestor, which used to also pick up scroll events from horizontal card carousels
   *  (their `scrollTop` is always 0) and, once both chat surfaces stayed permanently mounted,
   *  from this surface's OWN background auto-scroll-to-bottom firing while the OTHER tab was the
   *  one actually visible. Both produced bogus deltas that flipped a shared header's visibility
   *  at the wrong moment. The parent passes this only when this surface is the active tab. */
  onLogScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}) {
  // The thread is this surface's own to load: from the session cache if it's warm, from
  // /api/trips/[tripId]/conversation otherwise. It used to also arrive as a prop on every trip
  // page's server render, which only ever duplicated the request made here a moment later.
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // The id of the message the server has not confirmed yet: "Sending…" belongs to it alone, and ends the moment the server has it, not when the whole reply is done.
  const [undelivered, setUndelivered] = useState<string | null>(null);
  // Set synchronously: two quick taps on a chip (or Enter twice) can both arrive before `sending` has re-rendered, and each used to send its own copy of the message.
  const sendingRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  // The thread's own load from the server has finished (or was not needed). The landing page's first message waits for it:
  // sent earlier, the load's rows are merged in while Roam's reply is streaming.
  const [synced, setSynced] = useState(false);
  // The sentence the landing page handed over, shown the moment the chat opens (before the thread has loaded and before
  // it is sent) so the visitor never sees an empty chat between the landing page and their own message.
  const [pendingFirst, setPendingFirst] = useState<{ text: string; key: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  // A guest who has used their free messages (the server said so) — the composer closes and the
  // save card opens. `saveOpen` is the softer version: they asked to save before running out.
  const [guestGate, setGuestGate] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const { guest, openGate } = useGuest();
  const [proposal, setProposal] = useState<ProposedCommand | null>(null);
  // Phase 2.6.2 (docs/overhaul/roadmap/phase-2-speed.md): the real backend milestone for the
  // in-flight turn, driving Typing's label — replaces a purely time-based guess.
  // A failed turn, shown with Roam's mark for a moment. (A successful one just ends with its text.)
  const [outcome, setOutcome] = useState<{ kind: "error"; at: number } | null>(null);
  useEffect(() => {
    if (!outcome) return;
    const timer = setTimeout(() => setOutcome(null), 4000);
    return () => clearTimeout(timer);
  }, [outcome]);
  const [progressStage, setProgressStage] = useState<"resolve" | "retrieve" | "compose" | undefined>(undefined);
  // What RESOLVE actually planned to look up ("checking places", "getting directions"), shown
  // during "retrieve" instead of Typing's generic label — undefined falls back to that generic
  // text (no tools planned, or none the label map recognizes).
  const [progressLabel, setProgressLabel] = useState<string | undefined>(undefined);
  const [cacheReady, setCacheReady] = useState(false);
  // How many of the newest turns the log renders; "Show earlier messages" adds another page of them.
  const [windowSize, setWindowSize] = useState(VISIBLE_TURNS);
  // Where the reading position was when that button was pressed, so revealing earlier turns above
  // doesn't shove the one you were reading off the screen.
  const olderAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  useKeepScrollGap(logRef);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speechBaseRef = useRef("");
  // When this state was last confirmed against the server — distinct from "now", so a local
  // edit (optimistic send, settled stream) doesn't silently re-arm the cache's freshness TTL.
  const verifiedAtRef = useRef(0);
  // Message ids treated as already-settled — restored history (the cache, a background merge)
  // must appear in place, not replay its whole entrance animation every time the log mounts.
  const [queued, setQueued] = useState<string | null>(null);
  const liveMessageIdsRef = useRef<Set<string>>(new Set());
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  // Dictation: transcript is appended after whatever was already typed when the mic started.
  const speech = useSpeechInput({
    onStart: () => {
      speechBaseRef.current = input.trim() ? `${input.trim()} ` : "";
    },
    onResult: (text) => setInput(speechBaseRef.current + text),
    onError: (message) => notifyToast(message, "error"),
  });

  useEffect(() => () => requestRef.current?.abort(), []);

  // A message typed while a reply was finishing goes out as soon as the reply is done.
  useEffect(() => {
    if (sending || queued === null) return;
    const next = queued;
    setQueued(null);
    void submit(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sending, queued]);

  // A `?ask=` param (from a detail page's "ask the assistant" link) pre-fills the composer once.
  useEffect(() => {
    const ask = new URLSearchParams(window.location.search).get("ask");
    if (!ask) return;
    setInput(ask);
    window.history.replaceState({}, "", window.location.pathname);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  // Restore the last visible conversation immediately, then reconcile with the server in the
  // background. This keeps tab changes instant without turning the client cache into truth.
  useEffect(() => {
    const cached = readConversationCache(tripId);
    if (cached) {
      setMessages(cached.messages);
      setLoaded(true);
      // Preserve the cache's real verification time — restoring it must not look like a fresh check.
      verifiedAtRef.current = cached.savedAt;
      for (const m of cached.messages) seenMessageIdsRef.current.add(m.id);
    }
    setCacheReady(true);
    // A quick tab round-trip should not hit the conversation API again. A new device has no
    // session cache, so it still loads the durable server thread immediately.
    if (cached && Date.now() - cached.savedAt < CONVERSATION_CACHE_TTL_MS) {
      setSynced(true);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/trips/${tripId}/conversation`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("load");
        return response.json();
      })
      .then((body) => {
        if (!controller.signal.aborted) {
          verifiedAtRef.current = Date.now();
          const fresh = (body.messages ?? []) as Message[];
          for (const m of fresh) seenMessageIdsRef.current.add(m.id);
          setMessages((current) => mergeConversationMessages(current, fresh));
          setLoaded(true);
          setSynced(true);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!cached) notifyToast("Couldn’t load the conversation — reload to try again.", "error");
        setLoaded(true);
        setSynced(true);
      });
    return () => controller.abort();
  }, [tripId]);

  useEffect(() => {
    if (cacheReady) writeConversationCache(tripId, messages, verifiedAtRef.current);
  }, [cacheReady, messages, tripId]);

  // Every message in THIS log is the direct result of the viewer's own action — typing and
  // pressing send, or tapping a follow-up/suggestion chip on an older message further up the
  // log (unlike group chat, personal chat has no other party whose message could land here
  // passively) — so a new one is always worth revealing, regardless of where the viewer is
  // currently scrolled. Live-caught: tapping "Tell me more →" on a card from earlier in the
  // conversation silently sent a new question with zero visual feedback, because this used to
  // only scroll when already within 160px of the bottom — correct for not yanking someone away
  // from content they're passively reading, wrong for an action they just deliberately took and
  // are waiting to see the result of. This scrolls unconditionally on that one event and then
  // stops — it does NOT keep chasing the reply as it streams in afterwards (see
  // `onAssistantDelta` below): reveal that a new exchange has started, then let the viewer read
  // at their own pace, exactly the balance asked for.
  const scrollToLatestMessage = useCallback(() => {
    const log = logRef.current;
    if (!log) return;
    // Scroll the log itself to its true max, not `endRef.scrollIntoView({block:"end"})` — that
    // aligned `endRef`'s position (right after the last message/followup chips, BEFORE the
    // `pb-28` clearance below it) with the container's bottom edge, so the reserved 112px gap
    // sat scrolled past, off-screen, doing nothing — the last message/card/suggestion landed
    // flush with the container's bottom edge instead, exactly where the floating composer
    // overlay sits on top of it. Live-caught: a fresh reply's follow-up chips ended up hidden
    // behind the composer both on initial load and right after sending. Scrolling the container
    // to `scrollHeight` instead lands on the true bottom, which correctly includes the `pb-28`
    // padding as visible trailing space above the composer.
    log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  }, []);

  // First landing: jump straight to the latest message, instantly. `scrollbar-slim` (the log's
  // own class) deliberately carries no `scroll-behavior: smooth` — see its definition in
  // app/globals.css for why — so a plain `scrollTop` assignment is already an instant jump,
  // no save/restore dance needed. Re-run once after layout in case card images reflow the height.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const jump = () => { log.scrollTop = log.scrollHeight; };
    jump();
    // Card images / blocks reflow the log taller just after mount — keep it pinned
    // to the bottom for a beat (no smoothing) so we don't land mid-conversation.
    const ids = [60, 200, 500].map((ms) => window.setTimeout(jump, ms));
    ids.push(requestAnimationFrame(jump));
    return () => ids.forEach((id) => { clearTimeout(id); cancelAnimationFrame(id); });
  }, [loaded]);

  useEffect(() => {
    scrollToLatestMessage();
    // A new message can carry place/event card images that finish loading a moment after this
    // fires, growing the log taller than what `scrollToLatestMessage` just measured — one call
    // can still fall short (live-caught: the last card partly behind the composer). Retry
    // shortly after to catch that late reflow. Scoped to this per-new-message effect (fires once
    // per real message, not per streamed token) rather than baked into `scrollToLatestMessage`
    // itself — see that function's own comment for why doing it there caused the page to
    // visibly bounce while a reply was actively streaming in.
    const t1 = setTimeout(scrollToLatestMessage, 200);
    const t2 = setTimeout(scrollToLatestMessage, 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [messages.length, scrollToLatestMessage]);

  // Follow the reply as it is written. The log eases down with the growing text — a damped
  // glide, never a jump — so the edge being written stays in view instead of running off under
  // the composer. It only starts once words are actually appearing, and the moment the viewer
  // scrolls or touches the log themselves it lets go for the rest of that turn, so it can never
  // fight someone who is reading back up.
  // `tail` keeps the glide going for a moment after the stream ends: the last words are still
  // being revealed then.
  const [tail, setTail] = useState(false);
  const wasSending = useRef(false);
  useEffect(() => {
    if (sending) {
      wasSending.current = true;
      setTail(false);
      return;
    }
    if (!wasSending.current) return;
    wasSending.current = false;
    setTail(true);
    const timer = setTimeout(() => setTail(false), 1600);
    return () => clearTimeout(timer);
  }, [sending]);
  const follow = sending || tail;
  useEffect(() => {
    const log = logRef.current;
    if (!follow || !log) return;
    let released = false;
    const release = () => { released = true; };
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    events.forEach((name) => log.addEventListener(name, release, { passive: true }));
    let frame = 0;
    const tick = () => {
      const reply = log.querySelector<HTMLElement>("[data-latest-reply]");
      if (!released && reply?.textContent?.trim()) {
        const gap = log.scrollHeight - log.clientHeight - log.scrollTop;
        if (gap > 0.5) log.scrollTop += Math.max(gap * FOLLOW_EASE, 0.6);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      events.forEach((name) => log.removeEventListener(name, release));
    };
  }, [follow]);

  // Scrolled off the top (fade the edge) / far above the latest message (offer a way back).
  const [scroll, setScroll] = useState({ scrolled: false, away: false });
  const handleLogScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const n = e.currentTarget;
    const scrolled = n.scrollTop > 4;
    const away = n.scrollHeight - n.clientHeight - n.scrollTop > n.clientHeight * 1.2;
    setScroll((s) => (s.scrolled === scrolled && s.away === away ? s : { scrolled, away }));
    onLogScroll?.(e);
  };

  const isMultiline = useAutoGrowTextarea(textareaRef, input);


  async function confirmProposal() {
    if (!proposal || confirming) return;
    if (guest) return openGate("save changes to your trip");
    setConfirming(true);
    try {
      const command =
        proposal.type === "record_decision"
          ? { ...proposal, idempotencyKey: proposal.idempotencyKey ?? crypto.randomUUID() }
          : proposal;
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      if (!response.ok) throw new Error("command");
      const body = await response.json().catch(() => ({}));
      setProposal(null);
      notifyToast(typeof body.changeImpact === "string" && body.changeImpact ? body.changeImpact : "Change saved.", "success");
      announceWorkspaceChange(
        command.type === "update_preferences"
          ? "preferences"
          : command.type === "record_decision"
            ? "decision"
            : command.type === "save_place"
              ? "places"
              : "itinerary",
      );
    } catch {
      notifyToast("That change couldn’t be saved.", "error");
    } finally {
      setConfirming(false);
    }
  }

  async function submit(rawContent: string, retryKey?: string) {
    const content = rawContent.trim();
    if (!content || !loaded || guestGate) return;
    // Enter while a reply is still finishing used to do nothing and leave the text in the box. Keep it, say so, and send it after.
    if (sending || sendingRef.current) {
      setQueued(content);
      setInput("");
      return;
    }
    if (speech.listening) speech.stop();
    haptic("tap");
    sendingRef.current = true;
    setSending(true);
    setOutcome(null);
    setInput("");
    const previous = messages;
    // Stable across every retry of THIS send (never a fresh crypto.randomUUID() per attempt) —
    // the server upserts on (thread, idempotency_key), so reusing it lets a retry collapse into
    // the original row instead of silently duplicating a message that actually saved fine the
    // first time but whose response the client never saw (a dropped connection, a timeout).
    const messageIdempotencyKey = retryKey ?? crypto.randomUUID();
    const userMessage: Message = { id: `local-${messageIdempotencyKey}`, role: "user", content, created_at: new Date().toISOString() };
    // Same id across retries too — don't stack a second bubble for a message already showing.
    const next = previous.some((m) => m.id === userMessage.id) ? previous : [...previous, userMessage];
    setMessages(next);
    setUndelivered(userMessage.id);
    let userSaved = false;
    try {
      const controller = new AbortController();
      requestRef.current = controller;
      let assistantId = "";
      setProgressStage(undefined);
      setProgressLabel(undefined);
      const result = await sendConversationMessage({
        tripId,
        content,
        viewContext,
        idempotencyKey: messageIdempotencyKey,
        onSurfaceSelect,
        // A guest can't save changes, so Roam's "save this preference?" proposals are not offered.
        onProposal: (next) => { if (!guest) setProposal(next); },
        onUserSaved: () => {
          userSaved = true;
          setUndelivered(null);
        },
        onAssistantStart: (responseId) => {
          assistantId = responseId;
          setMessages((current) => [
            ...current,
            { id: assistantId, role: "assistant", content: "", created_at: new Date().toISOString() },
          ]);
        },
        onAssistantDelta: (assistant) => {
          setMessages((current) => current.map((m) => (m.id === assistantId ? { ...m, content: assistant } : m)));
          // No auto-scroll here (deliberately — see `scrollToLatestMessage`'s comment). The
          // reveal already happened once, when this message was added; the user reads down into
          // it at their own pace rather than being dragged along as it keeps growing.
        },
        onProgress: (stage, label) => {
          setProgressStage(stage);
          setProgressLabel(label);
        },
        signal: controller.signal,
      });
      // Settle the streamed bubble in place: sanitized text + the structured blocks from the
      // meta frame. No refetch, so ids stay stable and nothing re-mounts.
      setMessages((current) =>
        current.map((m) =>
          m.id === assistantId
            ? { ...m, content: result.content || m.content, metadata: result.meta ? (result.meta as unknown as Record<string, unknown>) : m.metadata }
            : m,
        ),
      );
      // The resolver may have persisted core trip facts or pending suggestions during this turn.
      // Refresh server-rendered workspace surfaces so “What we know” reflects the same response.
      announceWorkspaceChange("preferences");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof AssistantRequestError && (err.code === "guest_limit" || err.code === "guest_busy")) {
        // Not saved, so nothing to retry: hand the text back and ask them to save the trip.
        setMessages(previous);
        setInput(content);
        setGuestGate(true);
        return;
      }
      if (userSaved) setOutcome({ kind: "error", at: Date.now() });
      setMessages(userSaved ? next : previous);
      // Not saved: the text would otherwise exist only inside the toast's Retry. Put it back in the box (unless they have already started something new).
      if (!userSaved) setInput((current) => current || content);
      const aiError = err instanceof AssistantRequestError;
      const message = userSaved
        ? aiError && err.status === 429
          ? "Roam is busy right now — your message is saved."
          : "Roam couldn’t reply — your message is saved."
        : "Your message didn’t send.";
      notifyToast(message, "error", { label: "Retry", onClick: () => void submit(content, messageIdempotencyKey) });
    } finally {
      requestRef.current = null;
      sendingRef.current = false;
      setSending(false);
      setUndelivered(null);
    }
  }

  function stop() {
    requestRef.current?.abort();
    sendingRef.current = false;
    setSending(false);
    setMessages((current) => current.filter((m) => !(m.role === "assistant" && !m.content.trim())));
  }

  useLayoutEffect(() => {
    let text: string | null = null;
    try {
      text = window.sessionStorage.getItem(`wn:first-message:${tripId}`);
    } catch {
      /* storage blocked: no hand-off */
    }
    if (!text?.trim()) return;
    const key = crypto.randomUUID();
    // Its bubble is already on screen, so the real one that replaces it does not rise in again.
    seenMessageIdsRef.current.add(`local-${key}`);
    setPendingFirst({ text: text.trim(), key });
  }, [tripId]);

  // A slow load must not hold the visitor's first message forever: after a few seconds it goes anyway (the merge keeps the order).
  useEffect(() => {
    const timer = setTimeout(() => setSynced(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  // The landing page's prompt box creates the trip and drops its sentence here: it becomes the
  // first message, sent once the (empty) thread has loaded — the visitor lands mid-conversation.
  // Deferred a tick so React's dev-only mount/unmount/mount pass can't consume the sentence and
  // then abort the send (the unmount cleanup above aborts any in-flight request).
  useEffect(() => {
    // A fresh thread already holds Roam's greeting, so "empty" means no message from the visitor yet.
    // The thread has to be loaded first (see `synced`), or the sentence is sent against a thread whose
    // own rows arrive after it — the 4 s timer above keeps a slow load from holding it forever.
    if (!loaded || !synced || sending || messages.some((m) => m.role === "user")) return;
    const timer = setTimeout(() => {
      const key = `wn:first-message:${tripId}`;
      const first = window.sessionStorage.getItem(key);
      if (!first) return;
      window.sessionStorage.removeItem(key);
      void submit(first, pendingFirst?.text === first.trim() ? pendingFirst.key : undefined);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the thread has loaded empty
  }, [loaded, synced, pendingFirst]);

  const userTurns = messages.filter((m) => m.role === "user").length;
  const turnsLeft = Math.max(0, GUEST_TURN_LIMIT - userTurns);

  // Stable for the life of the surface: the callbacks read the latest props through a ref, so typing in the composer or
  // opening the side panel does not hand every reply new handlers and re-render the whole log.
  const latest = useRef({ submit, onOpenPlace, onOpenStay, onOpenEvent, onOpenCollection, onOpenPanel });
  useLayoutEffect(() => {
    latest.current = { submit, onOpenPlace, onOpenStay, onOpenEvent, onOpenCollection, onOpenPanel };
  });
  // Earlier turns appear above what you were reading, so hold that line in place rather than letting the
  // log grow upward under the viewport (the same anchor the group chat uses when it pages in history).
  useLayoutEffect(() => {
    const anchor = olderAnchorRef.current;
    const log = logRef.current;
    if (!anchor || !log) return;
    log.scrollTop = anchor.top + (log.scrollHeight - anchor.height);
    olderAnchorRef.current = null;
  }, [windowSize]);

  const [hasPlace, hasStay, hasEvent, hasCollection, hasPanel] = [onOpenPlace, onOpenStay, onOpenEvent, onOpenCollection, onOpenPanel].map(Boolean);
  const handlers = useMemo<BlockHandlers>(() => ({
    tripId,
    onFollowup: (prompt) => void latest.current.submit(prompt),
    onOpenPlace: hasPlace ? (place) => latest.current.onOpenPlace?.(place) : undefined,
    onOpenStay: hasStay ? (stay, dates) => latest.current.onOpenStay?.(stay, dates, (prompt) => void latest.current.submit(prompt)) : undefined,
    onOpenEvent: hasEvent ? (seed) => latest.current.onOpenEvent?.(seed) : undefined,
    onOpenCollection: hasCollection ? (title, block) => latest.current.onOpenCollection?.(title, block) : undefined,
    onOpenPanel: hasPanel ? (panel) => latest.current.onOpenPanel?.(panel) : undefined,
  }), [tripId, hasPlace, hasStay, hasEvent, hasCollection, hasPanel]);

  const proposalRows = proposal ? describeProposal(proposal) : [];
  const proposalText =
    proposal?.type === "update_preferences" && typeof proposal.preferences.budget === "number" && Object.keys(proposal.preferences).length === 1
      ? `Set the daily budget to ${proposal.preferences.budget} per person?`
      : proposal?.type === "update_preferences"
        ? `Save ${proposalRows.length === 1 ? "this preference" : "these preferences"}: ${proposalRows.map(([k]) => k.toLowerCase()).join(", ")}?`
        : proposal?.type === "record_decision"
          ? `Record this ${proposal.kind.replaceAll("_", " ")} decision?`
          : proposal?.type === "add_itinerary_item"
            ? `Add “${proposal.title}” to day ${proposal.dayIndex}?`
            : proposal?.type === "save_place"
              ? `Save “${proposal.place.name}” to the trip?`
              : "Apply this proposed trip change?";

  // A message Roam never answered: the connection dropped before the reply was saved (tab closed, phone locked).
  // Re-sending under the same key is safe: the server upserts the user's message, so it is not duplicated.
  const lastMessage = messages[messages.length - 1];
  const unanswered =
    loaded && !sending && !queued && lastMessage?.role === "user" && !String(lastMessage.id).startsWith("local-") && typeof lastMessage.idempotency_key === "string" && lastMessage.idempotency_key.startsWith("user:") && Date.now() - new Date(lastMessage.created_at).getTime() > 45_000
      ? lastMessage
      : null;

  // What the log actually renders. The whole thread is in memory either way — this is about the main
  // thread: laying out a 128-turn history (every card, map and table in it) blocked a mid-range phone for
  // ~650 ms, half a second of nothing when the chat opens. Earlier turns render on request, like the
  // group chat's own "Show earlier messages".
  const hiddenCount = Math.max(0, messages.length - windowSize);
  const visible = hiddenCount > 0 ? messages.slice(hiddenCount) : messages;
  const showEarlier = () => {
    const log = logRef.current;
    if (log) olderAnchorRef.current = { height: log.scrollHeight, top: log.scrollTop };
    setWindowSize((n) => n + VISIBLE_TURNS);
  };

  const pendingBubble = pendingFirst !== null && !messages.some((m) => m.role === "user");
  const showHero = loaded && messages.length === 0 && !rail && !pendingBubble;
  const waiting = (sending && messages[messages.length - 1]?.content.trim() === "") || pendingBubble;

  const canSend = loaded && Boolean(input.trim());
  const micButton = speech.supported && <MicButton listening={speech.listening} disabled={!loaded || sending} onToggle={speech.toggle} hasText={canSend} />;
  const sendOrStopButton = <SendButton canSend={canSend} stopping={sending} onStop={stop} micShown={speech.supported} />;

  return (
    <div className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden">
      {/* A long thread has a tab stop on every card and button; this is the way past them all. */}
      <a
        href={`#${tripId}-roam-composer`}
        onClick={(event) => {
          event.preventDefault();
          textareaRef.current?.focus();
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-20 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to message box
      </a>
      {/* `relative`: the sr-only labels inside are absolutely positioned; without a positioned log they anchored to the
          wrapper outside it and stretched ITS scroll area by thousands of px — a second scrollbar stacked on this one. */}
      {/* `overscroll-contain`: without it, running out of content to scroll at the top/bottom
          lets the gesture "chain" into bouncing the whole page instead of staying inside this
          log — the rubber-band should feel self-contained here, the same way a native app's
          message list never drags the rest of the screen along with it. */}
      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 z-[1] h-5 bg-gradient-to-b from-background to-transparent transition-opacity duration-200 lg:hidden", scroll.scrolled ? "opacity-100" : "opacity-0")} />
      <div ref={logRef} onScroll={handleLogScroll} data-scrolled={scroll.scrolled} role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions" className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-slim scroll-fade-t">
        <div className={cn("mx-auto w-full space-y-6 pt-2 pb-28", PHONE_V2 ? "max-lg:pt-3" : "max-lg:pt-16", rail ? RAIL_MEASURE : "max-w-2xl")}>
          {!loaded && messages.length === 0 && !pendingBubble && (
            <div aria-hidden className="space-y-6">
              <div className="flex justify-end">
                <div className="h-9 w-40 skeleton rounded-2xl rounded-br-lg" />
              </div>
              <div className="space-y-2">
                <div className="h-3.5 w-11/12 skeleton rounded" />
                <div className="h-3.5 w-4/5 skeleton rounded" />
                <div className="mt-3 h-28 w-full skeleton rounded-2xl" />
              </div>
              <div className="flex justify-end">
                <div className="h-9 w-52 skeleton rounded-2xl rounded-br-lg" />
              </div>
            </div>
          )}

          {showHero && (
            <div className="pt-2 pb-2 text-center">
              {/* The opening shot: the mark, the line, the explanation, then a few ways in, each a beat apart. */}
              <Reveal y={8}>
                <RoamMark state="idle" size={112} label="Roam" className="mx-auto block text-foreground" />
              </Reveal>
              <Reveal delay={0.12} y={12}>
                <h2 className="mt-5 font-display text-3xl font-medium tracking-[-0.03em] text-balance">Where shall we begin?</h2>
              </Reveal>
              <Reveal delay={0.2} y={10}>
                <p className="mx-auto mt-3 max-w-md text-body leading-relaxed text-ink-soft text-pretty">
                  No forms. Tell me as much or as little as you like — I&rsquo;ll keep the trip details organised and open a
                  proper view when something is easier to see than to describe.
                </p>
              </Reveal>
              <Stagger delay={0.34} gap={0.07} className="mt-6 flex flex-wrap justify-center gap-2">
                {STARTERS.map((starter) => (
                  <StaggerItem key={starter}>
                    <button type="button" disabled={guestGate} onClick={() => setInput(starter)} className="btn-chip h-9 px-4 text-sm disabled:opacity-50">
                      {starter}
                    </button>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          )}

          {hiddenCount > 0 && (
            <div className="flex justify-center pb-2">
              <button type="button" onClick={showEarlier} className={cn("btn-chip h-9 px-4 text-xs", PHONE_V2 && "max-lg:h-10 max-lg:border-0 max-lg:bg-secondary max-lg:text-sm max-lg:font-semibold max-lg:text-ink-soft")}>Show earlier messages</button>
            </div>
          )}

          {visible.map((message, index) => {
            const meta = message.metadata as AssistantTurnMeta | undefined;
            const streaming = message.role === "assistant" && sending && index === visible.length - 1;
            const dir =
              message.role === "assistant" && meta?.language && RTL.has(meta.language.slice(0, 2)) ? "rtl" : undefined;
            // Only a message appearing for the first time in this mount gets the entrance
            // animation; restored history settles in place immediately.
            const isNew = !seenMessageIdsRef.current.has(message.id);
            if (isNew) {
              seenMessageIdsRef.current.add(message.id);
              liveMessageIdsRef.current.add(message.id);
            }
            // `isNew` is only true on a message's first render; its cards arrive later, so the live flag is remembered.
            const live = liveMessageIdsRef.current.has(message.id);

            if (message.role === "user") {
              return (
                <motion.div
                  key={message.id}
                  // The message leaves the composer: it rises from the bottom-right corner and settles.
                  initial={isNew ? { opacity: 0, y: 18, scale: 0.9 } : false}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30, opacity: { duration: 0.16 } }}
                  style={{ transformOrigin: "100% 100%" }}
                  className="flex flex-col items-end gap-1"
                >
                  <p className={cn("max-w-[85%] rounded-2xl rounded-br-lg bg-primary px-4 py-2.5 text-body leading-normal text-primary-foreground transition-opacity duration-300 dark:border dark:border-border dark:bg-surface-raised dark:text-foreground", undelivered === message.id && "opacity-70")}>
                    <span className="sr-only">You: </span>
                    {message.content}
                  </p>
                  {/* Until the server has the message it carries a local id: say so, rather than leaving "did that go?" */}
                  {undelivered === message.id && <span role="status" className="pr-1 text-xs text-muted-foreground">Sending…</span>}
                </motion.div>
              );
            }

            const unavailable = streaming ? [] : unavailableLabels(meta?.unavailableProviders);
            const sources = streaming ? [] : (meta?.sources ?? []);
            // Chips answer the reply they came with; once the conversation moves on they are stale.
            const isLatest = index === messages.length - 1;
            const blocks = isLatest ? meta?.blocks : withoutChips(meta?.blocks);
            // One quiet note instead of a stack of separate grey lines.
            const notes: Array<{ text: string; tone: "neutral" | "caution" | "destructive" }> = [];
            if (!streaming && meta?.degraded) notes.push({ text: "Answered from your trip details — the planner had trouble reading that one. Rephrasing may help.", tone: "neutral" });
            if (!streaming && meta?.persistFailed) notes.push({ text: "This reply wasn’t saved — it may be gone if you reload.", tone: "destructive" });
            if (!streaming && meta?.truncated) notes.push({ text: "This answer may have been cut off — ask again if it looks incomplete.", tone: "neutral" });
            if (unavailable.length > 0) notes.push({ text: `Couldn’t check ${unavailable.join(", ")} just now — this is from your trip so far.`, tone: "neutral" });

            return (
              <motion.div
                key={message.id}
                initial={isNew ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 240, damping: 26 }}
                dir={dir}
                data-latest-reply={index === messages.length - 1 ? "" : undefined}
                aria-busy={streaming || undefined}
                // The reply reveals itself word by word (AssistantMessage → StreamedText); the
                // "answering" mark below the log only shows while Roam is still working out what to say.
                className="turn space-y-3"
              >
                <span className="sr-only">Roam: </span>
                <AssistantMessage content={message.content} blocks={blocks} handlers={handlers} streaming={streaming} live={live} />
                {notes.length > 0 && (
                  <div role="note" className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
                    <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                    <div className="space-y-1">
                      {notes.map((note) => (
                        <p key={note.text} className={note.tone === "destructive" ? "text-destructive" : undefined}>{note.text}</p>
                      ))}
                    </div>
                  </div>
                )}
                {(sources.length > 0 || (message.content.trim() && !streaming)) && (
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    {sources.length > 0 ? (
                      <details className="group min-w-0 flex-1 text-xs text-muted-foreground">
                        <summary className="flex w-fit cursor-pointer list-none select-none items-center gap-1 py-1.5 transition-colors hover:text-foreground">
                          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden /> Sources ({sources.length})
                        </summary>
                        <ul className="mt-1 space-y-1.5 pl-5">
                          {sources.map((source) => (
                            <li key={source.url}>
                              <a href={source.url} target="_blank" rel="noreferrer noopener" className="underline-offset-2 transition-colors hover:text-foreground hover:underline">
                                {source.title}
                              </a>
                              <span className="ml-1.5 opacity-85">{hostOf(source.url)}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <span />
                    )}
                    {/* Copy rests quietly: on a mouse it appears when the reply is under the pointer (the latest always shows it); on touch it is always there. */}
                    {message.content.trim() && !streaming && (
                      <span className={cn(!isLatest && "turn-action")}>
                        <CopyButton text={message.content} tabbable={isLatest} />
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}

          {pendingBubble && pendingFirst && (
            <div className="flex flex-col items-end gap-1">
              <p className="max-w-[85%] rounded-2xl rounded-br-lg bg-primary px-4 py-2.5 text-body leading-normal text-primary-foreground dark:border dark:border-border dark:bg-surface-raised dark:text-foreground">
                <span className="sr-only">You: </span>
                {pendingFirst.text}
              </p>
            </div>
          )}
          {unanswered && (
            <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              Roam didn&rsquo;t get to answer this one.
              <button type="button" onClick={() => void submit(unanswered.content, (unanswered.idempotency_key as string).slice("user:".length))} className="link-underline font-medium text-foreground">
                Try again
              </button>
            </p>
          )}

          <div role="status" aria-live="polite">
            {/* Roam's mark while it works (thinking → searching → planning). It hands over to the
                text itself as soon as the first words arrive — nothing trails the reply. */}
            <AnimatePresence initial={false}>
              {waiting ? (
                <Typing key="typing" stage={progressStage} label={progressLabel} />
              ) : outcome ? (
                <TurnOutcome key={`${outcome.kind}-${outcome.at}`} kind={outcome.kind} />
              ) : null}
            </AnimatePresence>
          </div>

          {proposal && (
            <div role="region" aria-label="Confirm change" className="rounded-2xl border border-border bg-card p-4 shadow-soft">

            <p className="text-sm leading-relaxed">{proposalText}</p>
            {proposalRows.length > 0 && (
              <details className="group mt-3">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                  <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                  See exactly what will be saved
                </summary>
                <dl className="mt-1.5 space-y-1 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs leading-relaxed">
                  {proposalRows.map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <dt className="w-24 shrink-0 font-medium text-muted-foreground">{key}</dt>
                      <dd className="min-w-0 break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            <div className="mt-4 flex items-center gap-2">
              <button type="button" onClick={() => void confirmProposal()} disabled={confirming} className="btn-primary-sm">
                {confirming ? "Saving…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setProposal(null)}
                disabled={confirming}
                className={controlSecondary}
              >
                Cancel
              </button>
            </div>
            </div>
          )}

          {guest && !guestGate && !saveOpen && userTurns >= 2 && (
            <p className="text-center text-xs text-muted-foreground">
              {turnsLeft} free {turnsLeft === 1 ? "message" : "messages"} left ·{" "}
              <button type="button" onClick={() => setSaveOpen(true)} className="link-underline font-medium text-foreground">
                Save your trip
              </button>
            </p>
          )}
          {(guestGate || saveOpen) && <GuestSavePrompt tripId={tripId} exhausted={guestGate} />}
        </div>
      </div>

      <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background from-55% to-transparent px-3 pt-8 pb-3", PHONE_V2 && "max-lg:bg-none max-lg:pt-0")}>
        <div className={cn("pointer-events-auto relative mx-auto w-full min-w-0", rail ? RAIL_MEASURE : "max-w-2xl")}>
          <AnimatePresence>
            {scroll.away && (
              <motion.button
                key="latest"
                type="button"
                onClick={scrollToLatestMessage}
                aria-label="Jump to latest message"
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={motionTokens.swap}
                whileTap={{ scale: 0.97 }}
                className={cn("absolute inset-x-0 bottom-full mx-auto mb-2 flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-ink-soft shadow-lift transition-colors hover:text-ink", PHONE_V2 && "max-lg:size-10 max-lg:justify-center max-lg:border-0 max-lg:p-0 max-lg:shadow-[0_6px_18px_-6px_rgb(29_26_23/0.35),0_0_0_1px_var(--color-hairline)]")}
              >
                <ArrowDown className="size-3.5 max-lg:size-[1.125rem]" aria-hidden />
                <span className={cn(PHONE_V2 && "max-lg:sr-only")}>Latest</span>
              </motion.button>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
          {queued !== null && (
            <motion.div
              key="queued"
              initial={{ opacity: 0, y: 8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: 4, height: 0 }}
              transition={motionTokens.swap}
              className="overflow-hidden"
            >
            <div role="status" className="mb-2 flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-soft">
              <span className="min-w-0 flex-1 truncate">Next: “{queued}” · sends when Roam finishes</span>
              <button type="button" onClick={() => { setInput(queued); setQueued(null); }} className={textAction}>Edit</button>
              <button type="button" onClick={() => setQueued(null)} className={textAction}>Cancel</button>
            </div>
            </motion.div>
          )}
          </AnimatePresence>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void submit(input);
            }}
            className={cn(
              "flex w-full min-w-0 max-w-full flex-col gap-1 rounded-3xl border border-input bg-card py-1.5 pl-4 pr-1.5 shadow-lift transition-[border-color,box-shadow] duration-200 ease-out",
              PHONE_V2 && "max-lg:pr-1.5 max-lg:pl-5",
              "focus-within:border-ink/30 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-ink)_6%,transparent),var(--shadow-lift)]",
              PHONE_V2 && "max-lg:border-transparent max-lg:bg-secondary max-lg:shadow-none max-lg:focus-within:border-transparent max-lg:focus-within:shadow-none",
              sending && "composer-live",
            )}
          >
            {/* The buttons overlay this box (single line) or sit in their own row below it
                (multiple lines) — see the matching comment on GroupChatSurface's identical
                pattern for why: switching which JSX branch renders the TEXTAREA itself (not just
                the buttons around it) used to tear the DOM node down and rebuild it on every line
                wrap, dropping focus and the cursor mid-keystroke — live-caught as "the box grows
                but I can't type on the new line until I press Enter again," and the padding
                below is reserved unconditionally (not just while the overlay is showing) so the
                text's own wrapping width never changes between the two layouts — letting it
                change was a second bug, where text that wrapped to 2 lines at the narrower width
                could fit back on 1 at the wider one, flipping the layout back, narrowing it
                again, wrapping again — the "gets stuck and won't shrink back down" the box
                never actually settled at. */}
            <div className="relative w-full">
              <textarea
                ref={textareaRef}
                id={`${tripId}-roam-composer`}
                aria-label="Message"
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  // isComposing (and the legacy keyCode 229) is true for the Enter that CONFIRMS an
                  // IME candidate (Japanese/Chinese/Korean input) — that keystroke must not also submit.
                  // On a phone Return makes a new line and the arrow sends, exactly as in the group chat; with a keyboard it sends.
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && !window.matchMedia("(pointer: coarse)").matches) {
                    event.preventDefault();
                    void submit(input);
                  }
                }}
                placeholder={!loaded ? "Loading…" : guestGate ? "Save your trip to keep chatting" : speech.listening ? "Listening…" : sending ? "Type your next message…" : "Ask about your trip…"}
                disabled={!loaded || guestGate}
                className="block max-h-[96px] w-full resize-none overflow-y-auto scrollbar-slim bg-transparent py-2 pr-24 text-base leading-normal outline-none transition-[height] duration-150 ease-out placeholder:text-muted-foreground disabled:opacity-60"
              />
              {!isMultiline && (
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1">
                  {micButton}
                  {sendOrStopButton}
                </div>
              )}
            </div>
            {isMultiline && (
              <div className="flex items-center justify-end gap-1">
                {micButton}
                {sendOrStopButton}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
});
