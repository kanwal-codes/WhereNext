"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, CalendarRange, Reply, SmilePlus, X } from "lucide-react";
import { Sheet, Pressable } from "@/components/motion-primitives";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanel, type EventSeed } from "@/components/TripPanelProvider";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { AssistantMessage } from "@/features/conversation/ui/AssistantMessage";
import type { AssistantBlock, AssistantTurnMeta, PlaceCard, StayCardItem } from "@/packages/contracts/assistant";
import { mentionsRoam, type GroupMessage } from "../domain/message";
import { memberInitials } from "@/lib/member-initials";
import { useTripMembers, type TripMember } from "@/lib/client/use-trip-members";
import { cn } from "@/lib/utils";

const COMMON_EMOJI = ["👍", "❤️", "😂", "🎉", "😍", "🤔"];
// Same sender, close enough in time to read as one turn — collapses the repeated avatar/name.
const GROUP_WINDOW_MS = 5 * 60_000;
const LONG_PRESS_MS = 450;

function displayName(userId: string | null, members: TripMember[], meId: string | undefined): string {
  if (!userId) return "Roam";
  if (userId === meId) return "You";
  const member = members.find((m) => m.userId === userId);
  return member?.email?.split("@")[0] ?? "Someone";
}

/** Splits on "@Roam" (any casing) and colors just that token, so a mention stands out in the sentence. */
function renderWithMentions(content: string) {
  return content.split(/(@roam\b)/gi).map((part, index) =>
    /^@roam$/i.test(part) ? (
      <span key={index} className="font-semibold text-coral">
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function Avatar({ name, isRoam }: { name: string; isRoam: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold shadow-sm",
        isRoam ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground" : "bg-primary/10 text-primary",
      )}
    >
      {isRoam ? "R" : memberInitials(name)}
    </span>
  );
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return response.json();
}

export function GroupChatSurface({
  tripId,
  onLogScroll,
}: {
  tripId: string;
  /** Wired directly to this surface's own scrollable log — see the identical prop's doc comment
   *  on `ConversationSurface` for why an ancestor capture listener sniffing scroll events isn't
   *  reliable here (a horizontal card carousel, or this surface's own background auto-scroll
   *  while the other tab is the visible one, both fire scroll events that aren't this log
   *  actually being scrolled by the user). The parent passes this only while this tab is active. */
  onLogScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}) {
  const { me, data } = useTripData();
  const { openPanel } = useTripPanel();
  const router = useRouter();
  const searchParams = useSearchParams();

  // `/join/[token]` sends a freshly-joined member here with `?joined=1` — otherwise they land in
  // the thread with zero acknowledgment that the invite actually worked. One-time only: the
  // param is stripped right after so a refresh (or coming back later) doesn't repeat it.
  useEffect(() => {
    if (searchParams.get("joined") !== "1") return;
    notifyToast(`You're in${data?.trip.name ? ` — welcome to ${data.trip.name}` : ""}!`, "success");
    router.replace(`/trips/${tripId}/group`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for the param that brought us here, not on every searchParams identity change
  }, []);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const { members } = useTripMembers(tripId);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const [expandedReactionFor, setExpandedReactionFor] = useState<string | null>(null);
  const [pressingId, setPressingId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; preview: string } | null>(null);
  // Which @Roam asks are currently in flight — the buffered (non-streamed) reply can take a
  // while, and until now nothing at all told the user a reply was coming. Keyed by messageId so
  // several concurrent asks (different members, or a retry) each get their own indicator.
  const [pendingRoamIds, setPendingRoamIds] = useState<Set<string>>(new Set());
  const logRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Guards against the server-side toggle race: a delete-then-insert isn't atomic, so two
  // near-simultaneous taps on the same (message, emoji) can both see "not reacted yet" and
  // both insert, or the second can re-add what the first just removed. Blocking a second
  // request for the same key while one is in flight covers the common trigger (a fast
  // double-tap); it doesn't cover two separate tabs racing, which would need a DB-side atomic
  // upsert-toggle (ponytail: revisit with a stored procedure if that's ever actually seen).
  const pendingReactionsRef = useRef<Set<string>>(new Set());
  const refreshIdRef = useRef(0);
  const bubbleRefs = useRef<Map<string, HTMLElement>>(new Map());
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Which Roam replies have already been considered for the auto-continue prefill below —
  // seeded with every id already in history on first load, so opening the chat doesn't refill
  // the composer for something Roam answered days ago.
  const seenReplyIdsRef = useRef<Set<string>>(new Set());
  const seenReplyBaselineRef = useRef(false);
  // Long-press-to-react: one shared timer is enough since only one bubble can be held at a time.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressMoved = useRef(false);

  const refresh = useCallback(async () => {
    // Same request-id guard as DiscoverySurface/StaySurface: refresh() fires from three
    // independent triggers (mount, every realtime "groupChat" event, right after sending) with
    // no ordering guarantee between them — without this, an earlier call's response landing
    // after a newer one's would overwrite the fresh list with stale data.
    const mine = ++refreshIdRef.current;
    try {
      const body = await fetch(`/api/trips/${tripId}/group-chat`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))));
      if (mine !== refreshIdRef.current) return;
      setMessages(body.messages ?? []);
    } catch {
      // Best-effort — the last successfully loaded state stays on screen.
    } finally {
      if (mine === refreshIdRef.current) setLoaded(true);
    }
  }, [tripId]);

  useEffect(() => {
    void refresh();
  }, [tripId, refresh]);

  // Only a real group-chat change (a message, a reaction) should pay for this refetch — the
  // bus carries the change type specifically so an itinerary edit or a saved place elsewhere
  // on the trip doesn't retrigger a full history reload here.
  useEffect(() => subscribeWorkspaceChanges((changes) => {
    if (changes.includes("groupChat")) void refresh();
  }), [refresh]);

  const scrollToEnd = useCallback(() => {
    const log = logRef.current;
    if (!log) return;
    // Scroll the log itself to its true max, not `endRef.scrollIntoView({block:"end"})` — that
    // aligned `endRef`'s position (right after the last message, BEFORE the `pb-20` clearance
    // below it) with the container's bottom edge, so the reserved 80px gap sat scrolled past,
    // off-screen, doing nothing — the last message landed flush with the container's bottom
    // edge instead, exactly where the floating composer overlay sits on top of it. Live-caught:
    // the latest message ended up hidden behind the composer both on initial load and right
    // after sending. Scrolling the container to `scrollHeight` instead lands on the true
    // bottom, which correctly includes the `pb-20` padding as visible trailing space above the
    // composer. See the identical fix + longer explanation in ConversationSurface.tsx.
    const jump = () => log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
    jump();
    // A reply's place/event card images finish downloading a moment after the message row
    // lands, growing the log taller than it was when `jump()` first measured `scrollHeight` —
    // one call alone can still fall short, live-caught leaving the last card partly behind the
    // composer even with the fix above. Fire-and-forget: a redundant `scrollTo` landing after
    // the user has since scrolled away, or after unmount, is a harmless no-op either way.
    setTimeout(jump, 200);
    setTimeout(jump, 600);
  }, []);
  useEffect(() => {
    scrollToEnd();
  }, [messages.length, pendingRoamIds.size, scrollToEnd]);

  // Keeps a continuing exchange with Roam going without re-typing the mention every turn: once
  // a fresh reply lands answering something *you* said, pre-fill "@Roam " so your next message
  // picks the thread back up — only when the composer is empty, so it never clobbers a draft.
  useEffect(() => {
    if (!loaded) return;
    if (!seenReplyBaselineRef.current) {
      for (const m of messages) seenReplyIdsRef.current.add(m.id);
      seenReplyBaselineRef.current = true;
      return;
    }
    for (const m of messages) {
      if (m.role !== "assistant" || seenReplyIdsRef.current.has(m.id)) continue;
      seenReplyIdsRef.current.add(m.id);
      const replyToId = (m.metadata as { replyToMessageId?: string } | undefined)?.replyToMessageId;
      const source = replyToId ? messages.find((s) => s.id === replyToId) : undefined;
      if (source?.userId && source.userId === me?.userId) {
        setInput((current) => (current.trim() ? current : "@Roam "));
      }
    }
  }, [messages, loaded, me?.userId]);

  // Tap anywhere outside an expanded inline emoji bar to close it.
  useEffect(() => {
    if (!expandedReactionFor) return;
    function onDocPointerDown(event: PointerEvent) {
      if (!(event.target as HTMLElement).closest("[data-reaction-expand]")) setExpandedReactionFor(null);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [expandedReactionFor]);

  // Fire-and-forget from the caller's perspective — a failed reply shouldn't block the rest of
  // the chat — but never silent: the idempotency key on the server means retrying is always safe
  // (it upserts onto the same reply row rather than composing a second one).
  // `explicit` is the "Ask Roam about this" message action (long-press / inline-expand, same
  // surface as reactions) — it works on any member's message, not just one that says "@Roam".
  function askRoam(messageId: string, options: { explicit?: boolean } = {}) {
    setPendingRoamIds((current) => new Set(current).add(messageId));
    void postJson(`/api/trips/${tripId}/group-chat/roam`, { messageId, ...options })
      .then(() => void refresh())
      .catch(() => notifyToast("Roam didn’t reply to that.", "error", { label: "Retry", onClick: () => askRoam(messageId, options) }))
      .finally(() => setPendingRoamIds((current) => {
        if (!current.has(messageId)) return current;
        const next = new Set(current);
        next.delete(messageId);
        return next;
      }));
  }

  // The explicit "Reply" action on a Roam message — pre-fills the mention so continuing the
  // thread doesn't need it re-typed, and shows what you're replying to above the composer.
  // No extra plumbing needed on send: a message that still mentions @Roam already triggers the
  // normal reply flow, which threads the new answer back to *that* message automatically.
  function startReplyToRoam(id: string, content: string) {
    setReplyingTo({ id, preview: content });
    setInput("@Roam ");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function submit(raw: string) {
    const content = raw.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    const idempotencyKey = crypto.randomUUID();
    try {
      const { message } = await postJson<{ message: GroupMessage }>(`/api/trips/${tripId}/group-chat`, { content, kind: "text", idempotencyKey });
      setMessages((current) => [...current, message]);
      setReplyingTo(null);
      if (mentionsRoam(content)) askRoam(message.id);
    } catch {
      setInput(content);
      notifyToast("Your message didn’t send.", "error", { label: "Retry", onClick: () => void submit(content) });
    } finally {
      setSending(false);
    }
  }

  // Same side-panel wiring as the personal Conversation tab (chat/page.tsx) — TripPanelProvider
  // is already mounted trip-wide, so a card click here opens the identical shared panel.
  function onOpenPlace(place: PlaceCard) {
    openPanel({ kind: "place", placeId: place.providerId, name: place.name });
  }
  function onOpenStay(stay: StayCardItem, dates: { checkin: string; checkout: string }) {
    openPanel({ kind: "stay", hotelId: stay.hotelId, name: stay.name, checkin: dates.checkin, checkout: dates.checkout });
  }
  function onOpenEvent(seed: EventSeed) {
    openPanel({ kind: "event", seed });
  }
  function onOpenCollection(title: string, block: AssistantBlock) {
    openPanel({ kind: "collection", title, block });
  }
  // Roam only ever speaks on an explicit @-mention — a followup chip click has to re-mention it
  // in the persisted message too, so it still goes through the normal mention-gated `submit()`
  // flow rather than ever calling the roam endpoint directly.
  function onFollowup(prompt: string) {
    void submit(mentionsRoam(prompt) ? prompt : `@Roam ${prompt}`);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const key = `${messageId}:${emoji}`;
    if (pendingReactionsRef.current.has(key)) return;
    pendingReactionsRef.current.add(key);
    setReactingTo(null);
    setExpandedReactionFor(null);
    // Optimistic flip so the tap feels instant; refresh() reconciles shortly after via the
    // realtime-driven workspace-change bus.
    setMessages((current) =>
      current.map((m) => {
        if (m.id !== messageId) return m;
        const existing = m.reactions.find((r) => r.emoji === emoji);
        const reactions = existing
          ? existing.mine
            ? m.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r)).filter((r) => r.count > 0)
            : m.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r))
          : [...m.reactions, { emoji, count: 1, mine: true }];
        return { ...m, reactions };
      }),
    );
    try {
      await postJson(`/api/trips/${tripId}/group-chat/${messageId}/reactions`, { emoji });
    } catch {
      void refresh();
    } finally {
      pendingReactionsRef.current.delete(key);
    }
  }

  // Touch-only: holding a bubble opens the full-size emoji sheet — mouse users get the inline
  // expanding bar instead (see the trigger button below), so this never fires for a click.
  function onBubblePressStart(event: ReactPointerEvent, messageId: string) {
    if (event.pointerType !== "touch") return;
    pressMoved.current = false;
    setPressingId(messageId);
    pressTimer.current = setTimeout(() => {
      if (!pressMoved.current) {
        // Best-effort haptic — some browsers throw when it's called without a trusted user
        // gesture, and that must never take the actual reaction trigger down with it.
        try {
          navigator.vibrate?.(10);
        } catch {
          /* no-op */
        }
        setReactingTo(messageId);
      }
      setPressingId(null);
    }, LONG_PRESS_MS);
  }
  function onBubblePressEnd() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    setPressingId(null);
  }
  function onBubblePressMove() {
    pressMoved.current = true;
    onBubblePressEnd();
  }

  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  // Jump to and briefly flash a message — used by a reply's quoted "replying to" strip so the
  // source of a threaded answer is one tap away, even once it's scrolled out of view.
  function scrollToMessage(id: string) {
    bubbleRefs.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightedId(id);
    highlightTimer.current = setTimeout(() => setHighlightedId((current) => (current === id ? null : current)), 1600);
  }

  // Precompute date-divider and same-sender-run boundaries once per message list, rather than
  // re-deriving neighbour lookups inline for every row on every render.
  const rows = useMemo(() => {
    return messages.map((message, index) => {
      const previous = messages[index - 1];
      const showDateDivider = !previous || dayLabel(previous.created_at) !== dayLabel(message.created_at);
      const sameSenderAsPrevious =
        previous &&
        previous.kind !== "system" &&
        message.kind !== "system" &&
        previous.userId === message.userId &&
        previous.role === message.role &&
        Date.parse(message.created_at) - Date.parse(previous.created_at) < GROUP_WINDOW_MS;
      return { message, showDateDivider, isFirstInGroup: !sameSenderAsPrevious || showDateDivider };
    });
  }, [messages]);

  // Inline ghost-text autocomplete for "@Roam" — replaces the old suggestion pill. Matches a
  // partial mention token at the very end of the input ("@", "@r", "@ro", ... "@roam", any
  // case) and, while it's a genuine prefix of "roam", offers Tab to complete it.
  const mentionToken = input.match(/(^|\s)(@[a-zA-Z]{0,4})$/)?.[2];
  const mentionActive = Boolean(mentionToken && "@roam".startsWith(mentionToken.toLowerCase()) && input.trim().length > 0);
  // The remaining letters of "Roam" not yet typed — e.g. "@r" -> "oam", "@roam" -> "" (nothing
  // left to suggest, though Tab still normalizes casing/adds the trailing space below).
  const mentionGhost = mentionActive && mentionToken ? "Roam".slice(mentionToken.length - 1) : "";

  function insertRoamMention() {
    setInput((current) => current.replace(/@r?o?a?m?$/i, "@Roam "));
  }

  return (
    <div className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden">
      {/* `overscroll-contain` — see the identical comment in ConversationSurface.tsx: keeps the
          rubber-band bounce at the top/bottom confined to this log instead of chaining into the
          page. */}
      <div ref={logRef} onScroll={onLogScroll} className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-slim">
        <div className="mx-auto w-full max-w-2xl space-y-1 pt-3 pb-20">
          {!loaded && (
            <div aria-hidden className="space-y-5">
              <div className="h-9 w-40 animate-pulse rounded-2xl rounded-br-lg bg-muted" />
              <div className="h-9 w-52 animate-pulse rounded-2xl bg-muted" />
            </div>
          )}

          {loaded && messages.length === 0 && (
            <div className="flex flex-col items-center gap-2 pt-6 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary">
                <CalendarRange className="h-5 w-5" />
              </span>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                This is the whole group&rsquo;s chat — everyone on the trip, plus Roam. Tag <span className="font-medium text-foreground">@Roam</span> to ask it something here.
              </p>
            </div>
          )}

          {rows.map(({ message, showDateDivider, isFirstInGroup }) => {
            const isNew = !seenIdsRef.current.has(message.id);
            if (isNew) seenIdsRef.current.add(message.id);
            const mine = message.userId !== null && message.userId === me?.userId;
            const isRoam = message.role === "assistant";
            const name = displayName(message.userId, members, me?.userId);
            const expanded = expandedReactionFor === message.id;

            const divider = showDateDivider && (
              <div className="flex items-center justify-center py-3">
                <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium tracking-[0.06em] text-muted-foreground uppercase">{dayLabel(message.created_at)}</span>
              </div>
            );

            if (message.kind === "system") {
              return (
                <div key={message.id}>
                  {divider}
                  <p className="mx-auto max-w-fit rounded-full bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">{message.content}</p>
                </div>
              );
            }

            // Threads a reply back to whatever it's actually answering — with several people
            // texting at once, Roam's answer can land screens below the question by the time it
            // composes, so a flat append-at-the-bottom list alone isn't enough context.
            const replyToId = (message.metadata as { replyToMessageId?: string } | undefined)?.replyToMessageId;
            const replySource = replyToId ? messagesById.get(replyToId) : undefined;

            const bubble = isRoam ? (
              // No bubble/border here — matches how Roam's replies render in the personal
              // Conversation tab (plain flowing content, not boxed); only human messages get
              // a bubble, since a bubble's job is telling apart who said what among members.
              <div className="min-w-0 max-w-full space-y-2">
                {replySource && (
                  <button
                    type="button"
                    onClick={() => scrollToMessage(replySource.id)}
                    className="inline-flex max-w-full min-w-0 items-start gap-2 rounded-lg border-l-2 border-coral/50 bg-coral/5 px-2.5 py-2 text-left text-[11px] transition-colors hover:bg-coral/10"
                  >
                    <span className="shrink-0 font-medium text-coral">{displayName(replySource.userId, members, me?.userId)}</span>
                    <span className="min-w-0 truncate text-muted-foreground">{replySource.content}</span>
                  </button>
                )}
                <AssistantMessage
                  content={message.content}
                  blocks={(message.metadata as Partial<AssistantTurnMeta> | undefined)?.blocks}
                  handlers={{ tripId, onFollowup, onOpenPlace, onOpenStay, onOpenEvent, onOpenCollection }}
                />
                {(message.metadata as Partial<AssistantTurnMeta> | undefined)?.unverified && (
                  <p className="text-[11px] text-muted-foreground">A figure or detail above is an estimate and hasn’t been independently verified.</p>
                )}
              </div>
            ) : (
              <p
                className={cn(
                  "min-w-0 max-w-full rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words shadow-sm",
                  mine ? "rounded-br-lg bg-gradient-to-br from-primary to-primary/90 text-primary-foreground" : "rounded-tl-lg bg-muted text-foreground",
                )}
              >
                {renderWithMentions(message.content)}
              </p>
            );

            return (
              <div key={message.id}>
                {divider}
                <motion.div
                  ref={(el) => {
                    if (el) bubbleRefs.current.set(message.id, el);
                    else bubbleRefs.current.delete(message.id);
                  }}
                  initial={isNew ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  className={cn(
                    "flex min-w-0 items-start gap-2 rounded-2xl transition-colors duration-700",
                    isFirstInGroup ? "mt-3" : "mt-0.5",
                    mine ? "flex-row-reverse" : "flex-row",
                    highlightedId === message.id && "bg-coral-soft/60",
                  )}
                >
                  {!mine && <div className="w-7 shrink-0">{isFirstInGroup && <Avatar name={name} isRoam={isRoam} />}</div>}
                  <div className={cn("flex min-w-0 max-w-[85%] flex-col gap-1.5", mine ? "items-end" : "items-start")}>
                    {!mine && isFirstInGroup && <p className="px-1 text-[11px] font-medium text-muted-foreground">{name}</p>}
                    <motion.div
                      animate={{ scale: pressingId === message.id ? 0.96 : 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      onPointerDown={(event) => onBubblePressStart(event, message.id)}
                      onPointerUp={onBubblePressEnd}
                      onPointerCancel={onBubblePressEnd}
                      onPointerMove={onBubblePressMove}
                      className="group relative min-w-0 max-w-full select-none [touch-action:pan-y]"
                    >
                      {bubble}
                      {/* Trigger (and, on Roam's own messages, a small Reply icon right next to
                          it) sit stacked in the gutter at the vertical middle of the bubble —
                          left for your own messages, right for everyone else's. The expanded
                          picker starts from the trigger's exact point (same `layoutId`, so
                          Framer Motion morphs one into the other in place) but grows the other
                          direction — inward, over the message — rather than further out into
                          the empty gutter, which is too narrow for six emoji anyway. Reveal-on-
                          hover; touch has no hover state, so this never shows there — long-press
                          → the Sheet below is how touch reacts. */}
                      {!expanded && (
                        <div
                          className={cn(
                            "pointer-events-none absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                            mine ? "right-full mr-2" : "left-full ml-2",
                          )}
                        >
                          <motion.button
                            layoutId={`reaction-picker-${message.id}`}
                            type="button"
                            onClick={() => setExpandedReactionFor(message.id)}
                            aria-label="Add reaction"
                            whileHover={{ scale: 1.15 }}
                            whileTap={{ scale: 0.9 }}
                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                            className="pointer-events-auto grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-lift backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <SmilePlus className="h-4 w-4" />
                          </motion.button>
                          {isRoam && (
                            <button
                              type="button"
                              onClick={() => startReplyToRoam(message.id, message.content)}
                              aria-label="Reply to Roam"
                              title="Reply"
                              className="pointer-events-auto grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-lift backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <Reply className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                      <AnimatePresence>
                        {expanded && (
                          <motion.div
                            key="bar"
                            layoutId={`reaction-picker-${message.id}`}
                            data-reaction-expand
                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                            className={cn(
                              "pointer-events-auto absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 overflow-hidden rounded-full border border-border bg-card py-1 pr-1 pl-1 shadow-lift",
                              mine ? "-left-2" : "-right-2",
                            )}
                          >
                            {COMMON_EMOJI.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => void toggleReaction(message.id, emoji)}
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base transition-transform hover:scale-125 active:scale-95"
                              >
                                {emoji}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                    <div className="flex flex-wrap items-center gap-1.5 px-1">
                      {message.reactions.map((r) => (
                        <Pressable key={r.emoji}>
                          <motion.button
                            layout
                            type="button"
                            onClick={() => void toggleReaction(message.id, r.emoji)}
                            className={cn(
                              "flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors",
                              r.mine ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent",
                            )}
                          >
                            <span>{r.emoji}</span>
                            <span>{r.count}</span>
                          </motion.button>
                        </Pressable>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })}
          {pendingRoamIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-start gap-2"
            >
              <div className="w-7 shrink-0">
                <Avatar name="Roam" isRoam />
              </div>
              <div className="flex items-center gap-1 rounded-2xl rounded-tl-lg px-4 py-2.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </div>

        <div className="pointer-events-none sticky bottom-0 left-0 -mt-10 h-10 w-full bg-gradient-to-t from-background to-transparent" />
      </div>

      <Sheet open={reactingTo !== null} onClose={() => setReactingTo(null)} ariaLabel="Add reaction" side="bottom">
        <div className="px-5 pt-1 pb-6">
          <p className="mb-3 text-center text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">Quick react</p>
          <div className="flex flex-wrap justify-center gap-2">
            {COMMON_EMOJI.map((emoji) => (
              <Pressable key={emoji}>
                <button
                  type="button"
                  onClick={() => reactingTo && void toggleReaction(reactingTo, emoji)}
                  className="grid h-11 w-11 place-items-center rounded-full border border-border text-xl transition-colors hover:bg-accent"
                >
                  {emoji}
                </button>
              </Pressable>
            ))}
          </div>
        </div>
      </Sheet>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3">
        <div className="pointer-events-auto mx-auto w-full max-w-2xl">
          {replyingTo && (
            <div className="mb-2.5 flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-3.5 py-3 shadow-soft">
              <Reply className="h-4 w-4 shrink-0 text-coral" />
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                <span className="font-medium text-coral">Replying to Roam</span>
                <span className="mx-1.5 text-border">·</span>
                {replyingTo.preview}
              </span>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                aria-label="Cancel reply"
                className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void submit(input);
            }}
            className="flex w-full items-end gap-1.5 overflow-hidden rounded-full border border-input bg-card px-2.5 py-2 shadow-lift transition-shadow focus-within:shadow-xl focus-within:ring-2 focus-within:ring-ring/25 sm:gap-2 sm:px-3.5"
          >
            <div className="relative w-0 min-w-0 flex-1">
              {/* Ghost completion — sits behind the (transparent-background) textarea, so the
                  real typed text visually covers its invisible spacer span and only the
                  suggested remainder ("oam", "am", "m", ...) shows through in muted gray. */}
              {mentionGhost && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden text-sm leading-relaxed break-words whitespace-pre-wrap px-1.5 py-2">
                  <span className="invisible">{input}</span>
                  <span className="text-muted-foreground">{mentionGhost}</span>
                </div>
              )}
              <textarea
                ref={textareaRef}
                aria-label="Message the group"
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Tab" && mentionActive) {
                    event.preventDefault();
                    insertRoamMention();
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
                    event.preventDefault();
                    void submit(input);
                  }
                }}
                placeholder={!loaded ? "Loading…" : "Message the group — try @Roam…"}
                disabled={!loaded}
                className="max-h-40 w-full resize-none bg-transparent px-1.5 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              aria-label="Send"
              disabled={!loaded || !input.trim()}
              className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-sm transition-opacity disabled:opacity-35"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
