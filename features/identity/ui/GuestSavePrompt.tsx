"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Info, Loader2, MailCheck } from "lucide-react";
import { Field, inputClass } from "@/components/AuthShell";
import { useGuestSave } from "@/features/identity/application/useGuestSave";
import { GoogleButton, Or, PasswordField, ResendLink, stepCopy } from "@/features/identity/ui/GuestSaveParts";
import { cn } from "@/lib/utils";

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
  const { step, email, setEmail, password, setPassword, reveal, setReveal, busy, failure, notice, pending, wait, go, withGoogle, create, signInAndClaim, forgot, resend, setPending } = useGuestSave({ tripId, reduce: Boolean(reduce) });
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
