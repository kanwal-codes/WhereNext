"use client";

import { FormEvent, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Eye, EyeOff, Info, Loader2, MailCheck } from "lucide-react";
import { Field, inputClass } from "@/components/AuthShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { GUEST_TURN_LIMIT } from "@/lib/guest-limits";
import { resetPassword, signIn, signInWithGoogle } from "@/features/identity/application/authClient";
import { describeAuthError, type SaveFailure } from "@/features/identity/application/saveErrors";
import { GoogleIcon } from "@/features/identity/ui/GoogleAuthButton";
import { cn } from "@/lib/utils";

type Step = "email" | "create" | "signin" | "confirm" | "reset" | "done" | "ended";
type Busy = "google" | "submit" | "resend" | "reset" | null;

const RESEND_WAIT_S = 30;
const MIN_PASSWORD = 8;

/**
 * Turns a guest into a person with an account, and keeps their trip. Three roads, one card:
 *  - a new email: the guest user is upgraded in place (same id, so the trip is already theirs);
 *  - an email that already has an account, or Google: the person signs in for real and the server
 *    moves the guest's trip to that account (see lib/server/guest-claim.ts), because the guest user
 *    cannot become someone who already exists;
 *  - anything that goes wrong lands on a plain sentence and a next step, never a raw provider error.
 */
