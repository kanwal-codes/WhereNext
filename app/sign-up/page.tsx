"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import { AuthShell, Divider, Field, SubmitButton, inputClass } from "@/components/AuthShell";
import { GoogleAuthButton } from "@/features/identity/ui/GoogleAuthButton";
import { signUp } from "@/features/identity/application/authClient";
import { safeRedirect } from "@/lib/client/safe-redirect";
import { authErrorText } from "@/features/identity/application/saveErrors";

function strengthOf(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}
const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const score = useMemo(() => strengthOf(pw), [pw]);
  const reduceMotion = useReducedMotion();
  const [redirect, setRedirect] = useState<string | null>(null);

  useEffect(() => {
    setRedirect(new URLSearchParams(window.location.search).get("redirect"));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!agreed) {
      setError("Please accept the Terms and Privacy Policy.");
      return;
    }
    setError("");
    setMessage("");
    setLoading(true);
    // A pending invite (or any other deep link) rides along as `next` on the confirmation-email
    // callback — without this, confirming the email always landed a brand-new user on their own
    // /trips list, having never actually joined whatever they signed up to join.
    const callback = `${location.origin}/auth-callback${redirect ? `?next=${encodeURIComponent(redirect)}` : ""}`;
    const result = await signUp(email, pw, callback);
    if (result.error) {
      setError(authErrorText(result.error));
      setLoading(false);
      return;
    }
    if (!result.data.session) {
      setMessage("Account created. Check your email to confirm your account, then sign in.");
      setLoading(false);
      return;
    }
    // No pending redirect → the normal new-signup path (straight into the conversational
    // starter); a pending one (e.g. a group invite) takes priority over that default.
    location.assign(redirect ? safeRedirect(redirect, "/trips/new") : "/trips/new");
  }

  return (
    <AuthShell
      eyebrow="Create account"
      title="Start a trip by talking about it."
      subtitle="No long forms. Sign up, and the plan starts building from your first message."
      footer={
        <div className="space-y-2">
          <p>
            Already have an account?{" "}
            <Link href={redirect ? `/sign-in?redirect=${encodeURIComponent(redirect)}` : "/sign-in"} className="link-underline font-medium text-foreground">
              Sign in
            </Link>
          </p>
          <p>
            <Link href="/privacy" className="link-underline">Privacy</Link>
            {" · "}
            <Link href="/terms" className="link-underline">Terms</Link>
          </p>
        </div>
      }
    >
      <GoogleAuthButton label="Sign up with Google" redirectTo={redirect ?? undefined} />
      <Divider label="or" />

      {/* method="post" defense-in-depth fallback — see app/sign-in/page.tsx's identical form for
          the live-caught reason (a password leaking into the URL/server logs via the browser's
          own default GET submission, if a click lands before React hydrates onSubmit below). */}
      <form className="space-y-5" method="post" onSubmit={submit}>
        <Field label="Email">
          <input type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
        </Field>

        <Field label="Password">
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="At least 8 characters"
              className={inputClass + " pr-11"}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide characters" : "Show characters"}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <div>
          <div className="grid grid-cols-4 gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <motion.span
                key={i}
                className="h-1 rounded-full bg-border"
                animate={{ backgroundColor: i < score ? "var(--coral)" : "color-mix(in oklab, var(--hairline) 100%, transparent)" }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.3 }}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{labels[score]}</p>
        </div>

        <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <input
            required
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input accent-[var(--coral)]"
          />
          <span>
            I agree to the <span className="text-foreground">Terms</span> and <span className="text-foreground">Privacy Policy</span>.
          </span>
        </label>

        {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
        {message && <p role="status" className="rounded-xl border border-leaf/30 bg-leaf-soft/50 px-3 py-2 text-xs text-leaf">{message}</p>}

        <SubmitButton loading={loading} type="submit">
          Create account {loading ? null : <ArrowRight className="h-4 w-4" />}
        </SubmitButton>
      </form>

      <ul className="mt-6 space-y-2 text-xs text-muted-foreground">
        {["Free while you plan", "Every trip stays private to you", "Nothing to install"].map((t) => (
          <li key={t} className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-coral" /> {t}
          </li>
        ))}
      </ul>
    </AuthShell>
  );
}
