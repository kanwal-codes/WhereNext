"use client";

import { useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
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
  /** "plain" drops the bordered-card chrome for nesting inside another card (e.g. next to a manual search form). */
  variant?: "card" | "plain";
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
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
