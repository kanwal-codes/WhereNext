"use client";

import { RAIL_MEASURE } from "@/features/conversation/ui/ConversationSurface";
import React, { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { memberTint } from "@/lib/member-tint";
import { ArrowDown, ListChecks, Loader2, Plus, SmilePlus } from "lucide-react";
import { MicButton, SendButton } from "@/components/ComposerButtons";
import { PHONE_V2 } from "@/lib/phone-v2";
import { haptic } from "@/lib/haptics";
import { markGroupRead } from "@/lib/client/use-group-unread";
import { Pressable } from "@/components/motion-primitives";
import { useKeepScrollGap } from "@/lib/use-keep-scroll-gap";
import { useAutoGrowTextarea } from "@/lib/use-autogrow-textarea";
import { useSpeechInput } from "@/lib/use-speech-input";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanel, type EventSeed } from "@/components/TripPanelProvider";
import { notifyToast } from "@/lib/application/toast";
import { AssistantMessage } from "@/features/conversation/ui/AssistantMessage";
import type { AssistantBlock, AssistantTurnMeta, PlaceCard, StayCardItem } from "@/packages/contracts/assistant";
import type { Poll } from "@/packages/contracts/poll";
import { useRoamAsks } from "../application/useRoamAsks";
import { useGroupChatLog } from "../application/useGroupChatLog";
import { applyReactionToggle, applyVote, buildRows, chatNotice, lastRoamMessageId, roamMentionGhost } from "../domain/chat-state";
import { MAX_MESSAGE_LENGTH, completeRoamMention, hasAsk, mentionsRoam, type GroupMessage } from "../domain/message";
import { SEND_TIMEOUT_MS, restoreOutbox, sendFailure, serializeOutbox, type Outgoing } from "../domain/outbox";
import { useChatLive } from "@/lib/client/trip-realtime";
import { useTripMembers } from "@/lib/client/use-trip-members";
import { renderRich } from "./rich-text";
import { Avatar, ChatEmptyState, PollCard, PollSheet, TypingBubble } from "./GroupChatParts";
import { dayLabel, displayName, fullTime, timeLabel } from "./chat-format";
import { postJson } from "../application/postJson";
import { cn } from "@/lib/utils";
import { MessageBlocks } from "@/features/conversation/ui/blocks/MessageBlocks";
import { textAction } from "@/features/conversation/ui/blocks/ui";

const COMMON_EMOJI = ["👍", "❤️", "😂", "🎉", "😍", "🤔"];
const LONG_PRESS_MS = 450;
// Within this distance of the bottom you are "reading the latest", so a new message follows you down.
const NEAR_BOTTOM_PX = 160;


