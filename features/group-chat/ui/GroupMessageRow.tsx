"use client";

import { AnimatePresence, motion } from "motion/react";
import { SmilePlus } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { memberTint } from "@/lib/member-tint";
import { PHONE_V2 } from "@/lib/phone-v2";
import { Pressable } from "@/components/motion-primitives";
import { AssistantMessage } from "@/features/conversation/ui/AssistantMessage";
import { MessageBlocks } from "@/features/conversation/ui/blocks/MessageBlocks";
import { textAction } from "@/features/conversation/ui/blocks/ui";
import type { AssistantBlock, AssistantTurnMeta, PlaceCard, StayCardItem } from "@/packages/contracts/assistant";
import type { Poll } from "@/packages/contracts/poll";
import type { EventSeed } from "@/components/TripPanelProvider";
import type { Outgoing } from "../domain/outbox";
import type { GroupMessage } from "../domain/message";
import { Avatar, PollCard } from "./GroupChatParts";
import { dayLabel, displayName, fullTime, timeLabel } from "./chat-format";
import { renderRich } from "./rich-text";
import { cn } from "@/lib/utils";

const COMMON_EMOJI = ["👍", "❤️", "😂", "🎉", "😍", "🤔"];

/** What the row reads from the surface around it. */
export type RowView = {
  tripId: string;
  meUserId: string | undefined;
  members: Parameters<typeof displayName>[1];
  membersLoaded: boolean;
  messagesById: Map<string, GroupMessage>;
  expandedReactionFor: string | null;
  pressingId: string | null;
  highlightedId: string | null;
  pendingVoteFor: string | null;
  pendingRoamIds: Set<string>;
  failedRoamIds: string[];
  missedIds: string[];
  bubbleRefs: { current: Map<string, HTMLElement> };
};

/** What the row can do. */
export type RowActions = {
  castVote: (messageId: string, pollId: string, optionKey: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  setExpandedReactionFor: (id: string | null) => void;
  onBubblePressStart: (event: ReactPointerEvent, messageId: string) => void;
  onBubblePressEnd: () => void;
  onBubblePressMove: () => void;
  scrollToMessage: (id: string) => void;
  askRoam: (messageId: string, options?: { explicit?: boolean }) => void;
  submit: (text: string, retryKey?: string) => Promise<unknown> | void;
  setOutbox: (update: (current: Outgoing[]) => Outgoing[]) => void;
  onFollowup: (prompt: string) => void;
  onOpenPlace: (place: PlaceCard) => void;
  onOpenStay: (stay: StayCardItem, dates: { checkin: string; checkout: string; adults?: number }) => void;
  onOpenEvent: (seed: EventSeed) => void;
  onOpenCollection: (title: string, block: AssistantBlock) => void;
  openPanel: Parameters<typeof MessageBlocks>[0]["onOpenPanel"];
};

/** One row of the thread: the message in its bubble (or poll, or system line), its reactions, Roam's cards, and what went wrong with it. */
export function GroupMessageRow({ message, showDateDivider, isFirstInGroup, isLatestRoam, isNew, view, actions }: {
  message: GroupMessage;
  showDateDivider: boolean;
  isFirstInGroup: boolean;
  /** Follow-up chips answer Roam's latest message only; under an older one they are stale, as in the Roam tab. */
  isLatestRoam: boolean;
  /** Not seen on screen before: it animates in. */
  isNew: boolean;
  view: RowView;
  actions: RowActions;
}) {
  const { tripId, meUserId, members, membersLoaded, messagesById, expandedReactionFor, pressingId, highlightedId, pendingVoteFor, pendingRoamIds, failedRoamIds, missedIds, bubbleRefs } = view;
  const { castVote, toggleReaction, setExpandedReactionFor, onBubblePressStart, onBubblePressEnd, onBubblePressMove, scrollToMessage, askRoam, submit, setOutbox, onFollowup, onOpenPlace, onOpenStay, onOpenEvent, onOpenCollection, openPanel } = actions;
  const local = (message as { local?: Outgoing }).local;
  const mine = local ? true : message.userId !== null && message.userId === meUserId;
  const isRoam = message.role === "assistant";
  const name = displayName(message.userId, members, meUserId, membersLoaded);
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
      <span className="shrink-0 font-medium text-foreground/80">{displayName(replySource.userId, members, meUserId, membersLoaded)}</span>
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
              {replySource?.userId != null && replySource.userId === meUserId && (
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

}
