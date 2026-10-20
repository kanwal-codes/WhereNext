"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, MailCheck } from "lucide-react";
import { AuthShell, Field, SubmitButton, inputClass } from "@/components/AuthShell";
import { resetPassword } from "@/features/identity/application/authClient";
import { authErrorText } from "@/features/identity/application/saveErrors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const reduceMotion = useReducedMotion();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const result = await resetPassword(email, `${location.origin}/auth-callback?next=/reset-password/update`);
    setLoading(false);
    if (result.error) setError(authErrorText(result.error));
    else setSent(true);
  }

  return (
    <AuthShell
      eyebrow="Reset password"
      title="We’ll send you a way back in."
      subtitle="Enter the email on your account and we’ll send a single-use reset link."
      footer={
        <Link href="/sign-in" className="link-underline inline-flex items-center gap-1.5 text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {sent ? (
          <motion.div
            key="sent"
            initial={reduceMotion ? false : { opacity: 0, y: 12, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-border bg-card p-6 shadow-soft"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-coral-soft text-coral">
              <MailCheck className="h-5 w-5" />
            </span>
            <h2 className="mt-4 font-display text-xl">Check your inbox</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              If an account exists for <span className="text-foreground">{email || "that address"}</span>, a reset link is on
              its way.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="link-underline mt-4 text-xs text-muted-foreground hover:text-foreground"
            >
              Use a different email
            </button>
          </motion.div>
        ) : (
          <motion.form key="form" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={reduceMotion ? { duration: 0 } : undefined} className="space-y-5" onSubmit={submit}>
            <Field label="Email">
              <input type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
            </Field>
            {error && <p role="alert" className="rounded-xl bg-secondary px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
            <SubmitButton loading={loading} type="submit">
              Send reset link {loading ? null : <ArrowRight className="h-4 w-4" />}
            </SubmitButton>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthShell>
  );
}
