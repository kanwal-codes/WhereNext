"use client";

import { useRef, useState } from "react";
import { Loader2, Mic, Search } from "lucide-react";
import { MicButton, SendButton } from "@/components/ComposerButtons";
import { useAutoGrowTextarea } from "@/lib/use-autogrow-textarea";
import { useScrollCompact } from "@/lib/use-scroll-compact";
import { useSpeechInput } from "@/lib/use-speech-input";
import type { AiSearchDirective, AiSearchScope } from "@/lib/application/ai-search";
import { notifyToast } from "@/lib/application/toast";
import { cn } from "@/lib/utils";

/**
 * Natural-language search. Sends the sentence to `/api/trips/:id/ai-search`, which
 * returns a typed directive; the parent applies it to its own filter state.
 */
export function AiSearchBar({
  tripId,
  scope,
  placeholder,
  onDirective,
  className,
  variant = "card",
}: {
  tripId: string;
  scope: AiSearchScope;
  placeholder: string;
  onDirective: (directive: AiSearchDirective, raw: string) => void;
  className?: string;
  /** "plain" is Roam's message box (the same field, mic and send, growing as you type) for nesting inside another card, next to a manual search form. "dock" floats at the bottom of the page: full width at rest, a small "Ask" pill while the reader scrolls down, full again on the way back up. */
  variant?: "card" | "plain" | "dock";
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const isMultiline = useAutoGrowTextarea(area, text);
  const dock = variant === "dock";
  const [scrolled, setScrolled] = useScrollCompact({ enabled: dock });
  const base = useRef("");
  const abort = useRef<AbortController | null>(null);

  const speech = useSpeechInput({
    onStart: () => { base.current = text.trim() ? `${text.trim()} ` : ""; },
    onResult: (t) => setText(base.current + t),
    onError: (m) => notifyToast(m, "error"),
  });

  async function run() {
    const query = text.trim();
    if (!query || busy) return;
    if (speech.listening) speech.stop();
    abort.current?.abort();
    const req = new AbortController();
    abort.current = req;
    setBusy(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/ai-search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, query }),
        signal: req.signal,
      });
      const body = await res.json();
      if (!res.ok) {
        notifyToast("Something went wrong with that search — try rephrasing it.", "error");
        return;
      }
      const directive = (body.directive ?? {}) as AiSearchDirective;
      onDirective(directive, query);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) notifyToast("Something went wrong with that search — try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  const compactNow = dock && scrolled && !focused && !text.trim() && !busy && !speech.listening;

  if (dock) {
    // Small while the reader heads down the page, unless they are using it (focused, typing, listening, waiting on an answer).
    const compact = compactNow;
    return (
      <div className={cn("ask-dock", className)}>
        <form
          onSubmit={(e) => { e.preventDefault(); void run(); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          data-compact={compact || undefined}
          className="ask-dock-form"
        >
          <div className="ask-dock-full" inert={compact}>
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={speech.listening ? "Listening…" : placeholder}
              aria-label="Ask for what you want"
              className="min-w-0 flex-1 bg-transparent py-2 text-body outline-none placeholder:text-muted-foreground"
            />
            {speech.supported && (
              <button
                type="button"
                onClick={speech.toggle}
                aria-label={speech.listening ? "Stop dictation" : "Dictate"}
                aria-pressed={speech.listening}
                className={cn("grid size-9 max-lg:size-11 shrink-0 place-items-center rounded-full transition-colors", speech.listening ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:bg-accent hover:text-foreground", !speech.listening && "max-lg:bg-muted max-lg:text-ink-soft")}
              >
                <Mic className={cn("size-4", speech.listening && "animate-pulse")} />
              </button>
            )}
            <button type="submit" disabled={busy || !text.trim()} className={cn("btn-primary-sm h-10 shrink-0 rounded-full px-5", !text.trim() && !busy && "max-lg:hidden")}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Ask"}
            </button>
          </div>
          <button
            type="button"
            className="ask-dock-mini"
            tabIndex={compact ? 0 : -1}
            aria-hidden={!compact}
            aria-label="Ask for what you want"
            // Focusing the pill (a press does, before the click lands) opens it; the input is inert until that has rendered, so it takes focus a frame later.
            onFocus={() => requestAnimationFrame(() => input.current?.focus())}
            onClick={() => { setScrolled(false); requestAnimationFrame(() => input.current?.focus()); }}
          >
            <Search className="size-4" aria-hidden />
            Ask
          </button>
        </form>
      </div>
    );
  }

  if (variant === "plain") {
    const canSend = Boolean(text.trim());
    const mic = speech.supported && <MicButton listening={speech.listening} disabled={busy} onToggle={speech.toggle} hasText={canSend} />;
    const send = <SendButton canSend={canSend} stopping={busy} onStop={() => abort.current?.abort()} stopLabel="Stop searching" micShown={speech.supported} />;
    // The same box as the Roam composer (features/conversation/ui/RoamComposer.tsx): buttons over a one-line field, in their own row once it wraps.
    return (
      <div className={className}>
        <form
          onSubmit={(e) => { e.preventDefault(); void run(); }}
          className={cn(
            "flex w-full min-w-0 max-w-full flex-col gap-1 rounded-3xl border border-input bg-card py-1.5 pr-1.5 pl-4 shadow-lift transition-[border-color,box-shadow] duration-200 ease-out",
            "max-lg:pl-5 focus-within:border-ink/30 focus-within:shadow-halo",
            "max-lg:border-transparent max-lg:bg-muted max-lg:shadow-none max-lg:focus-within:border-transparent max-lg:focus-within:shadow-none",
            busy && "composer-live",
          )}
        >
          <div className="relative w-full">
            <textarea
              ref={area}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // A phone's Return makes a new line and the arrow sends; with a keyboard it sends. Not the Enter that confirms an IME candidate.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229 && !window.matchMedia("(pointer: coarse)").matches) {
                  e.preventDefault();
                  void run();
                }
              }}
              placeholder={speech.listening ? "Listening…" : placeholder}
              aria-label="Ask for what you want"
              className="block max-h-[96px] w-full resize-none overflow-y-auto scrollbar-slim bg-transparent py-2 pr-24 text-base leading-normal outline-none transition-[height] duration-150 ease-out placeholder:text-muted-foreground"
            />
            {!isMultiline && (
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1">
                {mic}
                {send}
              </div>
            )}
          </div>
          {isMultiline && (
            <div className="flex items-center justify-end gap-1">
              {mic}
              {send}
            </div>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className={className}>
      <form
        onSubmit={(e) => { e.preventDefault(); void run(); }}
        className="flex items-center gap-2 rounded-2xl border border-input bg-card px-3 py-2 shadow-soft focus-within:ring-2 focus-within:ring-ring/25"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={speech.listening ? "Listening…" : placeholder}
          aria-label="Ask for what you want"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        {speech.supported && (
          <button
            type="button"
            onClick={speech.toggle}
            aria-label={speech.listening ? "Stop dictation" : "Dictate"}
            aria-pressed={speech.listening}
            className={cn(
              "grid size-7 max-lg:h-10 max-lg:w-10 shrink-0 place-items-center rounded-full border transition-colors",
              speech.listening ? "border-transparent bg-muted text-destructive" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Mic className={cn("size-3.5", speech.listening && "animate-pulse")} />
          </button>
        )}
        <button type="submit" disabled={busy || !text.trim()} className="btn-primary-sm shrink-0">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Ask"}
        </button>
      </form>
    </div>
  );
}
