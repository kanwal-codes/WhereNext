"use client";

import { useRef, useState } from "react";
import { Loader2, Mic, Sparkles } from "lucide-react";
import { useSpeechInput } from "@/lib/use-speech-input";
import type { AiSearchDirective, AiSearchScope } from "@/lib/application/ai-search";
import { cn } from "@/lib/utils";

/**
 * Natural-language search. Sends the sentence to `/api/trips/:id/ai-search`, which
 * returns a typed directive; the parent applies it to its own filter state. Shows
 * the model's one-line interpretation so the user can see what it understood.
 */
export function AiSearchBar({
  tripId,
  scope,
  placeholder,
  onDirective,
}: {
  tripId: string;
  scope: AiSearchScope;
  placeholder: string;
  onDirective: (directive: AiSearchDirective, raw: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = useRef("");
  const abort = useRef<AbortController | null>(null);

  const speech = useSpeechInput({
    onStart: () => { base.current = text.trim() ? `${text.trim()} ` : ""; },
    onResult: (t) => setText(base.current + t),
    onError: (m) => setError(m),
  });

  async function run() {
    const query = text.trim();
    if (!query || busy) return;
    if (speech.listening) speech.stop();
    abort.current?.abort();
    const req = new AbortController();
    abort.current = req;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/ai-search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, query }),
        signal: req.signal,
      });
      const body = await res.json();
      if (!res.ok) {
        setError("Something went wrong with that search. Try rephrasing it.");
        return;
      }
      const directive = (body.directive ?? {}) as AiSearchDirective;
      const actionable = Object.keys(directive).some((k) => k !== "interpretation");
      setNote(directive.interpretation ?? (actionable ? null : "Couldn’t pin that down — searching for it as typed."));
      onDirective(directive, query);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError("Something went wrong with that search. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => { e.preventDefault(); void run(); }}
        className="flex items-center gap-2 rounded-2xl border border-input bg-card px-3 py-2 shadow-soft focus-within:ring-2 focus-within:ring-ring/25"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-coral" />
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
      {(note || error) && (
        <p className={cn("mt-2 flex items-start gap-1.5 text-xs", error ? "text-destructive" : "text-muted-foreground")}>
          {!error && <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-coral" />}
          {error ?? note}
        </p>
      )}
    </div>
  );
}
