"use client";

import { AnimatePresence, motion } from "motion/react";
import { SmilePlus } from "lucide-react";
import { memberTint } from "@/lib/member-tint";
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
import { renderRich, type MentionLookup } from "./rich-text";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";

const COMMON_EMOJI = ["👍", "❤️", "😂", "🎉", "😍", "🤔"];
// The phone pill is a 44px-tall row (p-1 around 36px buttons), set 4px low so it clears the last line of the message; closed, it is clipped to the 24px smiley it grows out of, so opening only
// widens it from that spot and closing draws it back in. Same shape both ends (px for top/bottom/radius, % for the right edge) so they interpolate.
const PILL_W = COMMON_EMOJI.length * 36 + (COMMON_EMOJI.length - 1) * 2 + 8;
const PILL_CLOSED = { opacity: 0, clipPath: `inset(6px ${((1 - 24 / PILL_W) * 100).toFixed(1)}% 14px 0px round 12px)` };
const PILL_OPEN = "inset(0px 0% 0px 0px round 22px)";
const PILL_EASE = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
// Desktop: a 38px-tall bar (border + p-1 around 28px buttons) anchored by its right edge on the 32px trigger, clipped to the trigger when closed.
const BAR_W = COMMON_EMOJI.length * 28 + (COMMON_EMOJI.length - 1) * 2 + 10;
const BAR_CLOSED = { opacity: 0, clipPath: `inset(3px 0% 3px ${((1 - 32 / BAR_W) * 100).toFixed(1)}% round 16px)` };
const BAR_OPEN = "inset(0px 0% 0px 0% round 19px)";

