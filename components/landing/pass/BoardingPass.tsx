"use client";

import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { GUEST_LIVE_KEY } from "@/features/identity/application/guestSession";
import { useTurnstile } from "@/components/landing/useTurnstile";
import { useTypingPlaceholder } from "@/components/landing/useTypingPlaceholder";
import {
  Field,
  FIELD_EMPTY,
  FIELD_LABELS,
  PassBody,
} from "@/components/landing/pass/PassShell";
import { guessHomeCode, HOME_CODE } from "@/lib/landing/airports";
import { useServerHomeAirport } from "@/components/landing/pass/HomeAirport";
import { readTrip } from "@/lib/landing/readTrip";
import { useMediaQuery } from "@/lib/use-media-query";

// One line each: the box never wraps its example, so these are written to fit it (a phone's is the narrow one).
const EXAMPLES = [
  "Four of us, Montreal, Oct 16–19, $900 each",
  "Solo week in Kyoto, quiet temples, ramen",
  "Somewhere warm in November, under $1,500",
  "Four days in Lisbon, mostly on foot",
] as const;
const EXAMPLES_COMPACT = [
  "Montreal, Oct 16–19, $900",
  "Solo week in Kyoto, April",
  "Warm in Nov, $1,500 max",
  "Four days in Lisbon",
] as const;

/** What the visitor is told when starting a trip fails. Copy is chosen here from the error code, so
 *  the tone stays calm and points at a next step instead of echoing a server message. */
type Problem = { title: string; body: string; account: boolean };
const PROBLEMS = {
  busy: {
    title: "You’ve been planning a lot today",
    body: "Create a free account to keep going. Everything you plan is saved.",
    account: true,
  },
  unavailable: {
    title: "We couldn’t start that just now",
    body: "Please try again in a moment, or create a free account to start planning right away.",
    account: true,
  },
  offline: {
    title: "We couldn’t connect",
    body: "Check your connection and try again.",
    account: false,
  },
  other: {
    title: "We couldn’t start that just now",
    body: "Please try again in a moment.",
    account: false,
  },
} as const satisfies Record<string, Problem>;

const TAGS = [
  {
    label: "Long weekend in Montreal",
    prompt:
      "A long weekend in Montreal with friends: live music, good food, nothing touristy.",
  },
  {
    label: "Solo week in Kyoto",
    prompt:
      "A solo week in Kyoto in April. Quiet temples, great food, easy to get around.",
  },
  {
    label: "Inspire me",
    prompt:
      "Inspire me: where should I go in October for great food and a bit of adventure?",
  },
] as const;

const TEAR_MS = 620;

/**
 * The first screen's prompt: a boarding pass made out to the visitor. The TO field is the real
 * prompt box. Submitting creates a real draft trip (under a guest session, see /api/guest/start)
 * and opens the normal trip chat with this sentence already sent; saving the trip later just
 * upgrades the same user. While it is empty it writes example trips by itself, and the four fields
 * under it read whatever is in the box (the example, then the visitor's own words).
 *
 * `finale` is the same pass on the last screen, packed in the travel wallet: the same box, writing
 * its own examples (the scene above it asks "Where next?"), the stub stays attached, and it is
 * stamped CHECKED IN only once it is sent.
 */
