"use client";

import { FormEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, Loader2, MapPin } from "lucide-react";
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
  const [washing, setWashing] = useState(false);
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
      // A wave washes over the page on the way in to the chat.
      const go = () => window.location.assign(`/trips/${body.tripId}/chat`);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setWashing(true);
        window.setTimeout(go, 850);
      } else go();
    } catch {
      setProblem(PROBLEMS.offline);
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <div className="relative">
        <FoamEdge />
        <form
          onSubmit={start}
          className="beach-form relative z-10 w-full rounded-[2rem] bg-transparent p-4 transition-shadow"
        >
          <MapPin aria-hidden className="beach-pin hidden" />
          <textarea
            ref={textareaRef}
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
            className="block min-h-[7rem] [@media(max-height:760px)]:min-h-[5rem] w-full resize-none bg-transparent px-3 pt-2 text-left text-base leading-relaxed md:text-lg outline-none placeholder:text-muted-foreground/70"
          />
          <div className="mt-1 flex items-center justify-end gap-3 px-2 pb-1">
            <button type="submit" disabled={!prompt.trim() || busy} className="btn-primary shrink-0 disabled:opacity-80">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Start planning
              {!busy && <ArrowRight className="size-4" />}
            </button>
          </div>
        </form>
      </div>
      {washing && <WaveWash />}
      <div ref={turnstile} />

      {!problem && (
        <div className={`mt-5 [@media(max-height:760px)]:mt-3 flex flex-wrap justify-center gap-2 beach-chips`}>
          {STARTERS.map((starter) => (
            <button
              key={starter.label}
              type="button"
              onClick={() => {
                setPrompt(starter.prompt);
                textareaRef.current?.focus();
              }}
              className="rounded-full border border-white/60 bg-white/55 px-4 py-2 text-sm font-medium shadow-soft backdrop-blur-md transition-[background-color,transform] hover:-translate-y-px hover:bg-white/80 active:translate-y-0 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.12]"
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

// Fixed, rounded values (not random) so the server and the browser draw exactly the same foam.
const rand = (i: number, n: number) => {
  const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const round = (v: number) => Math.round(v);
const BUBBLES = Array.from({ length: 64 }, (_, i) => {
  const size = round(6 + rand(i, 2) * 20);
  return { left: round((1 + (i / 63) * 98 + (rand(i, 1) - 0.5) * 2) * 10) / 10, size, drop: round((0.1 + rand(i, 3) * 0.75) * 100) / 100, delay: round(-rand(i, 4) * 90) / 10, dur: round(70 + rand(i, 5) * 50) / 10 };
});
// Foam spreading out sideways along the waterline, so the box melts into the shore instead of sitting on it.
const SIDE = Array.from({ length: 14 }, (_, i) => {
  const left = i % 2 === 0;
  return { left: left ? round(-1 - rand(i, 6) * 7) : round(101 + rand(i, 6) * 7), top: round(74 + rand(i, 7) * 14), size: round(9 + rand(i, 8) * 14) };
});

/**
 * The box as foam: a white body plus a row of bubbles along its lower edge, run through a "gooey"
 * filter (blur, then a hard alpha cut) so they melt into one lacy shape, like foam where a wave
 * has just reached the sand. The bubbles slowly swell and settle in step with the tide behind.
 */
function FoamEdge() {
  return (
    <div aria-hidden className="landing-foam pointer-events-none absolute inset-0 z-0">
      <svg width="0" height="0" className="absolute">
        <filter id="wn-foam-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
          <feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10" />
        </filter>
      </svg>
      <div className="absolute inset-0" style={{ filter: "drop-shadow(0 26px 34px rgba(24, 70, 100, 0.28))" }}>
        <div className="absolute inset-0" style={{ filter: "url(#wn-foam-goo)" }}>
          <div className="absolute inset-0 rounded-[2rem] bg-white" />
          {BUBBLES.map((b, i) => (
            <span
              key={i}
              className="landing-foam-bubble absolute rounded-full bg-white"
              style={{ left: `${b.left}%`, bottom: `${-b.size * b.drop}px`, width: b.size, height: b.size, marginLeft: -b.size / 2, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }}
            />
          ))}
          {SIDE.map((b, i) => (
            <span key={i} className="landing-foam-bubble absolute rounded-full bg-white" style={{ left: `${b.left}%`, top: `${b.top}%`, width: b.size, height: b.size, marginLeft: -b.size / 2 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A wave that rises from the bottom and covers the page, foam first, just before the chat opens. */
function WaveWash() {
  // In the body, not in the box: an ancestor of the box is animated, which would pin a fixed layer to it.
  return createPortal(
    <div aria-hidden className="landing-wash pointer-events-none fixed inset-0 z-[100]">
      <svg className="absolute inset-x-0 -top-[70px] h-[72px] w-full" viewBox="0 0 1440 72" preserveAspectRatio="none">
        <path d="M0 72 L0 34 C 120 10, 240 50, 380 30 S 640 6, 800 34 S 1100 56, 1250 26 S 1400 14, 1440 30 L1440 72 Z" fill="white" />
      </svg>
      <div className="absolute inset-0 bg-white" />
    </div>,
    document.body,
  );
}
