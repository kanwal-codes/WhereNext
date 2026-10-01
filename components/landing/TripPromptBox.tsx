"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { GUEST_LIVE_KEY } from "@/features/identity/application/guestSession";
import { useTurnstile } from "@/components/landing/useTurnstile";
import { useTypingPlaceholder } from "@/components/landing/useTypingPlaceholder";

const EXAMPLES = [
  "A long weekend in Montreal with three friends, into live music and good food",
  "Solo week in Kyoto in April: quiet temples, great ramen",
  "Somewhere warm in November, under $1,500, direct from Toronto",
  "A 5-day anniversary trip to Rome",
] as const;

/** What the visitor is told when starting a trip fails. Copy is chosen here from the error code, so
 *  the tone stays calm and points at a next step instead of echoing a server message. */
type Problem = { title: string; body: string; account: boolean };
const PROBLEMS = {
  busy: {
    title: "You've been planning a lot today",
    body: "Create a free account to keep going. Everything you plan is saved.",
    account: true,
  },
  unavailable: {
    title: "We couldn't start that just now",
    body: "Please try again in a moment, or create a free account to start planning right away.",
    account: true,
  },
  offline: { title: "We couldn't connect", body: "Check your connection and try again.", account: false },
  other: { title: "We couldn't start that just now", body: "Please try again in a moment.", account: false },
} as const satisfies Record<string, Problem>;

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
  const [problem, setProblem] = useState<Problem | null>(null);
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
        setProblem(
          body.code === "guest_busy" || body.code === "guest_limit"
            ? PROBLEMS.busy
            : body.code === "guest_unavailable"
              ? PROBLEMS.unavailable
              : PROBLEMS.other,
        );
        setBusy(false);
        return;
      }
      // The trip chat picks this up and sends it as the opening message.
      window.sessionStorage.setItem(`wn:first-message:${body.tripId}`, text);
      // Lets the chat page tell this hand-off from a reload or a return visit (a guest chat is disposable).
      window.sessionStorage.setItem(GUEST_LIVE_KEY, body.tripId);
      window.location.assign(`/trips/${body.tripId}/chat`);
    } catch {
      setProblem(PROBLEMS.offline);
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <form
        onSubmit={start}
        className="w-full rounded-[2rem] border border-border bg-surface p-4 shadow-lift transition-shadow focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-coral"
      >
        <textarea
          ref={textareaRef}
          id="trip-prompt"
          aria-label="Describe the trip you want"
          rows={3}
          maxLength={600}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            if (problem) setProblem(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
              event.preventDefault();
              void start();
            }
          }}
          placeholder={!prompt && !focused ? typed : "Tell Roam about your trip…"}
          className="block min-h-[7rem] [@media(max-height:760px)]:min-h-[5rem] w-full resize-none bg-transparent px-3 pt-2 text-left text-base leading-relaxed md:text-lg outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-1 flex items-center justify-end gap-3 px-2 pb-1">
          <button type="submit" disabled={!prompt.trim() || busy} className="btn-primary hit-44 shrink-0 disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Start planning
            {!busy && <ArrowRight className="size-4" />}
          </button>
        </div>
      </form>
      <div ref={turnstile} />

      {!problem && (
        <div className="mt-5 [@media(max-height:760px)]:mt-3 flex flex-wrap justify-center gap-2">
          {STARTERS.map((starter) => (
            <button
              key={starter.label}
              type="button"
              onClick={() => {
                setPrompt(starter.prompt);
                textareaRef.current?.focus();
              }}
              className="hit-44 rounded-full border border-border bg-surface/80 px-4 py-2 text-sm font-medium shadow-soft transition-[background-color,transform] hover:-translate-y-px hover:bg-surface active:translate-y-0"
            >
              {starter.label}
            </button>
          ))}
        </div>
      )}

      {/* Takes the chips' place (not extra height below them): the first screen fades out as soon as
          the page scrolls, so anything pushed below the fold could never be read. */}
      {problem && (
        <div
          role="alert"
          className="mt-5 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface/90 px-5 py-3.5 text-center shadow-soft sm:flex-row sm:justify-between sm:text-left"
        >
          <div>
            <p className="font-display text-base">{problem.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{problem.body}</p>
          </div>
          {problem.account && (
            <div className="flex shrink-0 items-center gap-4">
              <Link href="/sign-up?redirect=%2Ftrips%2Fnew" className="btn-primary">
                Create a free account
              </Link>
              <Link href="/sign-in" className="link-underline text-sm font-medium text-foreground">
                Sign in
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
