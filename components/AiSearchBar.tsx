"use client";

import { useRef, useState } from "react";
import { Loader2, Mic, Search } from "lucide-react";
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
  /** "plain" drops the bordered-card chrome for nesting inside another card (e.g. next to a manual search form). "dock" floats at the bottom of the page: full width at rest, a small "Ask" pill while the reader scrolls down, full again on the way back up. */
  variant?: "card" | "plain" | "dock";
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
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
              className="min-w-0 flex-1 bg-transparent py-2 text-[0.9375rem] outline-none placeholder:text-muted-foreground"
            />
            {speech.supported && (
              <button
                type="button"
                onClick={speech.toggle}
                aria-label={speech.listening ? "Stop dictation" : "Dictate"}
                aria-pressed={speech.listening}
                className={cn("grid size-9 shrink-0 place-items-center rounded-full transition-colors", speech.listening ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
              >
                <Mic className={cn("size-4", speech.listening && "animate-pulse")} />
              </button>
            )}
            <button type="submit" disabled={busy || !text.trim()} className="btn-primary-sm h-10 shrink-0 rounded-full px-5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ask"}
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

  return (
    <div className={className}>
      <form
        onSubmit={(e) => { e.preventDefault(); void run(); }}
        className={cn(
          "flex items-center gap-2",
          variant === "card"
            ? "rounded-2xl border border-input bg-card px-3 py-2 shadow-soft focus-within:ring-2 focus-within:ring-ring/25"
            : "border-b border-border pb-2",
        )}
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
              "grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors",
              speech.listening ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Mic className={cn("h-3.5 w-3.5", speech.listening && "animate-pulse")} />
          </button>
        )}
        <button type="submit" disabled={busy || !text.trim()} className="btn-primary-sm shrink-0">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ask"}
        </button>
      </form>
    </div>
  );
}
