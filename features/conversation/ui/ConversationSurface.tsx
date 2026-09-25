"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowUp, ChevronRight, Copy, Mic } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import type { AssistantBlock, AssistantTurnMeta, PlaceCard, ProposedCommand, StayCardItem } from "@/packages/contracts/assistant";
import type { EventSeed } from "@/components/TripPanelProvider";
import type { Message } from "../domain/message";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { useSpeechInput } from "@/lib/use-speech-input";
import { useAutoGrowTextarea } from "@/lib/use-autogrow-textarea";
import { AssistantMessage } from "./AssistantMessage";
import { AssistantRequestError } from "../application/streamAssistantResponse";
import { sendConversationMessage } from "../application/sendConversationMessage";
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
  for (const message of current) {
    if (byId.has(message.id)) continue;
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
    const hasServerTwin = userLocalKey
      ? fresh.some((c) => c.role === "user" && c.idempotency_key === `user:${userLocalKey}`)
      : assistantLocalKey
        ? fresh.some((c) => c.role === "assistant" && c.idempotency_key === `assistant:${assistantLocalKey}`)
        : message.role === "user"
          ? fresh.some((c) => c.role === "user" && c.content === message.content && Math.abs(Date.parse(c.created_at) - Date.parse(message.created_at)) < 60_000)
          : message.content.trim().length > 0 &&
            fresh.some((c) => c.role === "assistant" && c.content.trim() === message.content.trim() && Math.abs(Date.parse(c.created_at) - Date.parse(message.created_at)) < 5 * 60_000);
    if (!hasServerTwin) byId.set(message.id, message);
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
// index 1 ("Checking live sources…") is itself a fallback now — `Typing` swaps it for
// `progressLabel` ("Checking places…", "Getting directions…") whenever RESOLVE planned a tool
// this session recognizes, so the wait names what's actually happening instead of staying generic.
const THINKING_STATES = [
  "Thinking through your trip…",
  "Checking live sources…",
  "Pulling the details together…",
  "Almost there…",
  "Still working — this one's taking a bit…",
];
const STAGE_PHASE: Record<"resolve" | "retrieve" | "compose", number> = { resolve: 0, retrieve: 1, compose: 2 };

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
    <div className="flex items-center gap-1.5 px-1 py-2">
      {/* Roam's path mark mirrors the real stage: wandering while it works out what you asked,
          weighing routes while it checks sources, then leading the way once it's composing. */}
      <RoamMark state={phase === 0 ? "thinking" : phase === 1 ? "planning" : "answering"} size={18} className="text-foreground" />
      <span className="ml-1 text-xs text-muted-foreground">{text}</span>
    </div>
  );
}

