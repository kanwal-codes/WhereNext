"use client";

import { useState } from "react";
import { signInWithGoogle } from "@/features/identity/application/authClient";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.85 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.67-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.67 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

/** "Continue with Google" — redirects to Supabase's Google OAuth, which returns to /auth-callback.
 *  `redirectTo` is an internal path (e.g. a pending `/join/[token]`) `/auth-callback` sends the
 *  browser on to once the OAuth exchange finishes — otherwise it defaults to `/trips`, silently
 *  dropping whatever deep link brought the user to sign in/up in the first place. */
export function GoogleAuthButton({ label = "Continue with Google", redirectTo }: { label?: string; redirectTo?: string }) {
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    const callback = `${location.origin}/auth-callback${redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : ""}`;
    const { error } = await signInWithGoogle(callback);
    if (error) {
      setLoading(false); // on success the browser is already navigating away
      window.location.assign(`/sign-in?error=${encodeURIComponent(error.message)}`);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void go()}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-input bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
    >
      <GoogleIcon className="h-4 w-4" />
      {loading ? "Redirecting…" : label}
    </button>
  );
}
