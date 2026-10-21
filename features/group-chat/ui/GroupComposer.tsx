"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ListChecks, Plus } from "lucide-react";
import { MicButton, SendButton } from "@/components/ComposerButtons";
import { useAutoGrowTextarea } from "@/lib/use-autogrow-textarea";
import type { useSpeechInput } from "@/lib/use-speech-input";
import { roamMentionGhost } from "../domain/chat-state";
import { MAX_MESSAGE_LENGTH, completeRoamMention, hasAsk, mentionsRoam } from "../domain/message";
import { cn } from "@/lib/utils";

/** The box at the foot of the thread: the message field (with `@Roam` completion), + menu, mic and send. */
export function GroupComposer({ input, setInput, loaded, submit, speech, onPoll }: {
  input: string;
  setInput: (update: string | ((current: string) => string)) => void;
  loaded: boolean;
  submit: (text: string, retryKey?: string) => Promise<unknown> | void;
  speech: ReturnType<typeof useSpeechInput>;
  /** The + menu's Poll: the surface owns the sheet that starts one. */
  onPoll: () => void;
}) {
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Inline ghost-text autocomplete for "@Roam" — replaces the old suggestion pill. Matches a
  // partial mention token at the very end of the input ("@", "@r", "@ro", ... "@roam", any
  // case) and, while it's a genuine prefix of "roam", offers Tab to complete it.
  const { active: mentionActive, ghost: mentionGhost } = roamMentionGhost(input);

  function insertRoamMention() {
    setInput((current) => current.replace(/@r?o?a?m?$/i, "@Roam "));
  }

  const isMultiline = useAutoGrowTextarea(textareaRef, input, undefined, mirrorRef);

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
            {!mentionsRoam(input) && (
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
  <form
    onSubmit={(event: FormEvent) => {
      event.preventDefault();
      void submit(input);
    }}
    className={cn(
      "flex w-full flex-col gap-1 overflow-hidden rounded-3xl border border-input bg-card p-1.5 shadow-lift transition-[border-color,box-shadow] duration-200 ease-out",
      "focus-within:border-ink/30 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-ink)_6%,transparent),var(--shadow-lift)]",
      "max-lg:border-transparent max-lg:bg-secondary max-lg:shadow-none max-lg:focus-within:border-transparent max-lg:focus-within:shadow-none",
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
                onPoll();
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
  );
}