/** What the row reads from the surface around it. */
export type RowView = {
  tripId: string;
  meUserId: string | undefined;
  members: Parameters<typeof displayName>[1];
  membersLoaded: boolean;
  /** How "@Name" of someone on the trip is found and coloured in a message. */
  mentions: MentionLookup;
  messagesById: Map<string, GroupMessage>;
  expandedReactionFor: string | null;
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
  const { tripId, meUserId, members, membersLoaded, mentions, messagesById, expandedReactionFor, highlightedId, pendingVoteFor, pendingRoamIds, failedRoamIds, missedIds, bubbleRefs } = view;
  const { castVote, toggleReaction, setExpandedReactionFor, scrollToMessage, askRoam, submit, setOutbox, onFollowup, onOpenPlace, onOpenStay, onOpenEvent, onOpenCollection, openPanel } = actions;
  const local = (message as { local?: Outgoing }).local;
  const mine = local ? true : message.userId !== null && message.userId === meUserId;
  const isRoam = message.role === "assistant";
  const name = displayName(message.userId, members, meUserId, membersLoaded);
  const expanded = expandedReactionFor === message.id;
  // The phone reacts from a smiley under the message that opens into a pill of six; a wide screen keeps its hover button and floating bar.
  const phone = useMediaQuery("(max-width: 1023.98px)");

  const divider = showDateDivider && (
    <div className="flex items-center justify-center py-3">
      <span className="rounded-full bg-muted px-3 py-1 text-2xs font-medium tracking-[0.1em] text-muted-foreground uppercase max-lg:bg-transparent max-lg:px-0 max-lg:text-xs max-lg:font-semibold max-lg:tracking-normal max-lg:normal-case">{dayLabel(message.created_at)}</span>
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
  // Someone pointed this message at you: the bubble says so, so it is easy to find again.
  const pointsAtYou = !mine && !!meUserId && ((message.metadata as { mentions?: string[] } | undefined)?.mentions ?? []).includes(meUserId);
  const bubbleClass = cn(
    "min-w-0 max-w-full rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words shadow-sm",
    "max-lg:text-base max-lg:leading-snug max-lg:shadow-none",
    roamBlocks && roamBlocks.length > 0 && "max-w-[92%]",
    mine ? "rounded-br-lg bg-gradient-to-br from-primary to-primary/90 text-primary-foreground" : "rounded-tl-lg bg-muted text-foreground",
    pointsAtYou && "ring-2 ring-coral/40",
    mine && "max-lg:bg-none max-lg:bg-primary",
  );
  const bubble = isRoam ? (
    <div className={cn(bubbleClass, "[&_.chat-prose]:text-sm [&_.chat-prose]:leading-relaxed")}>
      {quote}
      <AssistantMessage content={message.content} />
    </div>
  ) : (
    <p className={cn(bubbleClass, local?.status === "sending" && "opacity-70")}>{renderRich(message.content, mentions, mine)}</p>
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
          {/* The text stays selectable: holding a message selects it, as anywhere else. Reacting is the smiley under it. */}
          <div title={fullTime(message.created_at)} className={cn("group relative min-w-0 max-w-full transition-[margin] duration-200", phone && !local && (!mine || message.reactions.length > 0) && "mb-4")}>
            {bubble}
            {/* The reaction trigger sits in the gutter at the vertical middle of the bubble, to the right of everyone else's messages.
                Tapped, a pill of the six grows out of the trigger's own spot, inward over the message (the gutter is too narrow
                for six emoji), and draws back into it on close; nothing around it moves. Reveal-on-hover; touch has no hover
                state, so this never shows there — the phone design below is how touch reacts. */}
            {!phone && !mine && !local && (
              <div
                className={cn(
                  "pointer-events-none absolute top-1/2 left-full z-10 ml-2 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                  expanded && "opacity-100",
                )}
              >
                <motion.button
                  type="button"
                  onClick={() => setExpandedReactionFor(message.id)}
                  aria-label="Add reaction"
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="hit-44 pointer-events-auto grid size-8 shrink-0 place-items-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-lift backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
                >
                  <SmilePlus className="size-4" />
                </motion.button>
                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      key="bar"
                      data-reaction-expand
                      initial={BAR_CLOSED}
                      animate={{ clipPath: BAR_OPEN, opacity: 1, transition: { clipPath: PILL_EASE, opacity: { duration: 0.08 } } }}
                      exit={{ ...BAR_CLOSED, transition: { clipPath: PILL_EASE, opacity: { duration: 0.08, delay: 0.14 } } }}
                      className="pointer-events-auto absolute top-1/2 right-0 flex -translate-y-1/2 items-center gap-0.5 rounded-full border border-border bg-card p-1 shadow-lift"
                    >
                      {COMMON_EMOJI.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          aria-label={`React ${emoji}`}
                          onClick={() => void toggleReaction(message.id, emoji)}
                          className="grid size-7 shrink-0 place-items-center rounded-full text-base transition-transform hover:scale-125 active:scale-[0.97]"
                        >
                          {emoji}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            {/* Phone: a smiley under the message. Tapped (or the message held), a pill of the six grows out of the smiley's own spot and lies over whatever is next to it; nothing around it moves. Picking one, or tapping elsewhere, draws it back in. */}
            {phone && !local && (!mine || message.reactions.length > 0) && (
              <div className={cn("absolute top-full -mt-2 z-10 flex items-center gap-1", mine ? "right-3 flex-row-reverse" : "left-3")}>
                {!mine && (
                  <span className="relative z-10">
                    <button
                      type="button"
                      onClick={() => setExpandedReactionFor(message.id)}
                      aria-label="Add reaction"
                      className="relative grid size-6 min-h-0! place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-colors before:absolute before:-inset-2.5 before:content-[''] active:bg-muted"
                    >
                      <SmilePlus className="size-3.5" aria-hidden />
                    </button>
                    <AnimatePresence>
                      {expanded && (
                        <div className="pointer-events-none absolute top-1/2 left-0 -translate-y-[calc(50%-4px)]">
                          <motion.div
                            key="pill"
                            data-reaction-expand
                            role="group"
                            aria-label="React to this message"
                            initial={PILL_CLOSED}
                            animate={{ clipPath: PILL_OPEN, opacity: 1, transition: { clipPath: PILL_EASE, opacity: { duration: 0.08 } } }}
                            exit={{ ...PILL_CLOSED, transition: { clipPath: PILL_EASE, opacity: { duration: 0.08, delay: 0.14 } } }}
                            className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-card p-1 shadow-[0_6px_16px_-8px_oklch(0.2_0.012_65/0.22),0_0_0_1px_var(--color-hairline)]"
                          >
                            {COMMON_EMOJI.map((emoji) => {
                              const mineHere = message.reactions.some((r) => r.emoji === emoji && r.mine);
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  aria-label={`React ${emoji}`}
                                  aria-pressed={mineHere}
                                  onClick={() => void toggleReaction(message.id, emoji)}
                                  className={cn("grid size-9 min-h-0! shrink-0 place-items-center rounded-full text-xl transition-[background-color,transform] active:scale-[0.9]", mineHere && "bg-muted ring-1 ring-border")}
                                >
                                  {emoji}
                                </button>
                              );
                            })}
                          </motion.div>
                        </div>
                      )}
                    </AnimatePresence>
                  </span>
                )}
                <div className={cn("flex items-center gap-1", mine && "flex-row-reverse")}>
                  {message.reactions.map((r) => (
                    <Pressable key={r.emoji}>
                      <motion.button
                        layout
                        type="button"
                        aria-pressed={r.mine}
                        aria-label={`${r.emoji} ${r.count}${r.mine ? ", you reacted" : ""}`}
                        onClick={() => void toggleReaction(message.id, r.emoji)}
                        className={cn(
                          "relative flex h-6 min-h-0! items-center gap-1 rounded-full border px-2 text-2xs transition-colors before:absolute before:-inset-x-0.5 before:-inset-y-2 before:content-['']",
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
            )}
          </div>
          {roamBlocks && roamBlocks.length > 0 && (
            // Cards use the whole row, as wide as in the Roam tab, not what is left after the avatar gutter and the 85% cap.
            <div className="-ml-9 w-[calc(100%+2.25rem)] min-w-0 max-w-none">
              <MessageBlocks blocks={roamBlocks} tripId={tripId} onFollowup={onFollowup} onOpenPlace={onOpenPlace} onOpenStay={onOpenStay} onOpenEvent={onOpenEvent} onOpenCollection={onOpenCollection} onOpenPanel={openPanel} replyText={message.content} asOf={message.created_at} />
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
          {!phone && (
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
                    "relative flex h-6 min-h-0! items-center gap-1 rounded-full border px-2 text-2xs transition-colors before:absolute before:-inset-x-0.5 before:-inset-y-2 before:content-['']",
                    r.mine ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent",
                  )}
                >
                  <span>{r.emoji}</span>
                  <span>{r.count}</span>
                </motion.button>
              </Pressable>
            ))}
          </div>
          )}
        </div>
      </motion.div>
    </div>
  );

}
