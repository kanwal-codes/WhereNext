"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { AuthShell, Divider, Field, SubmitButton, inputClass } from "@/components/AuthShell";
import { GoogleAuthButton } from "@/features/identity/ui/GoogleAuthButton";
import { signIn } from "@/features/identity/application/authClient";
import { safeRedirect } from "@/lib/client/safe-redirect";
import { authErrorText } from "@/features/identity/application/saveErrors";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [redirect, setRedirect] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("error");
    if (fromUrl) setError(fromUrl);
    setRedirect(params.get("redirect"));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn(email, password);
    if (result.error) {
      setError(authErrorText(result.error));
      setLoading(false);
      return;
    }
    location.assign(safeRedirect(redirect, "/trips"));
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Pick up where the plan left off."
      subtitle="Your trips, conversations and saved places are exactly as you left them."
      footer={
        <div className="space-y-2">
          <p>
            New here?{" "}
            <Link href={redirect ? `/sign-up?redirect=${encodeURIComponent(redirect)}` : "/sign-up"} className="link-underline font-medium text-foreground">
              Create an account
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
      <GoogleAuthButton label="Sign in with Google" redirectTo={redirect ?? undefined} />
      <Divider label="or" />

      {/* method="post" is a defense-in-depth fallback, not the real submit path (onSubmit
          preventDefault()s it below): live-caught a race where a click landed before React
          hydrated the handler, and the browser's own default GET submission put the password
          straight into the URL — visible in browser history and this dev server's own access
          log. A plain POST with no matching route handler still fails to sign in, but the
          credentials land in the request body, never the URL, if that race happens again. */}
      <form className="space-y-5" method="post" onSubmit={submit}>
        <Field label="Email">
          <input type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
        </Field>

        <Field
          label="Password"
          hint={
            <Link href="/forgot-password" className="link-underline text-xs text-muted-foreground hover:text-foreground">
              Forgot password?
            </Link>
          }
        >
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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

        {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}

        <SubmitButton loading={loading} type="submit">
          Sign in {loading ? null : <ArrowRight className="h-4 w-4" />}
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