export function GuestSavePrompt({ tripId, exhausted, heading, body }: { tripId: string; exhausted: boolean; heading?: string; body?: string }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<"email_change" | "signup">("email_change");
  const [wait, setWait] = useState(0);
  const chat = `/trips/${tripId}/chat`;
  const callback = () => `${location.origin}/auth-callback?next=${encodeURIComponent(chat)}`;

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  const go = (next: Step, opts: { keepEmail?: boolean; notice?: string } = {}) => {
    setStep(next);
    setFailure(null);
    setNotice(opts.notice ?? "");
    setPassword("");
    setReveal(false);
    if (!opts.keepEmail && next === "email") setEmail("");
  };

  /** Asks the server to remember this guest, so the trip can follow them into an account that already exists. */
  const leaveTicket = async () => {
    try {
      return (await fetch("/api/guest/claim-ticket", { method: "POST" })).ok;
    } catch {
      return false;
    }
  };
  const cannotMove: SaveFailure = { kind: "network", message: "Couldn’t get your trip ready to move. Check your connection and try again." };

  async function withGoogle() {
    setBusy("google");
    setFailure(null);
    if (!(await leaveTicket())) return fail(cannotMove);
    const { error } = await signInWithGoogle(callback());
    if (error) fail({ kind: "other", message: "Google sign-in isn’t available right now. Use your email instead." });
    // On success the browser is already on its way to Google.
  }

  const fail = (f: SaveFailure) => {
    setFailure(f);
    setBusy(null);
  };

  /** A new email: upgrade this guest in place. */
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy("submit");
    setFailure(null);
    const { data, error } = await createSupabaseBrowserClient().auth.updateUser({ email: email.trim(), password }, { emailRedirectTo: callback() });
    if (error) {
      const f = describeAuthError(error);
      if (f.kind === "exists") {
        setBusy(null);
        return go("signin", { keepEmail: true, notice: "That email already has an account." });
      }
      if (f.kind === "session") {
        setBusy(null);
        return go("ended");
      }
      return fail(f);
    }
    setBusy(null);
    // With email confirmation off the upgrade is immediate; otherwise the address waits for its link.
    if (data.user?.is_anonymous === false) return finish(() => location.reload());
    setPending("email_change");
    setWait(RESEND_WAIT_S);
    go("confirm", { keepEmail: true });
  }

  /** An email that already has an account: sign in, then bring the trip over. */
  async function signInAndClaim(event: FormEvent) {
    event.preventDefault();
    setBusy("submit");
    setFailure(null);
    if (!(await leaveTicket())) return fail(cannotMove);
    const { error } = await signIn(email.trim(), password);
    if (error) {
      const f = describeAuthError(error);
      return fail(f); // an unconfirmed account gets a "send a new link" action under the form
    }
    let tripIds: string[] = [];
    try {
      const res = await fetch("/api/guest/claim", { method: "POST" });
      if (res.ok) tripIds = ((await res.json()) as { tripIds?: string[] }).tripIds ?? [];
    } catch {
      /* signed in either way; the trip list is the fallback */
    }
    setBusy(null);
    finish(() => location.assign(tripIds[0] ? `/trips/${tripIds[0]}/chat` : "/trips"));
  }

  async function forgot() {
    if (!email.trim()) return fail({ kind: "bad-email", message: "Enter your email first, and we’ll send the link there." });
    setBusy("reset");
    setFailure(null);
    await leaveTicket(); // best effort: if it works the trip follows them through the reset link
    const { error } = await resetPassword(email.trim(), `${location.origin}/auth-callback?next=/reset-password/update`);
    if (error) return fail(describeAuthError(error));
    setBusy(null);
    go("reset", { keepEmail: true });
  }

  /** Sends the link again; true when it went. */
  async function resend(type = pending) {
    setBusy("resend");
    setFailure(null);
    const { error } = await createSupabaseBrowserClient().auth.resend({ type, email: email.trim(), options: { emailRedirectTo: callback() } });
    if (error) return fail(describeAuthError(error)), false;
    setBusy(null);
    setWait(RESEND_WAIT_S);
    return true;
  }

  /** A beat of "you're in" before the page moves on. */
  function finish(navigate: () => void) {
    setStep("done");
    window.setTimeout(navigate, reduce ? 200 : 1100);
  }

  const locked = Boolean(busy);
  const alert = failure && (
    <p role="alert" className="flex items-start gap-2 text-sm leading-snug text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {failure.message}
    </p>
  );
  const copy = stepCopy(step, { email, exhausted, heading, body, pending });

  return (
    <motion.div
      layout={!reduce}
      role="region"
      aria-label="Save your trip"
      transition={{ layout: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
      className="relative isolate overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-coral-soft/80 via-card to-card p-6 shadow-lift sm:p-7"
    >
      <div className="flex min-h-5 items-center justify-between">
        <p className="eyebrow text-coral-ink">Save your trip</p>
        {(step === "create" || step === "signin" || step === "confirm" || step === "reset") && (
          <button type="button" onClick={() => go(step === "reset" ? "signin" : "email", { keepEmail: true })} disabled={locked} className="-mr-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
            <ArrowLeft className="size-3.5" aria-hidden /> Back
          </button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {(step === "confirm" || step === "reset" || step === "done" || step === "ended") && (
            <span className={cn("mt-4 grid size-11 place-items-center rounded-full", step === "done" ? "bg-positive-soft text-positive" : "bg-coral-soft text-coral")} aria-hidden>
              {step === "done" ? <Check className="size-5" /> : step === "ended" ? <Info className="size-5" /> : <MailCheck className="size-5" />}
            </span>
          )}
          <h3 className="mt-2.5 text-balance font-display text-2xl leading-tight font-medium tracking-[-0.02em]">{copy.heading}</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft" role={step === "email" ? undefined : "status"}>{copy.body}</p>

          {notice && !failure && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-coral-soft px-3.5 py-3 text-sm leading-snug text-coral-ink" role="status">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {notice}
            </p>
          )}

          {step === "email" && (
            <>
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {["Free", "No card", "Your trip comes with you"].map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-positive" aria-hidden /> {t}</li>
                ))}
              </ul>
              <div className="mt-5">
                <GoogleButton busy={busy === "google"} disabled={locked} onClick={() => void withGoogle()} />
                {alert && <div className="mt-3">{alert}</div>}
              </div>
              <Or />
              <form onSubmit={(e) => { e.preventDefault(); go("create", { keepEmail: true }); }} className="space-y-3.5">
                <Field label="Email">
                  <input type="email" required autoFocus autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
                </Field>
                <button type="submit" disabled={locked} className="btn-primary w-full py-3!">
                  Continue <ArrowRight className="size-4" aria-hidden />
                </button>
              </form>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button type="button" onClick={() => go("signin", { keepEmail: true })} className="link-underline font-medium text-foreground">Sign in</button>
              </p>
            </>
          )}

          {step === "create" && (
            <form onSubmit={create} className="mt-5 space-y-3.5">
              <PasswordField label="Password" value={password} onChange={setPassword} reveal={reveal} onReveal={setReveal} autoComplete="new-password" placeholder="Choose a password" minLength={MIN_PASSWORD} />
              <p className={cn("flex items-center gap-1.5 text-xs transition-colors", password.length >= MIN_PASSWORD ? "text-positive" : "text-muted-foreground")}>
                <Check className="size-3.5" aria-hidden /> At least {MIN_PASSWORD} characters
              </p>
              {alert}
              <button type="submit" disabled={locked} className="btn-primary w-full py-3!">
                {busy === "submit" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Create account and save trip
              </button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button type="button" onClick={() => go("signin", { keepEmail: true })} className="link-underline font-medium text-foreground">Sign in</button>
              </p>
            </form>
          )}

          {step === "signin" && (
            <>
              <form onSubmit={signInAndClaim} className="mt-5 space-y-3.5">
                <Field label="Email">
                  <input type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
                </Field>
                <PasswordField
                  label="Password"
                  hint={<button type="button" onClick={() => void forgot()} disabled={locked} className="link-underline text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">{busy === "reset" ? "Sending…" : "Forgot password?"}</button>}
                  value={password}
                  onChange={setPassword}
                  reveal={reveal}
                  onReveal={setReveal}
                  autoComplete="current-password"
                  placeholder="Your password"
                  autoFocus={Boolean(email)}
                />
                {alert}
                {failure?.kind === "unconfirmed" && <ResendLink onClick={() => void resend("signup").then((sent) => { if (sent) { setPending("signup"); go("confirm", { keepEmail: true }); } })} />}
                <button type="submit" disabled={locked} className="btn-primary w-full py-3!">
                  {busy === "submit" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Sign in and bring my trip
                </button>
              </form>
              <Or />
              <GoogleButton busy={busy === "google"} disabled={locked} onClick={() => void withGoogle()} />
              <p className="mt-4 text-center text-sm text-muted-foreground">
                New here?{" "}
                <button type="button" onClick={() => go("email", { keepEmail: true })} className="link-underline font-medium text-foreground">Create an account</button>
              </p>
            </>
          )}

          {step === "confirm" && (
            <div className="mt-5 space-y-3">
              {alert}
              <button type="button" onClick={() => void resend()} disabled={locked || wait > 0} className="btn-secondary w-full py-3!">
                {busy === "resend" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {wait > 0 ? `Resend email in ${wait}s` : "Resend email"}
              </button>
              <p className="text-center text-sm text-muted-foreground">
                Wrong address?{" "}
                <button type="button" onClick={() => go("email")} className="link-underline font-medium text-foreground">Use a different email</button>
              </p>
            </div>
          )}

          {step === "reset" && (
            <div className="mt-5">
              <button type="button" onClick={() => go("signin", { keepEmail: true })} className="btn-secondary w-full py-3!">Back to sign in</button>
            </div>
          )}

          {step === "ended" && (
            <div className="mt-5">
              <Link href="/" className="btn-primary w-full py-3!">Start a new trip</Link>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

function stepCopy(step: Step, c: { email: string; exhausted: boolean; heading?: string; body?: string; pending: "email_change" | "signup" }): { heading: string; body: ReactNode } {
  const who = <strong className="font-medium text-foreground">{c.email}</strong>;
  switch (step) {
    case "create":
      return { heading: "Choose a password.", body: <>For {who}. You’ll use it to sign in next time.</> };
    case "signin":
      return { heading: "Welcome back.", body: "Sign in and this trip, plus everything you’ve told Roam, comes with you." };
    case "confirm":
      return {
        heading: "Check your email.",
        body: c.pending === "signup"
          ? <>That account still needs confirming. We sent a fresh link to {who}. Open it on this device and we’ll bring this trip over.</>
          : <>We sent a link to {who}. Open it on this device and your trip is saved to your new account.</>,
      };
    case "reset":
      return { heading: "Check your email.", body: <>We sent a reset link to {who}. Open it on this device, choose a new password, and this trip comes with you.</> };
    case "done":
      return { heading: "You’re in.", body: "Your trip is saved. Taking you back to it…" };
    case "ended":
      return { heading: "This guest chat has ended.", body: "Guest chats only last a visit, so there’s nothing left to save. Start a new trip and begin again." };
    default:
      return {
        heading: c.heading ?? (c.exhausted ? "Keep planning with Roam." : "Keep this trip."),
        body: c.body ?? (c.exhausted ? `You’ve used your ${GUEST_TURN_LIMIT} free messages. A free account keeps this trip and everything you’ve told Roam.` : "A free account keeps this trip and everything you’ve told Roam, so you can pick it up anywhere."),
      };
  }
}

function GoogleButton({ busy, disabled, onClick }: { busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="btn-secondary w-full py-3!">
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <GoogleIcon className="size-4" />} Continue with Google
    </button>
  );
}

function Or() {
  return (
    <div className="my-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3" aria-hidden>
      <span className="h-px bg-border" />
      <span className="text-2xs tracking-[0.14em] text-muted-foreground uppercase">or</span>
      <span className="h-px bg-border" />
    </div>
  );
}

function ResendLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="link-underline text-sm font-medium text-foreground">
      Send me a new confirmation email
    </button>
  );
}

/** A password field with a show/hide toggle. The label sits outside the toggle so the input's name stays "Password". */
function PasswordField({ label, hint, value, onChange, reveal, onReveal, autoComplete, placeholder, minLength, autoFocus = true }: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  reveal: boolean;
  onReveal: (v: boolean) => void;
  autoComplete: string;
  placeholder: string;
  minLength?: number;
  autoFocus?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs font-medium tracking-[0.1em] text-ink-soft uppercase">{label}</label>
        {hint}
      </div>
      <div className="relative mt-2">
        <input
          id={id}
          ref={ref}
          type={reveal ? "text" : "password"}
          required
          autoFocus={autoFocus}
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(inputClass, "pr-12")}
        />
        <button
          type="button"
          aria-label={reveal ? "Hide password" : "Show password"}
          aria-pressed={reveal}
          onClick={() => {
            onReveal(!reveal);
            ref.current?.focus();
          }}
          className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
