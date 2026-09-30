"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { useTurnstile } from "@/components/landing/useTurnstile";
import { useTypingPlaceholder } from "@/components/landing/useTypingPlaceholder";

const EXAMPLES = [
  "A long weekend in Montreal with three friends, into live music and good food",
  "Solo week in Kyoto in April: quiet temples, great ramen",
  "Somewhere warm in November, under $1,500, direct from Toronto",
  "A 5-day anniversary trip to Rome",
] as const;

const STARTERS = [
  { label: "A long weekend in Montreal", prompt: "A long weekend in Montreal with friends: live music, good food, nothing touristy." },
  { label: "Solo week in Kyoto", prompt: "A solo week in Kyoto in April. Quiet temples, great food, easy to get around." },
  { label: "Inspire me where to go", prompt: "Inspire me: where should I go in October for great food and a bit of adventure?" },
] as const;

/**
 * The "just start talking" entry point on the first screen. Submitting
 * creates a real draft trip (under a guest session — see /api/guest/start) and opens the normal
 * trip chat with this sentence already sent; saving the trip later just upgrades the same user.
 */
export function TripPromptBox() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; signUp: boolean } | null>(null);
  const attemptRef = useRef(crypto.randomUUID());
  const { container: turnstile, getToken } = useTurnstile();
  const typed = useTypingPlaceholder(EXAMPLES, !prompt && !focused);

  async function start(event?: FormEvent) {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const captchaToken = await getToken();
      const response = await fetch("/api/guest/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text, captchaToken, idempotencyKey: attemptRef.current }),
      });
      const body = (await response.json().catch(() => ({}))) as { tripId?: string; error?: string; code?: string };
      if (!response.ok || !body.tripId) {
        setProblem({
          message: body.error ?? "We couldn't start that just now. Try again in a moment.",
          signUp: body.code === "guest_unavailable" || body.code === "guest_busy",
        });
        setBusy(false);
        return;
      }
      // The trip chat picks this up and sends it as the opening message.
      window.sessionStorage.setItem(`wn:first-message:${body.tripId}`, text);
      window.location.assign(`/trips/${body.tripId}/chat`);
    } catch {
      setProblem({ message: "We couldn't reach Roam. Check your connection and try again.", signUp: false });
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <form
        onSubmit={start}
        className="w-full rounded-[2rem] border border-border bg-surface p-4 shadow-lift transition-shadow focus-within:ring-2 focus-within:ring-coral/30"
      >
        <textarea
          ref={textareaRef}
          aria-label="Describe the trip you want"
          rows={3}
          maxLength={600}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
              event.preventDefault();
              void start();
            }
          }}
          placeholder={!prompt && !focused ? typed : "Tell Roam about your trip…"}
          className="block min-h-[7rem] [@media(max-height:760px)]:min-h-[5rem] w-full resize-none bg-transparent px-3 pt-2 text-left text-base leading-relaxed md:text-lg outline-none placeholder:text-muted-foreground/70"
        />
        <div className="mt-1 flex items-center justify-end gap-3 px-2 pb-1">
          <button type="submit" disabled={!prompt.trim() || busy} className="btn-primary shrink-0 disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Start planning
            {!busy && <ArrowRight className="size-4" />}
          </button>
        </div>
      </form>
      <div ref={turnstile} />

      <div className="mt-5 [@media(max-height:760px)]:mt-3 flex flex-wrap justify-center gap-2">
        {STARTERS.map((starter) => (
          <button
            key={starter.label}
            type="button"
            onClick={() => {
              setPrompt(starter.prompt);
              textareaRef.current?.focus();
            }}
            className="rounded-full border border-border bg-surface/80 px-4 py-2 text-sm font-medium shadow-soft transition-[background-color,transform] hover:-translate-y-px hover:bg-surface active:translate-y-0"
          >
            {starter.label}
          </button>
        ))}
      </div>

      {problem && (
        <p role="alert" className="mt-5 text-center text-sm text-destructive">
          {problem.message}{" "}
          {problem.signUp && (
            <Link href="/sign-up?redirect=%2Ftrips%2Fnew" className="link-underline font-medium text-foreground">
              Sign up to start planning
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
