"use client";

import { RAIL_MEASURE } from "@/features/conversation/ui/ConversationSurface";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, Loader2 } from "lucide-react";
import { PHONE_V2 } from "@/lib/phone-v2";
import { markGroupRead } from "@/lib/client/use-group-unread";
import { useKeepScrollGap } from "@/lib/use-keep-scroll-gap";
import { useSpeechInput } from "@/lib/use-speech-input";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanel, type EventSeed } from "@/components/TripPanelProvider";
import { notifyToast } from "@/lib/application/toast";
import type { AssistantBlock, PlaceCard, StayCardItem } from "@/packages/contracts/assistant";
import { useMessageSender } from "../application/useMessageSender";
import { useRoamAsks } from "../application/useRoamAsks";
import { useGroupChatLog } from "../application/useGroupChatLog";
import { useGroupInteractions } from "../application/useGroupInteractions";
import { buildRows, chatNotice, lastRoamMessageId } from "../domain/chat-state";
import { mentionsRoam } from "../domain/message";
import { useChatLive } from "@/lib/client/trip-realtime";
import { useTripMembers } from "@/lib/client/use-trip-members";
import { ChatEmptyState, PollSheet, TypingBubble } from "./GroupChatParts";
import { GroupMessageRow, type RowActions, type RowView } from "./GroupMessageRow";
import { GroupComposer } from "./GroupComposer";
import { dayLabel } from "./chat-format";
import { cn } from "@/lib/utils";

const COMMON_EMOJI = ["👍", "❤️", "😂", "🎉", "😍", "🤔"];
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
  const cacheKey = `wn-group-cache:${tripId}:${me?.userId ?? "anon"}`;
  const chatLive = useChatLive();
  const [liveDown, setLiveDown] = useState(false);
  // Following the conversation: true while you are at the bottom. A message that arrives while you are reading higher up waits behind a pill.
  const nearBottomRef = useRef(true);
  const lastIdRef = useRef<string | null>(null);
  const [unseen, setUnseen] = useState(false);
  // Far above the newest message: offer a way straight back (same pill as the Roam chat).
  const [away, setAway] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [pollSheetOpen, setPollSheetOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  useKeepScrollGap(logRef);
  const { messages, setMessages, older, hasOlder, windowSize, loadingOlder, loaded, loadFailed, refresh, loadOlder, olderSentinelRef, seenIdsRef, skewRef } = useGroupChatLog({ tripId, active, cacheKey, logRef });
  const { expandedReactionFor, setExpandedReactionFor, pressingId, pendingVoteFor, createPoll, castVote, toggleReaction, onBubblePressStart, onBubblePressEnd, onBubblePressMove } = useGroupInteractions({ tripId, setMessages, refresh });
  const speechBaseRef = useRef("");
  const bubbleRefs = useRef<Map<string, HTMLElement>>(new Map());
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const { outbox, setOutbox, submit, online } = useMessageSender({
    tripId,
    meUserId: me?.userId,
    input,
    setInput,
    messages,
    setMessages,
    seenIdsRef,
    refresh,
    askRoam,
    stopListening: () => { if (speech.listening) speech.stop(); },
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

  // Dictation: transcript is appended after whatever was already typed when the mic started.
  const speech = useSpeechInput({
    onStart: () => {
      speechBaseRef.current = input.trim() ? `${input.trim()} ` : "";
    },
    onResult: (text) => setInput(speechBaseRef.current + text),
    onError: (message) => notifyToast(message, "error"),
  });

  const rowView: RowView = { tripId, meUserId: me?.userId, members, membersLoaded, messagesById, expandedReactionFor, pressingId, highlightedId, pendingVoteFor, pendingRoamIds, failedRoamIds, missedIds, bubbleRefs };
  const rowActions: RowActions = { castVote, toggleReaction, setExpandedReactionFor, onBubblePressStart, onBubblePressEnd, onBubblePressMove, scrollToMessage, askRoam, submit, setOutbox, onFollowup, onOpenPlace, onOpenStay, onOpenEvent, onOpenCollection, openPanel };

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
            const isNew = !seenIdsRef.current.has(message.id);
            if (isNew) seenIdsRef.current.add(message.id);
            return <GroupMessageRow key={message.id} message={message} showDateDivider={showDateDivider} isFirstInGroup={isFirstInGroup} isLatestRoam={lastRoamId === message.id} isNew={isNew} view={rowView} actions={rowActions} />;
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
          <GroupComposer input={input} setInput={setInput} loaded={loaded} submit={submit} speech={speech} onPoll={() => setPollSheetOpen(true)} />
        </div>
      </div>
    </div>
  );
});
