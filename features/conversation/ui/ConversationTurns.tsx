"use client";

import { motion } from "motion/react";
import { ChevronRight, Info } from "lucide-react";
import type { AssistantBlock, AssistantTurnMeta } from "@/packages/contracts/assistant";
import { AssistantMessage, type BlockHandlers } from "./AssistantMessage";
import { CopyButton } from "./blocks/ui";
import { replyNotes, hostOf } from "../domain/replyNotes";
import type { Message } from "../domain/message";
import { cn } from "@/lib/utils";

/** An older reply's blocks without its follow-up chips. Cached per source array so the result keeps its identity (a fresh array each render would defeat the memoised AssistantMessage). */
const settledBlocks = new WeakMap<AssistantBlock[], AssistantBlock[]>();

function withoutChips(blocks: AssistantBlock[] | undefined) {
  if (!blocks) return blocks;
  let kept = settledBlocks.get(blocks);
  if (!kept) settledBlocks.set(blocks, (kept = blocks.filter((b) => b.type !== "actions" && b.type !== "clarifying_question")));
  return kept;
}

/** The traveller's own message: it leaves the composer, rising from the bottom-right corner, and says "Sending…" until the server has it. */
export function UserTurn({ message, isNew, undelivered }: { message: Message; isNew: boolean; undelivered: boolean }) {
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
      <p className={cn("max-w-[85%] rounded-2xl rounded-br-lg bg-primary px-4 py-2.5 text-body leading-normal text-primary-foreground transition-opacity duration-300 dark:border dark:border-border dark:bg-surface-raised dark:text-foreground", undelivered && "opacity-70")}>
        <span className="sr-only">You: </span>
        {message.content}
      </p>
      {/* Until the server has the message it carries a local id: say so, rather than leaving "did that go?" */}
      {undelivered && <span role="status" className="pr-1 text-xs text-muted-foreground">Sending…</span>}
    </motion.div>
  );
}

/** Roam's reply: the words and cards, anything worth a footnote, the sources behind it, and Copy. */
export function ReplyTurn({ message, isNew, streaming, live, isLatest, dir, handlers }: {
  message: Message;
  isNew: boolean;
  streaming: boolean;
  /** Arrived in this visit: its cards animate in. */
  live: boolean;
  /** Chips answer the reply they came with; once the conversation moves on they are stale. */
  isLatest: boolean;
  dir: "rtl" | undefined;
  handlers: BlockHandlers;
}) {
  const meta = message.metadata as AssistantTurnMeta | undefined;
  const sources = streaming ? [] : (meta?.sources ?? []);
  const blocks = isLatest ? meta?.blocks : withoutChips(meta?.blocks);
  const notes = replyNotes(meta, streaming);

  return (
  <motion.div
    key={message.id}
    initial={isNew ? { opacity: 0, y: 10 } : false}
    animate={{ opacity: 1, y: 0 }}
    transition={{ type: "spring", stiffness: 240, damping: 26 }}
    dir={dir}
    data-latest-reply={isLatest ? "" : undefined}
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
}
