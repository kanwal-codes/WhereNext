"use client";

import { useEffect, useRef, useState, type Ref, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, ChevronUp, Eraser, RotateCcw, Search } from "lucide-react";
import { SendButton } from "@/components/ComposerButtons";
import { COMPARE_VERDICT_PROMPT, FAILED, useCompareChat } from "@/components/useCompareChat";
import { AssistantMessage } from "@/features/conversation/ui/AssistantMessage";
import { RoamMark } from "@/features/roam/ui/RoamMark";
import { useScrollCompact } from "@/lib/use-scroll-compact";

type Chat = ReturnType<typeof useCompareChat>;

/** Roam at work on an answer: its mark moving, a line of words shimmering beside it, and the shape of the answer to come. */
function Thinking() {
  return (
    <div role="status" aria-live="polite" className="space-y-3 py-1">
      <div className="flex items-center gap-1.5">
        <RoamMark state="thinking" size={32} className="text-foreground" />
        <span className="shimmer-text ml-1 text-xs">Thinking it through…</span>
      </div>
      <div aria-hidden className="space-y-2">
        <span className="skeleton block h-3 w-full rounded-full" />
        <span className="skeleton block h-3 w-4/5 rounded-full" />
      </div>
    </div>
  );
}

/**
 * The ask box floats over the bottom of the panel, like the main chat's message box and the Ask bar on Stay and Discover: translucent, so the page
 * shows through it, and folded into the small Ask pill while the reader goes down the page, open again on the way back up. What is asked and
 * answered sits above it as one card: each question a quiet bubble, each answer written in as it arrives, a way to fold the card away, and a retry
 * when an answer fails. The panel's own content gets bottom padding as tall as all of this, measured, so the last of it can always be scrolled clear.
 */
export function TripPanelComposer({ boxRef, chat, isCompare, scrollRef }: {
  boxRef: Ref<HTMLDivElement>;
  chat: Chat;
  isCompare: boolean;
  /** The panel's own scrolling content, whose scrolling folds the box into the pill. */
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const { chat: messages, input, setInput, sending, ask, verdictMsg, retryLast, clear } = chat;
  const reduce = useReducedMotion();
  const shown = messages.filter((m) => m !== verdictMsg && !(m.role === "user" && m.content === COMPARE_VERDICT_PROMPT));
  const [open, setOpen] = useState(true);
  const [focused, setFocused] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useScrollCompact({ target: scrollRef, topZone: 80 });
  // Folded only while the reader is just reading: never while they type, wait for an answer or have the box focused.
  const compact = scrolled && !focused && !input.trim() && !sending;
  // A new question opens the card again; whatever arrives brings the newest of it into view.
  const asked = shown.filter((m) => m.role === "user").length;
  useEffect(() => { if (asked > 0) setOpen(true); }, [asked]);
  const last = shown[shown.length - 1];
  useEffect(() => {
    const el = scroller.current;
    if (el && open) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [shown.length, last?.content, open, reduce]);

  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-surface from-60% to-transparent px-3 pt-8 pb-3 max-lg:bg-none max-lg:px-4 max-lg:pt-0 max-lg:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
    <div className="pointer-events-auto flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {shown.length > 0 && !compact && (
          <motion.section
            key="answers"
            aria-label="Answers"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="flex shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card pb-0 shadow-lift"
          >
            {/* The controls of the conversation sit on the conversation: Clear on the left, fold on the right, one 40px row, the grey circle the app uses for a sheet's close. */}
            <div className="flex shrink-0 items-center justify-between gap-2 px-2.5 pt-2">
              {open ? (
                <button type="button" onClick={clear} disabled={sending} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-soft transition-[background-color,color,transform] hover:bg-muted hover:text-foreground active:scale-[0.97] disabled:opacity-40">
                  <Eraser className="size-4" aria-hidden />
                  Clear chat
                </button>
              ) : (
                <span className="px-3 text-sm font-medium text-ink-soft">{shown.filter((m) => m.role === "user").length === 1 ? "1 question" : `${shown.filter((m) => m.role === "user").length} questions`}</span>
              )}
              <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? "Hide the answers" : "Show the answers"} className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-foreground transition-transform duration-150 active:scale-[0.97]">
                {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronUp className="size-4" aria-hidden />}
              </button>
            </div>
            {open && (
              <div ref={scroller} className="max-h-[min(40dvh,23rem)] space-y-4 overflow-y-auto overscroll-contain scrollbar-slim px-4 pb-4 pt-2">
                {shown.map((m, i) => {
                  if (m.role === "user") {
                    return (
                      <div key={i} className="flex justify-end">
                        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-sm leading-snug">{m.content}</p>
                      </div>
                    );
                  }
                  const loading = sending && i === shown.length - 1;
                  return (
                    <div key={i}>
                      {m.content === FAILED ? (
                        <div className="space-y-2">
                          <p className="text-sm text-ink-soft">{m.content}</p>
                          <button type="button" onClick={retryLast} disabled={sending} className="btn-chip max-lg:h-10"><RotateCcw className="size-3.5" aria-hidden />Try again</button>
                        </div>
                      ) : m.content ? (
                        <AssistantMessage content={m.content} streaming={loading} />
                      ) : loading ? (
                        <Thinking />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
      <div className="flex justify-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          data-compact={compact || undefined}
          // The same box, and the same fold into a pill, as the Ask bar on Stay and Discover, frosted like every message box.
          className="ask-dock-form shrink-0"
        >
          <div className="ask-dock-full" inert={compact}>
            <div className="flex items-center gap-1">
              <input
                ref={field}
                aria-label="Ask about this item"
                name="panel-question"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isCompare ? "Ask about these — value, location, what to pick…" : "Ask about this — does it fit my trip?"}
                className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground max-lg:h-11"
              />
              <SendButton canSend={!sending && Boolean(input.trim())} />
            </div>
          </div>
          <button
            type="button"
            className="ask-dock-mini"
            tabIndex={compact ? 0 : -1}
            aria-hidden={!compact}
            aria-label="Open the ask box"
            // Focusing the pill (a press does, before the click lands) opens the box; the field is inert until that has rendered, so it takes focus a frame later.
            onFocus={() => requestAnimationFrame(() => field.current?.focus())}
            onClick={() => { setScrolled(false); requestAnimationFrame(() => field.current?.focus()); }}
          >
            <Search className="size-4" aria-hidden />
            Ask
          </button>
        </form>
      </div>
    </div>
    </div>
  );
}