/** Memoized for the same reason as `ConversationSurface`: a tab switch must not rebuild the whole log. */
export const GroupChatSurface = React.memo(function GroupChatSurface({
  tripId,
  onLogScroll,
  rail = false,
  active = true,
}: {
  tripId: string;
  /** Wired directly to this surface's own scrollable log — see the identical prop's doc comment
   *  on `ConversationSurface` for why an ancestor capture listener sniffing scroll events isn't
   *  reliable here (a horizontal card carousel, or this surface's own background auto-scroll
   *  while the other tab is the visible one, both fire scroll events that aren't this log
   *  actually being scrolled by the user). The parent passes this only while this tab is active. */
  onLogScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  /** A detail panel is open beside the chat: the text keeps one fixed measure (see RAIL_MEASURE). */
  rail?: boolean;
  /** This tab is the one on screen. The pane stays mounted behind the Roam tab so switching is instant, but a hidden chat reads the thread only when it is shown (and on a live change), never on a timer. */
  active?: boolean;
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
  const { members, loaded: membersLoaded } = useTripMembers(tripId);
  const [input, setInput] = useState("");
  // Messages you have sent that the server has not confirmed: they show at once, as "Sending…", and stay with a Retry if they fail.
  const [outbox, setOutbox] = useState<Outgoing[]>([]);
  // The unsent messages (and the half-typed one) survive a reload or a trip to another page: kept per trip, per tab.
  const outboxKey = `wn-outbox:${tripId}:${me?.userId ?? "anon"}`;
  const draftKey = `wn-draft:${tripId}:${me?.userId ?? "anon"}`;
  const cacheKey = `wn-group-cache:${tripId}:${me?.userId ?? "anon"}`;
  const [restored, setRestored] = useState(false);
  const outboxRef = useRef<Outgoing[]>([]);
  outboxRef.current = outbox;
  // Keys with a request in flight right now, so a retry (by hand or by the connection coming back) never doubles up.
  const inflightRef = useRef<Set<string>>(new Set());
  const [online, setOnline] = useState(true);
  const chatLive = useChatLive();
  const [liveDown, setLiveDown] = useState(false);
  // A double Enter can arrive before the state has re-rendered and would post the message twice.
  const submitLockRef = useRef(false);
  // Following the conversation: true while you are at the bottom. A message that arrives while you are reading higher up waits behind a pill.
  const nearBottomRef = useRef(true);
  const lastIdRef = useRef<string | null>(null);
  const [unseen, setUnseen] = useState(false);
  // Far above the newest message: offer a way straight back (same pill as the Roam chat).
  const [away, setAway] = useState(false);
  const [expandedReactionFor, setExpandedReactionFor] = useState<string | null>(null);
  const [pressingId, setPressingId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [pollSheetOpen, setPollSheetOpen] = useState(false);
  const [pendingVoteFor, setPendingVoteFor] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  useKeepScrollGap(logRef);
  const { messages, setMessages, older, hasOlder, windowSize, loadingOlder, loaded, loadFailed, refresh, loadOlder, olderSentinelRef, seenIdsRef, skewRef } = useGroupChatLog({ tripId, active, cacheKey, logRef });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const speechBaseRef = useRef("");
  // Guards against the server-side toggle race: a delete-then-insert isn't atomic, so two
  // near-simultaneous taps on the same (message, emoji) can both see "not reacted yet" and
  // both insert, or the second can re-add what the first just removed. Blocking a second
  // request for the same key while one is in flight covers the common trigger (a fast
  // double-tap); it doesn't cover two separate tabs racing, which would need a DB-side atomic
  // upsert-toggle (ponytail: revisit with a stored procedure if that's ever actually seen).
  const pendingReactionsRef = useRef<Set<string>>(new Set());
  const bubbleRefs = useRef<Map<string, HTMLElement>>(new Map());
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Long-press-to-react: one shared timer is enough since only one bubble can be held at a time.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressMoved = useRef(false);

  // Phone redesign: having the chat open is what reads it. Mark it read when it comes to the front and as new messages
  // arrive while it is in front, so the menu badge never counts what is already on screen.
  const lastMessageId = messages[messages.length - 1]?.id;
  // Your own message never counts as unread (the server skips it), so sending one needs no round trip.
  const lastIsMine = !!me?.userId && messages[messages.length - 1]?.userId === me.userId;
  const wasActive = useRef(false);
  useEffect(() => {
    if (!PHONE_V2 || !active) { wasActive.current = false; return; }
    const opening = !wasActive.current;
    wasActive.current = true;
    if (opening || !lastIsMine) void markGroupRead(tripId);
  }, [active, tripId, lastMessageId, lastIsMine]);

  const { askRoam, pendingRoamIds, failedRoamIds, waitingIds, missedIds } = useRoamAsks({
    tripId,
    messages,
    loaded,
    skewRef,
    meUserId: me?.userId,
    refresh,
    // Once Roam answers something you said, the box opens on "@Roam " so the next line picks the thread back up (never over a draft).
    onContinueThread: () => setInput((current) => (current.trim() ? current : "@Roam ")),
  });

  const scrollToEnd = useCallback(() => {
    const log = logRef.current;
    if (!log) return;
    // Scroll the log itself to its true max, not `endRef.scrollIntoView({block:"end"})` — that
    // aligned `endRef`'s position (right after the last message, BEFORE the `pb-28` clearance
    // below it) with the container's bottom edge, so the reserved 112px gap sat scrolled past,
    // off-screen, doing nothing — the last message landed flush with the container's bottom
    // edge instead, exactly where the floating composer overlay sits on top of it. Live-caught:
    // the latest message ended up hidden behind the composer both on initial load and right
    // after sending. Scrolling the container to `scrollHeight` instead lands on the true
    // bottom, which correctly includes the `pb-28` padding as visible trailing space above the
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
  // A new message follows you down only if you were already at the bottom, or it is yours. Reading higher up, it waits behind the "New messages" pill instead of yanking the page away.
  const lastMessage = outbox.length > 0 ? null : messages[messages.length - 1];
  const lastKey = outbox.length > 0 ? `out:${outbox[outbox.length - 1]!.key}:${outbox.length}` : (lastMessage?.id ?? null);
  useEffect(() => {
    const first = lastIdRef.current === null;
    const changed = lastIdRef.current !== lastKey;
    lastIdRef.current = lastKey;
    if (first || !changed) return;
    const mineLatest = outbox.length > 0 || (lastMessage?.role === "user" && lastMessage.userId === me?.userId);
    if (nearBottomRef.current || mineLatest) scrollToEnd();
    else setUnseen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the newest message changing, not to every list identity
  }, [lastKey]);
  useEffect(() => {
    if (pendingRoamIds.size > 0 && nearBottomRef.current) scrollToEnd();
  }, [pendingRoamIds.size, scrollToEnd]);
  useEffect(() => {
    if (waitingIds.length > 0 && nearBottomRef.current) scrollToEnd();
  }, [waitingIds.length, scrollToEnd]);

  function onLogScrollInner(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    if (near) setUnseen(false);
    const farAway = el.scrollHeight - el.clientHeight - el.scrollTop > el.clientHeight * 1.2;
    setAway((current) => (current === farAway ? current : farAway));
    onLogScroll?.(event);
  }

  // First landing: jump straight to the latest message, instantly — not the smooth `scrollToEnd`
  // above, which would otherwise visibly animate down the entire history on every single mount
  // (including just switching back from another route, since this surface remounts then). Runs
  // synchronously before the smooth effect's own initial call, so that one lands on an already-
  // correct position and has nothing left to animate. See the identical fix + comment in
  // ConversationSurface.tsx.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const jump = () => { log.scrollTop = log.scrollHeight; };
    jump();
    const ids = [60, 200, 500].map((ms) => window.setTimeout(jump, ms));
    ids.push(requestAnimationFrame(jump));
    return () => ids.forEach((id) => { clearTimeout(id); cancelAnimationFrame(id); });
  }, [loaded]);

  // Tap anywhere outside an expanded inline emoji bar to close it.
  useEffect(() => {
    if (!expandedReactionFor) return;
    function onDocPointerDown(event: PointerEvent) {
      if (!(event.target as HTMLElement).closest("[data-reaction-expand]")) setExpandedReactionFor(null);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [expandedReactionFor]);

  // Optimistic: the message appears at once as "Sending…", and keeps its idempotency key through a Retry, so a reply
  // lost on the way back never posts the same words twice.
  async function submit(raw: string, retryKey?: string) {
    const content = raw.trim();
    // The double-Enter lock is for a fresh send; a retry is guarded by its own in-flight key instead (several can go out at once).
    if (!content || !hasAsk(content) || (!retryKey && submitLockRef.current)) return;
    if (retryKey && inflightRef.current.has(retryKey)) return;
    if (speech.listening) speech.stop();
    haptic("tap");
    if (!retryKey) {
      submitLockRef.current = true;
      requestAnimationFrame(() => { submitLockRef.current = false; });
    }
    const key = retryKey ?? crypto.randomUUID();
    inflightRef.current.add(key);
    if (!retryKey) setInput("");
    setOutbox((current) => (retryKey ? current.map((o) => (o.key === key ? { ...o, status: "sending", reason: undefined } : o)) : [...current, { key, content, status: "sending", created_at: new Date().toISOString() }]));
    try {
      const { message } = await postJson<{ message: GroupMessage }>(`/api/trips/${tripId}/group-chat`, { content, kind: "text", idempotencyKey: key }, SEND_TIMEOUT_MS);
      seenIdsRef.current.add(message.id);
      setMessages((current) => (current.some((m) => m.id === message.id) ? current : [...current, message]));
      setOutbox((current) => current.filter((o) => o.key !== key));
      if (mentionsRoam(content)) askRoam(message.id);
    } catch (error) {
      const failure = sendFailure(error);
      setOutbox((current) => current.map((o) => (o.key === key ? { ...o, status: "failed", ...failure } : o)));
    } finally {
      inflightRef.current.delete(key);
    }
  }

  // Back online: read the thread again, and send what was waiting (same keys, so nothing posts twice).
  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      void refresh();
      for (const o of outboxRef.current) if (o.status === "failed" && o.retryable) void submit(o.content, o.key);
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submit/refresh are read fresh through the closure each time the effect re-runs on trip change
  }, [tripId]);

  // On open: bring back what was unsent (and the half-typed message), and send the unsent once more if we are online.
  useEffect(() => {
    let saved: Outgoing[] = [];
    try {
      saved = restoreOutbox(sessionStorage.getItem(outboxKey));
      const draft = sessionStorage.getItem(draftKey);
      if (draft) setInput((current) => current || draft);
    } catch { /* storage blocked: nothing to bring back */ }
    if (saved.length > 0) setOutbox((current) => [...saved.filter((r) => !current.some((c) => c.key === r.key)), ...current]);
    setRestored(true);
    if (navigator.onLine) for (const o of saved) if (o.retryable) void submit(o.content, o.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per trip
  }, [tripId]);
  useEffect(() => {
    if (!restored) return;
    try {
      if (outbox.length > 0) sessionStorage.setItem(outboxKey, serializeOutbox(outbox));
      else sessionStorage.removeItem(outboxKey);
    } catch { /* storage full or blocked */ }
  }, [outbox, restored, outboxKey]);
  useEffect(() => {
    if (!restored) return;
    try {
      if (input) sessionStorage.setItem(draftKey, input);
      else sessionStorage.removeItem(draftKey);
    } catch { /* storage full or blocked */ }
  }, [input, restored, draftKey]);

  // A message that really arrived (it came back from the server under the key it was sent with) is no longer "unsent":
  // this clears the unsent copy that would otherwise sit beside it when the reply to the send was lost, or when the
  // live update beat the reply.
  useEffect(() => {
    const delivered = new Set(messages.map((m) => m.clientKey).filter(Boolean));
    if (delivered.size === 0) return;
    setOutbox((current) => (current.some((o) => delivered.has(o.key)) ? current.filter((o) => !delivered.has(o.key)) : current));
  }, [messages]);

  // "Live updates paused" only after a few seconds without the live channel, so a normal reconnect does not flash it.
  useEffect(() => {
    if (chatLive) { setLiveDown(false); return; }
    const timer = setTimeout(() => setLiveDown(true), 4000);
    return () => clearTimeout(timer);
  }, [chatLive]);

  // Same side-panel wiring as the personal Conversation tab (chat/page.tsx) — TripPanelProvider
  // is already mounted trip-wide, so a card click here opens the identical shared panel.
  function onOpenPlace(place: PlaceCard) {
    openPanel({ kind: "place", placeId: place.providerId, name: place.name });
  }
  function onOpenStay(stay: StayCardItem, dates: { checkin: string; checkout: string; adults?: number }) {
    openPanel({ kind: "stay", hotelId: stay.hotelId, name: stay.name, checkin: dates.checkin, checkout: dates.checkout, adults: dates.adults, onAsk: onFollowup });
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

  async function createPoll(question: string, options: string[]): Promise<boolean> {
    try {
      const { message } = await postJson<{ message: GroupMessage }>(`/api/trips/${tripId}/polls`, { question, options });
      setMessages((current) => [...current, message]);
      return true;
    } catch {
      notifyToast("Couldn’t start that poll.", "error");
      return false;
    }
  }

  // Optimistic: flips this member's own selection immediately in the local list (the poll's
  // realtime "groupChat" change confirms it — and corrects it — for every viewer shortly after).
  async function castVote(messageId: string, pollId: string, optionKey: string) {
    if (pendingVoteFor === pollId) return;
    setPendingVoteFor(pollId);
    setMessages((current) => applyVote(current, messageId, optionKey));
    try {
      await postJson(`/api/trips/${tripId}/polls/${pollId}/vote`, { optionKey });
    } catch {
      // Back to what the server says, not to an old snapshot of the whole chat (which would drop anything that arrived since).
      void refresh();
      notifyToast("Your vote didn’t save.", "error");
    } finally {
      setPendingVoteFor(null);
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const key = `${messageId}:${emoji}`;
    if (pendingReactionsRef.current.has(key)) return;
    pendingReactionsRef.current.add(key);
    setExpandedReactionFor(null);
    // Optimistic flip so the tap feels instant; refresh() reconciles shortly after via the
    // realtime-driven workspace-change bus.
    setMessages((current) => applyReactionToggle(current, messageId, emoji));
    try {
      await postJson(`/api/trips/${tripId}/group-chat/${messageId}/reactions`, { emoji });
    } catch {
      void refresh();
    } finally {
      pendingReactionsRef.current.delete(key);
    }
  }

  // Touch-only: holding a bubble opens the same inline emoji bar the mouse gets from its trigger button (below),
  // so this never fires for a click.
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
        setExpandedReactionFor(messageId);
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

  const messagesById = useMemo(() => new Map([...older, ...messages].map((m) => [m.id, m])), [older, messages]);

  // Jump to and briefly flash a message — used by a reply's quoted "replying to" strip so the
  // source of a threaded answer is one tap away, even once it's scrolled out of view.
  function scrollToMessage(id: string) {
    bubbleRefs.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightedId(id);
    highlightTimer.current = setTimeout(() => setHighlightedId((current) => (current === id ? null : current)), 1600);
  }

  // One quiet line above the composer for whatever is making the chat unreliable right now, most important first.
  const rawNotice = chatNotice({ online, loadFailed, hasMessages: messages.length > 0, liveDown, inputLength: input.length });
  const notice = rawNotice && { text: rawNotice.text, action: rawNotice.action === "retry" ? { label: "Retry", run: () => void refresh() } : undefined };

  // Precompute date-divider and same-sender-run boundaries once per message list, rather than
  // re-deriving neighbour lookups inline for every row on every render.
  // Roam's most recent message in the thread: the only one whose follow-up chips are still live.
  const lastRoamId = useMemo(() => lastRoamMessageId(messages), [messages]);
  const rows = useMemo(
    () => buildRows({ older, messages, outbox, windowSize, meUserId: me?.userId, dayKey: dayLabel }),
    [older, messages, outbox, windowSize, me?.userId],
  );

  // Inline ghost-text autocomplete for "@Roam" — replaces the old suggestion pill. Matches a
  // partial mention token at the very end of the input ("@", "@r", "@ro", ... "@roam", any
  // case) and, while it's a genuine prefix of "roam", offers Tab to complete it.
  const { active: mentionActive, ghost: mentionGhost } = roamMentionGhost(input);

  function insertRoamMention() {
    setInput((current) => current.replace(/@r?o?a?m?$/i, "@Roam "));
  }

  const isMultiline = useAutoGrowTextarea(textareaRef, input, undefined, mirrorRef);

  // Dictation: transcript is appended after whatever was already typed when the mic started.
  const speech = useSpeechInput({
    onStart: () => {
      speechBaseRef.current = input.trim() ? `${input.trim()} ` : "";
    },
    onResult: (text) => setInput(speechBaseRef.current + text),
    onError: (message) => notifyToast(message, "error"),
  });

  // The dropdown is portaled to <body> (below) so the pill's own `overflow-hidden` — needed for
  // its rounded shape — can't clip it; position it from the button's own rect instead of relying
  // on normal document flow. Opens upward, unconditionally: this composer only ever sits at the
  // bottom of the screen, so there's never a "not enough room below" case to detect the way a
  // floating menu elsewhere in the app has to.
  useLayoutEffect(() => {
    if (!plusMenuOpen) return;
    const r = plusMenuRef.current?.getBoundingClientRect();
    if (!r) return;
    setMenuPos({ left: r.left, bottom: window.innerHeight - r.top + 8 });
  }, [plusMenuOpen]);

  useEffect(() => {
    if (!plusMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!plusMenuRef.current?.contains(t) && !dropdownRef.current?.contains(t)) setPlusMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPlusMenuOpen(false);
    const onResize = () => setPlusMenuOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [plusMenuOpen]);

  const plusButton = (
    <div ref={plusMenuRef} className="shrink-0">
      <button
        type="button"
        aria-label="Add to the chat"
        aria-expanded={plusMenuOpen}
        title="Add"
        onClick={() => setPlusMenuOpen((current) => !current)}
        disabled={!loaded}
        className={cn(
          "grid size-10 max-lg:size-11 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-40",
          plusMenuOpen ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Plus className={cn("size-[18px] transition-transform", plusMenuOpen && "rotate-45")} />
      </button>
    </div>
  );

  const canSend = loaded && hasAsk(input);
  const micButton = speech.supported && <MicButton listening={speech.listening} disabled={!loaded} onToggle={speech.toggle} hasText={input.trim().length > 0} />;
  const sendButton = <SendButton canSend={canSend} micShown={speech.supported} />;

  // The single-line layout's reserved space for the overlaid plus/mic/send — used two ways
  // below: as the visible textarea's own padding while that overlay is showing, and permanently
  // on the hidden mirror (next), which is what actually decides `isMultiline` so that padding
  // can safely come OFF once the buttons move to their own row (see the mirror's own comment).
  const SINGLE_LINE_INSET = "pl-12 pr-24";

  const messageTextarea = (
    <div className="relative w-full">
      {/* Fixed at the single-line width forever, never painted (`invisible`, out of flow) — this
          is what `isMultiline` is actually decided from (passed to `useAutoGrowTextarea` as
          `mirrorRef`), instead of the real textarea below. Deciding it from the real textarea
          would feed back on itself once its own padding starts changing with the mode (right
          below): going multiline frees up the width the buttons used to occupy, which can let
          the very same text re-fit on one line, flipping back, narrowing it again, wrapping
          again — the infinite oscillation live-caught as "the box gets stuck and won't shrink
          back down." A width that never changes can't feed back into the decision that changes it. */}
      <div aria-hidden="true" className={cn("pointer-events-none invisible absolute inset-x-0 top-0 overflow-hidden break-words whitespace-pre-wrap py-2 text-base leading-normal", SINGLE_LINE_INSET)} ref={mirrorRef}>
        {input}
        {"​"}
      </div>
      {/* Ghost completion — sits behind the (transparent-background) textarea, so the real
          typed text visually covers its invisible spacer span and only the suggested
          remainder ("oam", "am", "m", ...) shows through in muted gray. */}
      {mentionGhost && (
        <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden py-2 text-base leading-normal break-words whitespace-pre-wrap", isMultiline ? "px-2.5" : SINGLE_LINE_INSET)}>
          <span className="invisible">{input}</span>
          <span className="text-muted-foreground">{mentionGhost}</span>
        </div>
      )}
      <textarea
        ref={textareaRef}
        aria-label="Message the group"
        rows={1}
        value={input}
        onChange={(event) => setInput(completeRoamMention(input, event.target.value))}
        onKeyDown={(event) => {
          if (event.key === "Tab" && mentionActive) {
            event.preventDefault();
            insertRoamMention();
            return;
          }
          // On a phone the keyboard's Return makes a new line (the arrow button sends); with a keyboard it sends, Shift+Return adds a line.
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && !window.matchMedia("(pointer: coarse)").matches) {
            event.preventDefault();
            void submit(input);
          }
        }}
        placeholder={!loaded ? "Loading…" : speech.listening ? "Listening…" : "Message the group"}
        maxLength={MAX_MESSAGE_LENGTH}
        disabled={!loaded}
        className={cn(
          "block max-h-[96px] w-full resize-none overflow-y-auto scrollbar-slim bg-transparent py-2 text-base leading-normal outline-none transition-[height] duration-150 ease-out placeholder:text-muted-foreground disabled:opacity-60",
          isMultiline ? "px-2.5" : SINGLE_LINE_INSET,
        )}
      />
      {/* Overlaid on the textarea's own reserved padding rather than laid out beside it as a
          flex sibling. `pointer-events-none` on the strip, `-auto` only on the buttons
          themselves, so clicking or selecting the visible text anywhere else still reaches the
          textarea underneath. */}
      {!isMultiline && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-between">
          <div className="pointer-events-auto">{plusButton}</div>
          <div className="pointer-events-auto flex items-center gap-1">
            {PHONE_V2 && !mentionsRoam(input) && (
              <button type="button" onClick={() => { setInput((cur) => (/@r?o?a?m?$/i.test(cur) ? cur.replace(/@r?o?a?m?$/i, "@Roam ") : `${cur}${cur && !/\s$/.test(cur) ? " " : ""}@Roam `)); textareaRef.current?.focus(); }} disabled={!loaded} aria-label="Ask Roam in the chat" className="grid size-11 shrink-0 place-items-center rounded-full font-display text-widget leading-none text-muted-foreground transition-colors active:bg-muted disabled:opacity-40 lg:hidden">@</button>
            )}
            {micButton}
            {sendButton}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden">
      {/* `overscroll-contain` — see the identical comment in ConversationSurface.tsx: keeps the
          rubber-band bounce at the top/bottom confined to this log instead of chaining into the
          page. */}
      <div ref={logRef} onScroll={onLogScrollInner} role="log" aria-label="Group chat messages" aria-live="polite" aria-relevant="additions" className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-slim">
        {/* The controls above float over the log: messages fade out beneath them instead of running into them. */}
        <div aria-hidden className="pointer-events-none sticky top-0 z-[1] -mb-14 h-14 w-full bg-gradient-to-b from-background via-background/85 to-transparent" />
        <div className={cn("mx-auto w-full space-y-1 pt-3 pb-28", PHONE_V2 ? "max-lg:pt-3" : "max-lg:pt-16", rail ? RAIL_MEASURE : "max-w-2xl")}>
          {!loaded && (
            <div aria-hidden className="space-y-5">
              <div className="h-9 w-40 skeleton rounded-2xl rounded-br-lg" />
              <div className="h-9 w-52 skeleton rounded-2xl" />
            </div>
          )}

          {loaded && (hasOlder || messages.length > windowSize) && (
            <div ref={olderSentinelRef} className="flex justify-center pt-4 pb-2">
              {loadingOlder ? (
                // A plain status, not a greyed-out button, and clear of the fade at the top of the log.
                <span role="status" className="inline-flex h-10 items-center gap-2 rounded-full bg-secondary px-4 text-sm font-semibold text-ink-soft"><Loader2 className="size-4 animate-spin" aria-hidden />Loading earlier messages</span>
              ) : (
                <button type="button" onClick={() => void loadOlder()} className={cn("btn-chip h-9 px-4 text-xs", PHONE_V2 && "max-lg:h-10 max-lg:border-0 max-lg:bg-secondary max-lg:text-sm max-lg:font-semibold max-lg:text-ink-soft")}>Show earlier messages</button>
              )}
            </div>
          )}

          {loaded && loadFailed && messages.length === 0 && older.length === 0 && (
            <div role="alert" className="flex flex-col items-center gap-3 pt-8 text-center">
              <p className="text-body text-ink-soft">Couldn’t load the chat.</p>
              <button type="button" onClick={() => void refresh()} className="btn-chip h-9 px-4 text-sm">Try again</button>
            </div>
          )}

          {loaded && !loadFailed && messages.length === 0 && older.length === 0 && outbox.length === 0 && (
            <ChatEmptyState tripId={tripId} showInvite={membersLoaded && members.length <= 1} onStarter={setInput} />
          )}

          {rows.map(({ message, showDateDivider, isFirstInGroup }) => {
            // Follow-up chips answer Roam's latest message only; under an older one they are stale, as in the Roam tab.
            const isLatestRoam = lastRoamId === message.id;
            const local = (message as { local?: Outgoing }).local;
            const isNew = !seenIdsRef.current.has(message.id);
            if (isNew) seenIdsRef.current.add(message.id);
            const mine = local ? true : message.userId !== null && message.userId === me?.userId;
            const isRoam = message.role === "assistant";
            const name = displayName(message.userId, members, me?.userId, membersLoaded);
            const expanded = expandedReactionFor === message.id;

            const divider = showDateDivider && (
              <div className="flex items-center justify-center py-3">
                <span className={cn("rounded-full bg-muted px-3 py-1 text-2xs font-medium tracking-[0.1em] text-muted-foreground uppercase", PHONE_V2 && "max-lg:bg-transparent max-lg:px-0 max-lg:text-xs max-lg:font-semibold max-lg:tracking-normal max-lg:normal-case")}>{dayLabel(message.created_at)}</span>
              </div>
            );

            if (message.kind === "system") {
              return (
                <div key={message.id}>
                  {divider}
                  <p className="mx-auto max-w-fit rounded-full bg-muted px-3 py-1 text-center text-2xs text-muted-foreground">{message.content}</p>
                </div>
              );
            }

            if (message.kind === "poll") {
              const poll = (message.metadata as { poll?: Poll } | undefined)?.poll;
              return (
                <div key={message.id}>
                  {divider}
                  <PollCard content={message.content} name={name} poll={poll} pendingVoteFor={pendingVoteFor} onVote={(pollId, optionKey) => void castVote(message.id, pollId, optionKey)} />
                </div>
              );
            }

            // Threads a reply back to whatever it's actually answering — with several people
            // texting at once, Roam's answer can land screens below the question by the time it
            // composes, so a flat append-at-the-bottom list alone isn't enough context.
            const replyToId = (message.metadata as { replyToMessageId?: string } | undefined)?.replyToMessageId;
            const replySource = replyToId ? messagesById.get(replyToId) : undefined;

            const rawRoamBlocks = isRoam ? (message.metadata as Partial<AssistantTurnMeta> | undefined)?.blocks : undefined;
            const roamBlocks = rawRoamBlocks && !isLatestRoam ? rawRoamBlocks.filter((b) => b.type !== "actions" && b.type !== "clarifying_question") : rawRoamBlocks;
            // Roam is the fifth friend here: its message is an ordinary bubble, same as any other
            // member's, and arrives whole like a person's message would. (Its text can still be
            // formatted — lists, bold — and any cards it shares sit under the bubble like an
            // attachment.)
            const quote = replySource && (
              <button
                type="button"
                onClick={() => scrollToMessage(replySource.id)}
                className="mb-1.5 flex max-w-full min-w-0 items-start gap-2 rounded-lg border-l-2 border-foreground/25 bg-foreground/5 px-2.5 py-1.5 text-left text-2xs transition-colors hover:bg-foreground/10"
              >
                <span className="shrink-0 font-medium text-foreground/80">{displayName(replySource.userId, members, me?.userId, membersLoaded)}</span>
                <span className="min-w-0 truncate text-muted-foreground">{replySource.content}</span>
              </button>
            );
            const bubbleClass = cn(
              "min-w-0 max-w-full rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words shadow-sm",
              PHONE_V2 && "max-lg:text-base max-lg:leading-snug max-lg:shadow-none",
              roamBlocks && roamBlocks.length > 0 && "max-w-[92%]",
              mine ? "rounded-br-lg bg-gradient-to-br from-primary to-primary/90 text-primary-foreground" : "rounded-tl-lg bg-muted text-foreground",
              PHONE_V2 && mine && "max-lg:bg-none max-lg:bg-primary",
            );
            const bubble = isRoam ? (
              <div className={cn(bubbleClass, "[&_.chat-prose]:text-sm [&_.chat-prose]:leading-relaxed")}>
                {quote}
                <AssistantMessage content={message.content} />
              </div>
            ) : (
              <p className={cn(bubbleClass, local?.status === "sending" && "opacity-70")}>{renderRich(message.content)}</p>
            );

            return (
              <div key={message.id}>
                {divider}
                <motion.div
                  ref={(el) => {
                    if (el) bubbleRefs.current.set(message.id, el);
                    else bubbleRefs.current.delete(message.id);
                  }}
                  // Your own message rises from the composer corner; a friend's arrives from their avatar side.
                  initial={isNew ? { opacity: 0, y: 14, scale: mine ? 0.92 : 0.96 } : false}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30, opacity: { duration: 0.16 } }}
                  style={{ transformOrigin: mine ? "100% 100%" : "0% 100%" }}
                  className={cn(
                    "flex min-w-0 items-start gap-2 rounded-2xl transition-colors duration-700",
                    isFirstInGroup ? "mt-3" : "mt-0.5",
                    mine ? "flex-row-reverse" : "flex-row",
                    highlightedId === message.id && "bg-coral-soft/60",
                  )}
                >
                  {!mine && <div className="w-7 shrink-0">{isFirstInGroup && <Avatar name={name} />}</div>}
                  <div className={cn("flex min-w-0 max-w-[85%] flex-col gap-1.5", mine ? "items-end" : "items-start", roamBlocks && roamBlocks.length > 0 && "w-full max-w-full")}>
                    {isFirstInGroup && (
                      <p className={cn("flex items-baseline gap-1.5 px-1 text-2xs", mine && "justify-end")}>
                        {!mine && <span style={{ color: memberTint(name).color }} className="font-semibold">{name}</span>}
                        <time dateTime={message.created_at} title={fullTime(message.created_at)} className="text-muted-foreground tabular-nums">{timeLabel(message.created_at)}</time>
                      </p>
                    )}
                    <motion.div
                      animate={{ scale: pressingId === message.id ? 0.96 : 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      onPointerDown={(event) => onBubblePressStart(event, message.id)}
                      onPointerUp={onBubblePressEnd}
                      onPointerCancel={onBubblePressEnd}
                      onPointerMove={onBubblePressMove}
                      title={fullTime(message.created_at)}
                      className="group relative min-w-0 max-w-full [touch-action:pan-y] [@media(pointer:coarse)]:select-none"
                    >
                      {bubble}
                      {/* The reaction trigger sits in the gutter at the vertical middle of the bubble —
                          left for your own messages, right for everyone else's. The expanded
                          picker starts from the trigger's exact point (same `layoutId`, so
                          Framer Motion morphs one into the other in place) but grows the other
                          direction — inward, over the message — rather than further out into
                          the empty gutter, which is too narrow for six emoji anyway. Reveal-on-
                          hover; touch has no hover state, so this never shows there — long-press
                          → the Sheet below is how touch reacts. */}
                      {!expanded && !local && (
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
                              // On a phone the bar floats just above the message, anchored to its near edge, so it never runs off the screen.
                              PHONE_V2 && "max-lg:top-auto max-lg:bottom-full max-lg:mb-2 max-lg:translate-y-0 max-lg:border-0 max-lg:p-1.5 max-lg:shadow-[0_8px_28px_-8px_oklch(0.2_0.012_65/0.4),0_0_0_1px_var(--color-hairline)]",
                              PHONE_V2 && (mine ? "max-lg:right-0 max-lg:left-auto" : "max-lg:left-0 max-lg:right-auto"),
                            )}
                          >
                            {COMMON_EMOJI.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                aria-label={`React ${emoji}`}
                                onClick={() => void toggleReaction(message.id, emoji)}
                                className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-base transition-transform hover:scale-125 active:scale-95", PHONE_V2 && "max-lg:size-11 max-lg:text-2xl")}
                              >
                                {emoji}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                    {roamBlocks && roamBlocks.length > 0 && (
                      // Cards use the whole row, as wide as in the Roam tab, not what is left after the avatar gutter and the 85% cap.
                      <div className="-ml-9 w-[calc(100%+2.25rem)] min-w-0 max-w-none">
                        <MessageBlocks blocks={roamBlocks} tripId={tripId} onFollowup={onFollowup} onOpenPlace={onOpenPlace} onOpenStay={onOpenStay} onOpenEvent={onOpenEvent} onOpenCollection={onOpenCollection} onOpenPanel={openPanel} replyText={message.content} />
                      </div>
                    )}
                    {isRoam && (message.metadata as Partial<AssistantTurnMeta> | undefined)?.degraded && replyToId && (
                      // Roam's planner failed for this one, so nothing was looked up (no cards): say so, and offer another go.
                      <p className="flex flex-wrap items-center gap-x-2 px-1 text-2xs text-muted-foreground">
                        Answered from the trip details only; Roam couldn’t look anything up.
                        {replySource?.userId != null && replySource.userId === me?.userId && (
                          <button type="button" onClick={() => askRoam(replyToId, { explicit: true })} className={cn(textAction, "text-2xs font-semibold underline")}>Try again</button>
                        )}
                      </p>
                    )}
                    {/* Only the person who asked sees that Roam didn't answer, with the Retry; the rest of the group just sees the thread. */}
                    {mine && !local && !pendingRoamIds.has(message.id) && (failedRoamIds.includes(message.id) || missedIds.includes(message.id)) && (
                      <p role="alert" className="flex items-center gap-2 px-1 text-2xs text-destructive">
                        Roam didn’t reply
                        <button type="button" onClick={() => askRoam(message.id)} className={cn(textAction, "text-2xs font-semibold underline")}>Retry</button>
                      </p>
                    )}
                    {local && (
                      <p role={local.status === "failed" ? "alert" : undefined} className={cn("flex items-center gap-2 px-1 text-2xs", local.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                        {local.status === "sending" ? "Sending…" : (
                          <>
                            Not sent{local.reason ? ` · ${local.reason}` : ""}
                            <button type="button" onClick={() => void submit(local.content, local.key)} className={cn(textAction, "text-2xs font-semibold underline")}>Retry</button>
                            <button type="button" onClick={() => setOutbox((current) => current.filter((o) => o.key !== local.key))} className={cn(textAction, "text-2xs text-muted-foreground underline hover:text-destructive")}>Delete</button>
                          </>
                        )}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 px-1">
                      {message.reactions.map((r) => (
                        <Pressable key={r.emoji}>
                          <motion.button
                            layout
                            type="button"
                            aria-pressed={r.mine}
                            aria-label={`${r.emoji} ${r.count}${r.mine ? ", you reacted" : ""}`}
                            onClick={() => void toggleReaction(message.id, r.emoji)}
                            className={cn(
                              "flex h-6 items-center gap-1 rounded-full border px-2 text-2xs transition-colors",
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
          {(pendingRoamIds.size > 0 || waitingIds.length > 0) && (
            // The same "typing…" bubble any friend would show while they write back.
            <TypingBubble />
          )}
        </div>

        <div className="pointer-events-none sticky bottom-0 left-0 -mt-10 h-10 w-full bg-gradient-to-t from-background to-transparent" />
      </div>

      <PollSheet open={pollSheetOpen} onClose={() => setPollSheetOpen(false)} onCreate={createPoll} />

      {unseen && (
        <button
          type="button"
          onClick={() => { setUnseen(false); scrollToEnd(); }}
          className="absolute bottom-[5.25rem] left-1/2 z-10 inline-flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-medium text-background shadow-lift transition-transform active:scale-[0.97]"
        >
          <ArrowDown className="size-3.5" aria-hidden /> New messages
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3">
        <div className={cn("pointer-events-auto relative mx-auto w-full", rail ? RAIL_MEASURE : "max-w-2xl")}>
          {notice && (
            <p role="status" className="pointer-events-auto absolute inset-x-0 bottom-full mx-auto mb-2 flex w-fit max-w-full items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-ink-soft shadow-lift">
              <span className="min-w-0 truncate">{notice.text}</span>
              {notice.action && <button type="button" onClick={notice.action.run} className="shrink-0 font-semibold text-foreground underline underline-offset-2">{notice.action.label}</button>}
            </p>
          )}
          <AnimatePresence>
            {away && !unseen && !notice && (
              <motion.button
                key="latest"
                type="button"
                onClick={scrollToEnd}
                aria-label="Jump to latest message"
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.2 }}
                whileTap={{ scale: 0.97 }}
                className={cn("absolute inset-x-0 bottom-full mx-auto mb-2 flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-ink-soft shadow-lift transition-colors hover:text-ink", PHONE_V2 && "max-lg:size-10 max-lg:justify-center max-lg:border-0 max-lg:p-0 max-lg:shadow-[0_6px_18px_-6px_rgb(29_26_23/0.35),0_0_0_1px_var(--color-hairline)]")}
              >
                <ArrowDown className="size-3.5 max-lg:size-[1.125rem]" aria-hidden />
                <span className={cn(PHONE_V2 && "max-lg:sr-only")}>Latest</span>
              </motion.button>
            )}
          </AnimatePresence>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void submit(input);
            }}
            className={cn(
              "flex w-full flex-col gap-1 overflow-hidden rounded-3xl border border-input bg-card p-1.5 shadow-lift transition-[border-color,box-shadow] duration-200 ease-out",
              "focus-within:border-ink/30 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-ink)_6%,transparent),var(--shadow-lift)]",
              PHONE_V2 && "max-lg:border-transparent max-lg:bg-secondary max-lg:shadow-none max-lg:focus-within:border-transparent max-lg:focus-within:shadow-none",
            )}
          >
            {/* `messageTextarea` (defined above, alongside the buttons it conditionally overlays)
                is the ONLY thing that must never remount — the buttons moving between an overlay
                and this row below are a plain conditional (harmless: a button holds no cursor or
                typing state to lose), but the same conditional around the textarea itself was the
                actual bug: switching which branch of a ternary rendered it gave React a different
                tree position each time, so it tore down and rebuilt the DOM node on every single
                line wrap — dropping focus and the cursor mid-keystroke. Live-caught as "the box
                grows but I can't type on the new line until I press Enter again." */}
            {messageTextarea}
            {isMultiline && (
              <div className="flex items-center justify-between gap-1">
                {plusButton}
                <div className="flex items-center gap-1">
                  {micButton}
                  {sendButton}
                </div>
              </div>
            )}
            {/* Portaled to <body> — the pill's own `overflow-hidden` (needed for its rounded
                shape) would otherwise clip a dropdown positioned relative to a button inside it. */}
            {typeof document !== "undefined" &&
              createPortal(
                plusMenuOpen && menuPos && (
                  <div
                    ref={dropdownRef}
                    role="menu"
                    style={{ position: "fixed", left: menuPos.left, bottom: menuPos.bottom }}
                    className="z-20 w-44 overflow-hidden rounded-2xl border border-border bg-card py-1 shadow-lift"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setPollSheetOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <ListChecks className="h-4 w-4 text-coral" /> Poll
                    </button>
                  </div>
                ),
                document.body,
              )}
          </form>
        </div>
      </div>
    </div>
  );
});
