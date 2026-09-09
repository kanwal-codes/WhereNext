"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
import { cn } from "@/lib/utils";

const COMMON_EMOJI = ["👍", "❤️", "😂", "🎉", "😍", "🤔"];
// Same sender, close enough in time to read as one turn — collapses the repeated avatar/name.
const GROUP_WINDOW_MS = 5 * 60_000;
const LONG_PRESS_MS = 450;

type Member = { userId: string; email: string | null; isYou: boolean };

function displayName(userId: string | null, members: Member[], meId: string | undefined): string {
  if (!userId) return "Roam";
  if (userId === meId) return "You";
  const member = members.find((m) => m.userId === userId);
  return member?.email?.split("@")[0] ?? "Someone";
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[1][0]).toUpperCase();
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
      {isRoam ? "R" : initials(name)}
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

export function GroupChatSurface({ tripId }: { tripId: string }) {
  const { me } = useTripData();
  const { openPanel } = useTripPanel();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const [expandedReactionFor, setExpandedReactionFor] = useState<string | null>(null);
  const [pressingId, setPressingId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; preview: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
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
    try {
      const body = await fetch(`/api/trips/${tripId}/group-chat`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))));
      setMessages(body.messages ?? []);
    } catch {
      // Best-effort — the last successfully loaded state stays on screen.
    } finally {
      setLoaded(true);
    }
  }, [tripId]);

  useEffect(() => {
    void refresh();
    fetch(`/api/trips/${tripId}/members`)
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((body) => setMembers(body.members ?? []))
      .catch(() => undefined);
  }, [tripId, refresh]);

  // Any workspace change (not just this trip's group chat) re-triggers a refetch — matches
  // the bus's existing broadcast-any-change shape (see TripDataProvider); one extra fetch on
  // an unrelated change is cheap and simpler than threading the change type through.
  useEffect(() => subscribeWorkspaceChanges(() => void refresh()), [refresh]);

  const scrollToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, []);
  useEffect(() => {
    scrollToEnd();
  }, [messages.length, scrollToEnd]);

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
    void postJson(`/api/trips/${tripId}/group-chat/roam`, { messageId, ...options })
      .then(() => void refresh())
      .catch(() => notifyToast("Roam didn’t reply to that.", "error", { label: "Retry", onClick: () => askRoam(messageId, options) }));
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

  const mentionHint = /(^|\s)@r?o?a?m?$/i.test(input) && input.trim().length > 0;

  function insertRoamMention() {
    setInput((current) => current.replace(/@r?o?a?m?$/i, "@Roam "));
  }

  return (
    <div className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden">
      <div ref={logRef} className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-slim">
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
          <div ref={endRef} />
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
          {mentionHint && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={insertRoamMention}
              className="btn-chip mb-2 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <span className="grid h-4 w-4 place-items-center rounded-full bg-primary-foreground/20 text-[9px] font-bold">R</span>
              Ask Roam
            </motion.button>
          )}
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void submit(input);
            }}
            className="flex w-full items-end gap-1.5 overflow-hidden rounded-full border border-input bg-card px-2.5 py-2 shadow-lift transition-shadow focus-within:shadow-xl focus-within:ring-2 focus-within:ring-ring/25 sm:gap-2 sm:px-3.5"
          >
            <textarea
              ref={textareaRef}
              aria-label="Message the group"
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
                  event.preventDefault();
                  void submit(input);
                }
              }}
              placeholder={!loaded ? "Loading…" : "Message the group — try @Roam…"}
              disabled={!loaded}
              className="max-h-40 w-0 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
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
