"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import type { AssistantBlock, AssistantTurnMeta, PlaceCard, StayCardItem } from "@/packages/contracts/assistant";
import type { EventSeed } from "@/components/TripPanelProvider";
import { notifyToast } from "@/lib/application/toast";
import { useSpeechInput } from "@/lib/use-speech-input";
import { useKeepScrollGap } from "@/lib/use-keep-scroll-gap";
import { type BlockHandlers } from "./AssistantMessage";
import { proposalQuestion } from "../domain/proposal";
import { unansweredMessage } from "../domain/sendOutcome";
import type { CardPanel } from "@/components/TripPanelProvider";
import { useSendMessage } from "../application/useSendMessage";
import { useLogScroll } from "../application/useLogScroll";
import { useProposal } from "../application/useProposal";
import { useConversationThread } from "../application/useConversationThread";
import { GuestSavePrompt } from "@/features/identity/ui/GuestSavePrompt";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { GUEST_TURN_LIMIT } from "@/lib/guest-limits";
import { cn } from "@/lib/utils";
import { Typing, TurnOutcome } from "./ConversationStatus";
import { ConversationHero } from "./ConversationHero";
import { ProposalCard } from "./ProposalCard";
import { ReplyTurn, UserTurn } from "./ConversationTurns";
import { RoamComposer } from "./RoamComposer";
import { describeProposal } from "../domain/proposal";

const RTL = new Set(["ar", "he", "fa", "ur", "ps", "sd"]);


export { RAIL_MEASURE } from "./rail";
import { RAIL_MEASURE } from "./rail";

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
  const { messages, setMessages, loaded, synced, seenMessageIdsRef } = useConversationThread(tripId);
  const [input, setInput] = useState("");
  // `saveOpen`: a guest asked to save before running out of free messages (the hard stop, `guestGate`, comes from the sender).
  const [saveOpen, setSaveOpen] = useState(false);
  const { guest, openGate } = useGuest();
  const { proposal, setProposal, confirming, confirmProposal } = useProposal({ guest, openGate });
  const { sending, undelivered, outcome, progressStage, progressLabel, queued, setQueued, guestGate, pendingFirst, submit, stop } = useSendMessage({
    tripId,
    viewContext,
    messages,
    setMessages,
    loaded,
    synced,
    guest,
    onSurfaceSelect,
    setProposal,
    setInput,
    stopListening: () => { if (speech.listening) speech.stop(); },
    seenMessageIdsRef,
  });
  const logRef = useRef<HTMLDivElement>(null);
  useKeepScrollGap(logRef);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speechBaseRef = useRef("");
  // Message ids treated as already-settled — restored history (the cache, a background merge)
  // must appear in place, not replay its whole entrance animation every time the log mounts.
  const liveMessageIdsRef = useRef<Set<string>>(new Set());

  // Dictation: transcript is appended after whatever was already typed when the mic started.
  const speech = useSpeechInput({
    onStart: () => {
      speechBaseRef.current = input.trim() ? `${input.trim()} ` : "";
    },
    onResult: (text) => setInput(speechBaseRef.current + text),
    onError: (message) => notifyToast(message, "error"),
  });

  // A `?ask=` param (from a detail page's "ask the assistant" link) pre-fills the composer once.
  useEffect(() => {
    const ask = new URLSearchParams(window.location.search).get("ask");
    if (!ask) return;
    setInput(ask);
    window.history.replaceState({}, "", window.location.pathname);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const { scroll, handleLogScroll, scrollToLatestMessage, windowSize, showEarlier } = useLogScroll({ logRef, sending, loaded, messageCount: messages.length, onLogScroll });

  const userTurns = messages.filter((m) => m.role === "user").length;
  const turnsLeft = Math.max(0, GUEST_TURN_LIMIT - userTurns);

  // Stable for the life of the surface: the callbacks read the latest props through a ref, so typing in the composer or
  // opening the side panel does not hand every reply new handlers and re-render the whole log.
  const latest = useRef({ submit, onOpenPlace, onOpenStay, onOpenEvent, onOpenCollection, onOpenPanel });
  useLayoutEffect(() => {
    latest.current = { submit, onOpenPlace, onOpenStay, onOpenEvent, onOpenCollection, onOpenPanel };
  });
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
  const proposalText = proposal ? proposalQuestion(proposal, proposalRows) : "";

  // A message Roam never answered: the connection dropped before the reply was saved (tab closed, phone locked).
  // Re-sending under the same key is safe: the server upserts the user's message, so it is not duplicated.
  const unanswered = unansweredMessage({ messages, loaded, sending, queued: Boolean(queued), now: Date.now() });

  // What the log actually renders. The whole thread is in memory either way — this is about the main
  // thread: laying out a 128-turn history (every card, map and table in it) blocked a mid-range phone for
  // ~650 ms, half a second of nothing when the chat opens. Earlier turns render on request, like the
  // group chat's own "Show earlier messages".
  const hiddenCount = Math.max(0, messages.length - windowSize);
  const visible = hiddenCount > 0 ? messages.slice(hiddenCount) : messages;
  const pendingBubble = pendingFirst !== null && !messages.some((m) => m.role === "user");
  const showHero = loaded && messages.length === 0 && !rail && !pendingBubble;
  const waiting = (sending && messages[messages.length - 1]?.content.trim() === "") || pendingBubble;

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
        <div className={cn("mx-auto w-full space-y-6 pt-2 pb-28", "max-lg:pt-3", rail ? RAIL_MEASURE : "max-w-2xl")}>
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

          {showHero && <ConversationHero disabled={guestGate} onStarter={setInput} />}

          {hiddenCount > 0 && (
            <div className="flex justify-center pb-2">
              <button type="button" onClick={showEarlier} className={cn("btn-chip h-9 px-4 text-xs", "max-lg:h-10 max-lg:border-0 max-lg:bg-secondary max-lg:text-sm max-lg:font-semibold max-lg:text-ink-soft")}>Show earlier messages</button>
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

            if (message.role === "user") return <UserTurn key={message.id} message={message} isNew={isNew} undelivered={undelivered === message.id} />;
            return <ReplyTurn key={message.id} message={message} isNew={isNew} streaming={streaming} live={live} isLatest={index === messages.length - 1} dir={dir} handlers={handlers} />;
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

          {proposal && <ProposalCard text={proposalText} rows={proposalRows} confirming={confirming} onConfirm={() => void confirmProposal()} onCancel={() => setProposal(null)} />}

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

      <RoamComposer
        tripId={tripId}
        rail={rail}
        input={input}
        setInput={setInput}
        loaded={loaded}
        guestGate={guestGate}
        sending={sending}
        speech={speech}
        stop={stop}
        submit={submit}
        queued={queued}
        setQueued={setQueued}
        away={scroll.away}
        scrollToLatestMessage={scrollToLatestMessage}
        textareaRef={textareaRef}
      />
    </div>
  );
});
