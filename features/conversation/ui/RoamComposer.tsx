"use client";

import { FormEvent, useRef, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown } from "lucide-react";
import { MicButton, SendButton } from "@/components/ComposerButtons";
import { motionTokens } from "@/components/motion-primitives";
import { useAutoGrowTextarea } from "@/lib/use-autogrow-textarea";
import type { useSpeechInput } from "@/lib/use-speech-input";
import { textAction } from "./blocks/ui";
import { RAIL_MEASURE } from "./rail";
import { cn } from "@/lib/utils";

/** The box at the foot of the thread: the "Latest" pill, a queued next message, and the message field with mic and send (or stop while Roam answers). */
export function RoamComposer({ tripId, rail, input, setInput, loaded, guestGate, sending, speech, stop, submit, queued, setQueued, away, scrollToLatestMessage, textareaRef }: {
  tripId: string;
  rail: boolean;
  input: string;
  setInput: (value: string) => void;
  loaded: boolean;
  guestGate: boolean;
  sending: boolean;
  speech: ReturnType<typeof useSpeechInput>;
  stop: () => void;
  submit: (text: string) => Promise<unknown> | void;
  queued: string | null;
  setQueued: (value: string | null) => void;
  /** Scrolled far from the newest message: offer the way back. */
  away: boolean;
  scrollToLatestMessage: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  // The single-line width the buttons leave (both only while dictating with text), pinned on a hidden mirror: the box goes multi-line when the text no longer fits THERE,
  // and once it has, the real field takes the whole width (the buttons are in their own row), as in Gemini's. Decided from a width that never changes, so it cannot flip back and forth.
  const mirrorRef = useRef<HTMLDivElement>(null);
  const isMultiline = useAutoGrowTextarea(textareaRef, input, undefined, mirrorRef);
  const canSend = loaded && Boolean(input.trim());
  const micButton = speech.supported && <MicButton listening={speech.listening} disabled={!loaded || sending} onToggle={speech.toggle} hasText={canSend} />;
  const sendOrStopButton = <SendButton canSend={canSend} stopping={sending} onStop={stop} micShown={speech.supported} />;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background from-55% to-transparent px-3 pt-8 pb-3 max-lg:bg-none max-lg:px-0 max-lg:pt-0 max-lg:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className={cn("pointer-events-auto relative mx-auto w-full min-w-0", rail ? RAIL_MEASURE : "max-w-2xl")}>
        <AnimatePresence>
          {away && (
            <motion.button
              key="latest"
              type="button"
              onClick={scrollToLatestMessage}
              aria-label="Jump to latest message"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={motionTokens.swap}
              whileTap={{ scale: 0.97 }}
              className="absolute inset-x-0 bottom-full mx-auto mb-2 flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-ink-soft shadow-lift transition-colors hover:text-ink max-lg:size-10 max-lg:justify-center max-lg:border-0 max-lg:p-0 max-lg:shadow-[0_4px_12px_-6px_rgb(29_26_23/0.18),0_0_0_1px_var(--color-hairline)]"
            >
              <ArrowDown className="size-3.5 max-lg:size-[1.125rem]" aria-hidden />
              <span className="max-lg:sr-only">Latest</span>
            </motion.button>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
        {queued !== null && (
          <motion.div
            key="queued"
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 4, height: 0 }}
            transition={motionTokens.swap}
            className="overflow-hidden"
          >
          <div role="status" className="mb-2 flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-soft">
            <span className="min-w-0 flex-1 truncate">Next: “{queued}” · sends when Roam finishes</span>
            <button type="button" onClick={() => { setInput(queued); setQueued(null); }} className={textAction}>Edit</button>
            <button type="button" onClick={() => setQueued(null)} className={textAction}>Cancel</button>
          </div>
          </motion.div>
        )}
        </AnimatePresence>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void submit(input);
          }}
          className={cn(
            "composer-glass flex w-full min-w-0 max-w-full flex-col gap-1 rounded-3xl border border-input py-1.5 pl-4 pr-1.5 shadow-lift transition-[border-color,box-shadow] duration-200 ease-out",
            "max-lg:pr-1.5 max-lg:pl-5",
            "focus-within:border-ink/30 focus-within:shadow-halo",
            "max-lg:border-transparent max-lg:shadow-none max-lg:focus-within:border-transparent max-lg:focus-within:shadow-none",
            sending && "composer-live",
          )}
        >
          {/* The buttons overlay this box (single line) or sit in their own row below it
              (multiple lines) — see the matching comment on GroupChatSurface's identical
              pattern for why: switching which JSX branch renders the TEXTAREA itself (not just
              the buttons around it) used to tear the DOM node down and rebuild it on every line
              wrap, dropping focus and the cursor mid-keystroke — live-caught as "the box grows
              but I can't type on the new line until I press Enter again," and the padding
              below is reserved unconditionally (not just while the overlay is showing) so the
              text's own wrapping width never changes between the two layouts — letting it
              change was a second bug, where text that wrapped to 2 lines at the narrower width
              could fit back on 1 at the wider one, flipping the layout back, narrowing it
              again, wrapping again — the "gets stuck and won't shrink back down" the box
              never actually settled at. */}
          <div className="relative w-full">
            <div aria-hidden="true" ref={mirrorRef} className={cn("pointer-events-none invisible absolute inset-x-0 top-0 overflow-hidden break-words whitespace-pre-wrap py-2 pr-24 text-base leading-normal", !(speech.listening && canSend) && "max-lg:pr-14")}>
              {input}
              {"\u200b"}
            </div>
            <textarea
              ref={textareaRef}
              id={`${tripId}-roam-composer`}
              aria-label="Message"
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                // isComposing (and the legacy keyCode 229) is true for the Enter that CONFIRMS an
                // IME candidate (Japanese/Chinese/Korean input) — that keystroke must not also submit.
                // On a phone Return makes a new line and the arrow sends, exactly as in the group chat; with a keyboard it sends.
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && !window.matchMedia("(pointer: coarse)").matches) {
                  event.preventDefault();
                  void submit(input);
                }
              }}
              placeholder={!loaded ? "Loading…" : guestGate ? "Save your trip to keep chatting" : speech.listening ? "Listening…" : sending ? "Type your next message…" : "Ask about your trip…"}
              disabled={!loaded || guestGate}
              className={cn(
                "block max-h-[96px] w-full resize-none overflow-y-auto scrollbar-slim bg-transparent py-2 pr-24 text-base leading-normal outline-none transition-[height] duration-150 ease-out placeholder:text-muted-foreground disabled:opacity-60",
                // Beside the buttons only that much is kept clear (on a phone one 44px button stands at the right at a time; both show while dictating). Below them, none.
                isMultiline ? "pr-3 max-lg:pr-3" : speech.listening && canSend ? "max-lg:pr-24" : "max-lg:pr-14",
              )}
            />
            {!isMultiline && (
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1">
                {micButton}
                {sendOrStopButton}
              </div>
            )}
          </div>
          {isMultiline && (
            <div className="flex items-center justify-end gap-1">
              {micButton}
              {sendOrStopButton}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