export function BoardingPass({ finale = false }: { finale?: boolean }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState("");
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [tearing, setTearing] = useState(false);
  const [shake, setShake] = useState(false);
  const [pulse, setPulse] = useState(false);
  const serverHome = useServerHomeAirport();
  const [home, setHome] = useState(serverHome ?? HOME_CODE);
  const [announce, setAnnounce] = useState("");
  const attemptRef = useRef(crypto.randomUUID());
  const { container: turnstile, getToken } = useTurnstile();
  const router = useRouter();
  const compact = useMediaQuery("(max-width: 819px)");
  const typed = useTypingPlaceholder(
    compact ? EXAMPLES_COMPACT : EXAMPLES,
    !prompt && !focused,
    finale ? 600 : 1500,
  );

  // The server's answer (the nearest airport to where the request came from) wins; the time zone is the fallback.
  useEffect(() => setHome(serverHome ?? guessHomeCode()), [serverHome]);

  // The pass reads the box: the visitor's words once there are any, the example while it types itself.
  const reading = readTrip(prompt || (focused ? "" : typed));
  const values = [reading.people, reading.dates, reading.budget, reading.style];

  // One line until there is more to say; then it grows (to three lines) instead of scrolling.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const style = getComputedStyle(el);
    const line =
      parseFloat(style.lineHeight) || 1.35 * parseFloat(style.fontSize);
    el.style.height = `${Math.min(el.scrollHeight, 3 * line)}px`;
  }, [prompt]);

  // The field's type size follows the window (vw), so a height measured at one size is wrong at the next.
  useEffect(() => {
    const refit = () => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      const style = getComputedStyle(el);
      const line =
        parseFloat(style.lineHeight) || 1.35 * parseFloat(style.fontSize);
      el.style.height = `${Math.min(el.scrollHeight, 3 * line)}px`;
    };
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, []);

  // What a screen reader hears: once, a moment after typing pauses, what the pass picked up.
  useEffect(() => {
    if (!prompt) return setAnnounce("");
    const id = window.setTimeout(() => {
      const picked = [
        reading.people,
        reading.dates,
        reading.budget,
        reading.style,
      ].filter(Boolean);
      setAnnounce(picked.length ? `Picked up: ${picked.join(", ")}` : "");
    }, 700);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  const moveShine: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.pointerType !== "mouse" || !shineRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    shineRef.current.style.setProperty(
      "--mx",
      `${event.clientX - rect.left}px`,
    );
    shineRef.current.style.setProperty("--my", `${event.clientY - rect.top}px`);
  };

  const flash = (set: (v: boolean) => void, ms: number) => {
    set(true);
    window.setTimeout(() => set(false), ms);
  };

  async function start(event?: FormEvent) {
    event?.preventDefault();
    const text = prompt.trim();
    if (busy) return;
    if (!text) {
      // Nothing to send yet: take the visitor to the field instead of scolding them.
      textareaRef.current?.focus();
      flash(setPulse, 700);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const captchaToken = await getToken();
      const response = await fetch("/api/guest/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          captchaToken,
          idempotencyKey: attemptRef.current,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        tripId?: string;
        error?: string;
        code?: string;
      };
      if (!response.ok || !body.tripId) {
        setProblem(
          body.code === "guest_busy" || body.code === "guest_limit"
            ? PROBLEMS.busy
            : body.code === "guest_unavailable"
              ? PROBLEMS.unavailable
              : PROBLEMS.other,
        );
        flash(setShake, 360);
        setBusy(false);
        return;
      }
      // The trip chat picks this up and sends it as the opening message.
      window.sessionStorage.setItem(`wn:first-message:${body.tripId}`, text);
      // Lets the chat page tell this hand-off from a reload or a return visit (a guest chat is disposable).
      window.sessionStorage.setItem(GUEST_LIVE_KEY, body.tripId);
      // The stub tears off along the perforation on the way in to the chat.
      // A client-side navigation: the page stays up while the chat route loads, instead of a blank document load.
      const go = () => router.push(`/trips/${body.tripId}/chat`);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setTearing(true);
        window.setTimeout(go, TEAR_MS);
      } else go();
    } catch {
      setProblem(PROBLEMS.offline);
      flash(setShake, 360);
      setBusy(false);
    }
  }

  const label = busy ? "Boarding…" : "Plan it";

  return (
    <div className="bp-area">
      <div className={shake ? "bp-wrap bp-shake" : "bp-wrap"}>
        <form
          onSubmit={start}
          className={`bp${finale ? " bp-calm" : ""}${tearing ? " bp-tear" : ""}`}
          aria-label={finale ? "Start your trip" : "Plan a trip"}
        >
          <PassBody
            code={home}
            shineRef={shineRef}
            onPointerMove={moveShine}
            to={
              <div
                className={`bp-to${pulse ? " bp-pulse" : ""}`}
              >
                <b aria-hidden="true">Where next?</b>
                <textarea
                  ref={textareaRef}
                  id={finale ? "trip-prompt-end" : "trip-prompt"}
                  aria-label={
                    finale
                      ? "Where do you want to go next?"
                      : "Describe the trip you want"
                  }
                  rows={1}
                  maxLength={600}
                  value={prompt}
                  className={!prompt ? "bp-placeholder-single-line" : undefined}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    if (problem) setProblem(null);
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing &&
                      event.nativeEvent.keyCode !== 229
                    ) {
                      event.preventDefault();
                      void start();
                    }
                  }}
                  placeholder={
                    !prompt && !focused ? typed : "Tell Roam about your trip…"
                  }
                />
                <button
                  type="submit"
                  aria-label="Start planning"
                  className="bp-go-inline hit-44"
                  tabIndex={-1}
                >
                  {busy ? (
                    <Loader2 className="size-5 animate-spin" aria-hidden />
                  ) : (
                    <ArrowRight className="size-5" aria-hidden />
                  )}
                </button>
              </div>
            }
            stamp={
              finale ? (
                <span className="bp-stamp bp-stamp-late" aria-hidden="true">
                  Checked in
                </span>
              ) : undefined
            }
            fields={FIELD_LABELS.map((name, i) => (
              <Field
                key={name}
                label={name}
                value={values[i]}
                empty={FIELD_EMPTY[i]}
              />
            ))}
            stub={
              <button
                type="submit"
                aria-label="Start planning"
                className="bp-go hit-44"
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                ) : null}
                <span>{label}</span>
                {!busy && <ArrowRight className="size-[18px]" aria-hidden />}
              </button>
            }
          />
        </form>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      <div ref={turnstile} />

      {!finale && (
        <div
          className="bp-tags bp-in"
          style={{ "--d": "1500ms" } as React.CSSProperties}
        >
          <span className="bp-tags-lab">Or start from</span>
          {TAGS.map((tag) => (
            <button
              key={tag.label}
              type="button"
              onClick={() => {
                setPrompt(tag.prompt);
                textareaRef.current?.focus();
              }}
              className="bp-tag hit-44"
            >
              {tag.label}
            </button>
          ))}
        </div>
      )}
      {/* In the page's own layer, not under the pass: on the last screen the pass sits in the wallet's pocket and on a phone the stub pushes this off screen, so an error there is never seen. */}
      {problem &&
        createPortal(
          <div role="alert" className="bp-alert bp-toast">
            <div>
              <p className="font-display text-base">{problem.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                {problem.body}
              </p>
            </div>
            {problem.account && (
              <div className="flex shrink-0 items-center gap-4">
                <Link
                  href="/sign-up?redirect=%2Ftrips%2Fnew"
                  className="btn-primary"
                >
                  Create a free account
                </Link>
                <Link
                  href="/sign-in"
                  className="link-underline text-sm font-medium text-foreground"
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
