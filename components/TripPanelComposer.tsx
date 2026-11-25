"use client";

import { useEffect, useRef, useState, type Ref, type RefObject } from "react";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import { ChevronUp, RotateCcw, Search } from "lucide-react";
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
export function TripPanelComposer({ boxRef, chat, isCompare, scrollRef, placeholder, fade = false }: {
  boxRef: Ref<HTMLDivElement>;
  chat: Chat;
  isCompare: boolean;
  /** The panel's own scrolling content, whose scrolling folds the box into the pill. */
  scrollRef: RefObject<HTMLElement | null>;
  /** The field's hint; the trip's own says "does it fit my trip?", which means nothing with no trip open. */
  placeholder?: string;
  /** On a phone, a soft fade under the box so the page text does not show through it (a listing sheet's long body); the trip panel's own phone box has none. */
  fade?: boolean;
}) {
  const { chat: messages, input, setInput, sending, ask, verdictMsg, retryLast } = chat;
  const reduce = useReducedMotion();
  const shown = messages.filter((m) => m !== verdictMsg && !(m.role === "user" && m.content === COMPARE_VERDICT_PROMPT));
  const [open, setOpen] = useState(true);
  const [focused, setFocused] = useState(false);
  // The card is pulled down by its handle (only the handle: dragging the answers themselves would fight their scrolling). A press that moved is not a tap.
  const drag = useDragControls();
  const pulled = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useScrollCompact({ target: scrollRef, topZone: 80 });
  // Folded only while the reader is just reading: never while they type, wait for an answer or have the box focused.
  const compact = scrolled && !focused && !input.trim() && !sending;
  // A new question opens the card again; whatever arrives brings the newest of it into view.
  const asked = shown.filter((m) => m.role === "user").length;
  const questions = asked;
  useEffect(() => { if (asked > 0) setOpen(true); }, [asked]);
  const last = shown[shown.length - 1];
  useEffect(() => {
    const el = scroller.current;
    if (el && open) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [shown.length, last?.content, open, reduce]);

  return (
    <div ref={boxRef} className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-surface from-60% to-transparent px-3 pt-8 pb-3 max-lg:px-4 max-lg:pb-[max(0.5rem,env(safe-area-inset-bottom))] ${fade ? "max-lg:pt-10" : "max-lg:bg-none max-lg:pt-0"}`}>
    <div className="pointer-events-auto flex flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {shown.length > 0 && !compact && (
          <motion.section
            key="answers"
            aria-label="Answers"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            drag={open ? "y" : false}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            dragSnapToOrigin
            onDragEnd={(_, info) => {
              pulled.current = Math.abs(info.offset.y) > 6;
              if (info.offset.y > 64 || info.velocity.y > 500) setOpen(false);
            }}
            className="relative flex shrink-0 flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-lift"
          >
            {/* One quiet control on the card: a grab handle that folds the answers away (tap it, or pull it down), and, folded, a slim row that brings them back. There is no Clear: a new listing starts a fresh chat.
                Both faces sit in one box that eases between their heights, so folding and unfolding is one movement, not a swap. */}
            <motion.div initial={false} animate={{ height: open ? 32 : 48 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} className="relative shrink-0 overflow-hidden">
              <button
                type="button"
                onPointerDown={(e) => { pulled.current = false; drag.start(e); }}
                onClick={() => { if (!pulled.current) setOpen(false); pulled.current = false; }}
                aria-expanded
                aria-label="Hide the answers"
                aria-hidden={!open}
                tabIndex={open ? 0 : -1}
                className={`group absolute inset-0 grid cursor-grab touch-none place-items-center transition-opacity duration-200 active:cursor-grabbing ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
              >
                <span aria-hidden className="h-1 w-9 rounded-full bg-border transition-[background-color,width] duration-200 group-hover:w-11 group-hover:bg-muted-foreground/50" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-expanded={false}
                aria-label="Show the answers"
                aria-hidden={open}
                tabIndex={open ? -1 : 0}
                className={`absolute inset-0 flex items-center justify-between gap-2 px-4 text-sm font-medium text-ink-soft transition-[opacity,color] duration-200 hover:text-foreground ${open ? "pointer-events-none opacity-0" : "opacity-100"}`}
              >
                <span>{questions === 1 ? "1 question" : `${questions} questions`}</span>
                <ChevronUp className="size-4" aria-hidden />
              </button>
            </motion.div>
            <AnimatePresence initial={false}>
            {open && (
              <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
              <div ref={scroller} className="max-h-[min(38dvh,21rem)] space-y-3.5 overflow-y-auto overscroll-contain scrollbar-slim px-4 pb-4 pt-3 [mask-image:linear-gradient(to_bottom,transparent,#000_0.75rem,#000_calc(100%-0.75rem),transparent)]">
                {shown.map((m, i) => {
                  if (m.role === "user") {
                    return (
                      <motion.div key={i} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="flex justify-end">
                        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-sm leading-snug">{m.content}</p>
                      </motion.div>
                    );
                  }
                  const loading = sending && i === shown.length - 1;
                  return (
                    <motion.div key={i} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
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
                    </motion.div>
                  );
                })}
              </div>
              </motion.div>
            )}
            </AnimatePresence>
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
                placeholder={placeholder ?? (isCompare ? "Ask about these — value, location, what to pick…" : "Ask about this — does it fit my trip?")}
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