export function ConversationSurface({
  tripId,
  initialMessages,
  onSurfaceSelect,
  onOpenPlace,
  onOpenStay,
  onOpenEvent,
  onOpenCollection,
  viewContext,
  rail = false,
  onLogScroll,
}: {
  tripId: string;
  initialMessages?: Array<Record<string, unknown>>;
  onSurfaceSelect?: (surface: string) => void;
  onOpenPlace?: (place: PlaceCard) => void;
  onOpenStay?: (stay: StayCardItem, dates: { checkin: string; checkout: string }) => void;
  onOpenEvent?: (seed: EventSeed) => void;
  onOpenCollection?: (title: string, block: AssistantBlock) => void;
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
  const [messages, setMessages] = useState<Message[]>((initialMessages ?? []) as Message[]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(Boolean(initialMessages));
  const [confirming, setConfirming] = useState(false);
  const [proposal, setProposal] = useState<ProposedCommand | null>(null);
  // Phase 2.6.2 (docs/overhaul/roadmap/phase-2-speed.md): the real backend milestone for the
  // in-flight turn, driving Typing's label — replaces a purely time-based guess.
  const [progressStage, setProgressStage] = useState<"resolve" | "retrieve" | "compose" | undefined>(undefined);
  // What RESOLVE actually planned to look up ("checking places", "getting directions"), shown
  // during "retrieve" instead of Typing's generic label — undefined falls back to that generic
  // text (no tools planned, or none the label map recognizes).
  const [progressLabel, setProgressLabel] = useState<string | undefined>(undefined);
  const [cacheReady, setCacheReady] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speechBaseRef = useRef("");
  // When this state was last confirmed against the server — distinct from "now", so a local
  // edit (optimistic send, settled stream) doesn't silently re-arm the cache's freshness TTL.
  const verifiedAtRef = useRef(0);
  // Message ids treated as already-settled — restored history (SSR props, cache, a background
  // merge) must appear in place, not replay its whole entrance animation every time the log
  // mounts. Seeded with whatever came from the server so the very first paint doesn't animate.
  const seenMessageIdsRef = useRef<Set<string>>(new Set((initialMessages ?? []).map((m) => String(m.id))));
  // `data.conversation` (this component's `initialMessages` prop) is a fresh array reference on
  // every server render — TripDataProvider's router.refresh() fires for ANY workspace change,
  // not just a conversation one, and this component's own submit() triggers exactly that after
  // every send. Reading it via a ref keeps the reconciliation effect below from treating that
  // reference churn as new data to reconcile against on every single turn.
  const initialMessagesRef = useRef(initialMessages);
  initialMessagesRef.current = initialMessages;

  // Dictation: transcript is appended after whatever was already typed when the mic started.
  const speech = useSpeechInput({
    onStart: () => {
      speechBaseRef.current = input.trim() ? `${input.trim()} ` : "";
    },
    onResult: (text) => setInput(speechBaseRef.current + text),
    onError: (message) => notifyToast(message, "error"),
  });

  useEffect(() => () => requestRef.current?.abort(), []);

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
    const initialLatest = Math.max(0, ...(initialMessagesRef.current ?? []).map((message) => Date.parse(String(message.created_at ?? "")) || 0));
    if (cached && cached.savedAt >= initialLatest) {
      setMessages(cached.messages);
      setLoaded(true);
      // Preserve the cache's real verification time — restoring it must not look like a fresh check.
      verifiedAtRef.current = cached.savedAt;
      for (const m of cached.messages) seenMessageIdsRef.current.add(m.id);
    }
    setCacheReady(true);
    // A quick tab round-trip should not hit the conversation API again. A new device has no
    // session cache, so it still loads the durable server thread immediately.
    if (cached && Date.now() - cached.savedAt < CONVERSATION_CACHE_TTL_MS) return;
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
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!cached && !initialMessagesRef.current) notifyToast("Couldn’t load the conversation — reload to try again.", "error");
        setLoaded(true);
      });
    return () => controller.abort();
    // Deliberately not depending on initialMessages — see initialMessagesRef above. This effect
    // is a one-time-per-trip reconciliation, not a continuous sync with the parent's data prop.
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

  const isMultiline = useAutoGrowTextarea(textareaRef, input);

  async function confirmProposal() {
    if (!proposal || confirming) return;
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
    if (!content || sending || !loaded) return;
    if (speech.listening) speech.stop();
    setSending(true);
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
        onProposal: setProposal,
        onUserSaved: () => {
          userSaved = true;
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
      setMessages(userSaved ? next : previous);
      const aiError = err instanceof AssistantRequestError;
      const message = userSaved
        ? aiError && err.status === 429
          ? "Roam is busy right now — your message is saved."
          : "Roam couldn’t reply — your message is saved."
        : "Your message didn’t send.";
      notifyToast(message, "error", { label: "Retry", onClick: () => void submit(content, messageIdempotencyKey) });
    } finally {
      requestRef.current = null;
      setSending(false);
    }
  }

  function stop() {
    requestRef.current?.abort();
    setSending(false);
    setMessages((current) => current.filter((m) => !(m.role === "assistant" && !m.content.trim())));
  }

  const handlers = {
    tripId,
    onFollowup: (prompt: string) => {
      void submit(prompt);
    },
    onOpenPlace,
    onOpenStay,
    onOpenEvent,
    onOpenCollection,
  };

  const proposalRows = proposal ? describeProposal(proposal) : [];
  const proposalText =
    proposal?.type === "update_preferences" && typeof proposal.preferences.budget === "number" && Object.keys(proposal.preferences).length === 1
      ? `Set the daily budget assumption to $${proposal.preferences.budget}?`
      : proposal?.type === "update_preferences"
        ? `Save ${proposalRows.length === 1 ? "this preference" : "these preferences"}: ${proposalRows.map(([k]) => k.toLowerCase()).join(", ")}?`
        : proposal?.type === "record_decision"
          ? `Record this ${proposal.kind.replaceAll("_", " ")} decision?`
          : proposal?.type === "add_itinerary_item"
            ? `Add “${proposal.title}” to day ${proposal.dayIndex}?`
            : proposal?.type === "save_place"
              ? `Save “${proposal.place.name}” to the trip?`
              : "Apply this proposed trip change?";

  const showHero = loaded && messages.length === 0 && !rail;
  const waiting = sending && messages[messages.length - 1]?.content.trim() === "";

  const micButton = speech.supported && (
    <button
      type="button"
      onClick={speech.toggle}
      aria-label={speech.listening ? "Stop dictation" : "Dictate your message"}
      aria-pressed={speech.listening}
      disabled={!loaded || sending}
      className={cn(
        "pointer-events-auto grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors disabled:opacity-40",
        speech.listening ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-border/60 text-muted-foreground hover:text-foreground",
      )}
    >
      <Mic className={cn("h-4 w-4", speech.listening && "animate-pulse")} />
    </button>
  );

  const sendOrStopButton = sending ? (
    <button
      type="button"
      onClick={stop}
      className="pointer-events-auto shrink-0 rounded-full border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive"
    >
      Stop
    </button>
  ) : (
    <button
      type="submit"
      aria-label="Send"
      disabled={!loaded || !input.trim()}
      className="pointer-events-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-35"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );

  return (
    <div className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden">
      {/* `overscroll-contain`: without it, running out of content to scroll at the top/bottom
          lets the gesture "chain" into bouncing the whole page instead of staying inside this
          log — the rubber-band should feel self-contained here, the same way a native app's
          message list never drags the rest of the screen along with it. */}
      <div ref={logRef} onScroll={onLogScroll} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-slim">
        <div className={cn("mx-auto w-full max-w-full space-y-6 pt-2 pb-28", rail ? "px-1" : "max-w-2xl")}>
          {!loaded && messages.length === 0 && (
            <div aria-hidden className="space-y-6">
              <div className="flex justify-end">
                <div className="h-9 w-40 animate-pulse bg-foreground/8 rounded-2xl rounded-br-lg" />
              </div>
              <div className="space-y-2">
                <div className="h-3.5 w-11/12 animate-pulse bg-foreground/8 rounded" />
                <div className="h-3.5 w-4/5 animate-pulse bg-foreground/8 rounded" />
                <div className="mt-3 h-28 w-full animate-pulse bg-foreground/8 rounded-2xl" />
              </div>
              <div className="flex justify-end">
                <div className="h-9 w-52 animate-pulse bg-foreground/8 rounded-2xl rounded-br-lg" />
              </div>
            </div>
          )}

          {showHero && (
            <div className="pb-2">
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                No forms. Tell me as much or as little as you like — I&rsquo;ll keep the trip details organised and open a
                proper view when something is easier to see than to describe.
              </p>
            </div>
          )}

          {messages.map((message, index) => {
            const meta = message.metadata as AssistantTurnMeta | undefined;
            const streaming = message.role === "assistant" && sending && index === messages.length - 1;
            const dir =
              message.role === "assistant" && meta?.language && RTL.has(meta.language.slice(0, 2)) ? "rtl" : undefined;
            // Only a message appearing for the first time in this mount gets the entrance
            // animation; restored history settles in place immediately.
            const isNew = !seenMessageIdsRef.current.has(message.id);
            if (isNew) seenMessageIdsRef.current.add(message.id);

            if (message.role === "user") {
              return (
                <motion.div
                  key={message.id}
                  initial={isNew ? { opacity: 0, y: 10 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  className="flex justify-end"
                >
                  <p className="max-w-[85%] rounded-2xl rounded-br-lg bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                    {message.content}
                  </p>
                </motion.div>
              );
            }

            const unavailable = streaming ? [] : unavailableLabels(meta?.unavailableProviders);
            const sources = streaming ? [] : (meta?.sources ?? []);

            return (
              <motion.div
                key={message.id}
                initial={isNew ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 240, damping: 26 }}
                dir={dir}
                // `chat-streaming` (app/globals.css) blinks a "▍" cursor after the last child of
                // `.chat-prose` — meant to sit after the growing text while it streams in. Gated
                // on content being non-empty: `streaming` alone is also true during the earlier
                // RESOLVE/RETRIEVE "thinking" phase, before any tokens have arrived, when the
                // message is still `""` — with no real text before it, the cursor rendered as a
                // lone blinking bar floating with nothing to sit after, redundant with (and
                // confusing alongside) the separate "Pulling the details together…" indicator
                // already shown for that same phase.
                className={cn("space-y-2", streaming && message.content && "chat-streaming")}
              >
                <AssistantMessage content={message.content} blocks={meta?.blocks} handlers={handlers} streaming={streaming} />
                {!streaming && meta?.degraded && (
                  <p className="text-[11px] text-muted-foreground">Answered from your trip details — the planner had trouble reading that one. Rephrasing may help.</p>
                )}
                {!streaming && meta?.persistFailed && (
                  <p className="text-[11px] text-destructive">This reply wasn’t saved — it may be gone if you reload.</p>
                )}
                {!streaming && meta?.truncated && (
                  <p className="text-[11px] text-muted-foreground">This answer may have been cut off — ask again if it looks incomplete.</p>
                )}
                {!streaming && meta?.unverified && (
                  <p className="text-[11px] text-muted-foreground">A figure or detail above is an estimate and hasn’t been independently verified.</p>
                )}
                {unavailable.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">Couldn’t check {unavailable.join(", ")} just now — this is from your trip so far.</p>
                )}
                {sources.length > 0 && (
                  <details className="text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer select-none">Sources ({sources.length})</summary>
                    <ul className="mt-1 space-y-0.5">
                      {sources.map((source) => (
                        <li key={source.url}>
                          <a href={source.url} target="_blank" rel="noreferrer noopener" className="underline-offset-2 hover:text-foreground hover:underline">
                            {source.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {message.content.trim() && !streaming && (
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(message.content)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                )}
              </motion.div>
            );
          })}

          <div role="status" aria-live="polite">{waiting && <Typing stage={progressStage} label={progressLabel} />}</div>
        </div>
      </div>

      <Sheet open={Boolean(proposal)} onClose={() => (confirming ? undefined : setProposal(null))} ariaLabel="Confirm change" side="center">
        <div className="p-6">
          <p className="text-sm leading-relaxed">{proposalText}</p>
          {proposalRows.length > 0 && (
            <details className="group mt-3">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                See exactly what will be saved
              </summary>
              <dl className="mt-1.5 space-y-1 rounded-lg border border-border/60 bg-background/70 px-2.5 py-2 text-[11px] leading-relaxed">
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
              className="rounded-full border border-border px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      </Sheet>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3">
        <div className={cn("pointer-events-auto mx-auto w-full min-w-0", rail ? "max-w-full" : "max-w-2xl")}>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void submit(input);
            }}
            className="flex w-full min-w-0 max-w-full flex-col gap-1 rounded-3xl border border-input bg-card px-3 py-2 shadow-lift focus-within:ring-2 focus-within:ring-ring/25"
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
                aria-label="Message"
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  // isComposing (and the legacy keyCode 229) is true for the Enter that CONFIRMS an
                  // IME candidate (Japanese/Chinese/Korean input) — that keystroke must not also submit.
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
                    event.preventDefault();
                    void submit(input);
                  }
                }}
                placeholder={!loaded ? "Loading…" : speech.listening ? "Listening…" : sending ? "Type your next message…" : "Ask about your trip…"}
                disabled={!loaded}
                className="max-h-[88px] w-full resize-none overflow-y-auto scrollbar-slim bg-transparent py-1 pr-28 text-sm leading-relaxed outline-none transition-[height] duration-150 ease-out placeholder:text-muted-foreground disabled:opacity-60"
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
}
