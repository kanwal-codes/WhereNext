"use client";

import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { GUEST_TURN_LIMIT } from "@/lib/guest-limits";

/**
 * Turns a guest session into a real account in place. Supabase keeps the same user id, so the
 * trip and the whole conversation are already theirs the moment this succeeds — nothing to move.
 * (Google needs "Enable manual linking" on in the Supabase auth settings.)
 */
export function GuestSavePrompt({ tripId, exhausted, heading, body }: { tripId: string; exhausted: boolean; heading?: string; body?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const callback = () => `${location.origin}/auth-callback?next=${encodeURIComponent(`/trips/${tripId}/chat`)}`;

  async function withGoogle() {
    setBusy("google");
    setError("");
    const { error: failure } = await createSupabaseBrowserClient().auth.linkIdentity({ provider: "google", options: { redirectTo: callback() } });
    if (failure) {
      setError("Google sign-up isn't available right now — use email instead.");
      setBusy(null);
    }
  }

  async function withEmail(event: FormEvent) {
    event.preventDefault();
    setBusy("email");
    setError("");
    const { data, error: failure } = await createSupabaseBrowserClient().auth.updateUser({ email, password }, { emailRedirectTo: callback() });
    if (failure) {
      setError(failure.message);
      setBusy(null);
      return;
    }
    // With email confirmation off the upgrade is immediate; otherwise the address is pending.
    if (data.user?.is_anonymous === false) location.reload();
    else {
      setSent(true);
      setBusy(null);
    }
  }

  return (
    <div role="region" aria-label="Save your trip" className="rounded-2xl border border-border bg-card p-5 shadow-lift">
      <p className="text-[10px] font-semibold tracking-[0.16em] text-coral uppercase">Save your trip</p>
      <h3 className="mt-1.5 font-display text-xl leading-tight">
        {heading ?? (exhausted ? "Keep planning with Roam." : "Keep this trip.")}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {body ??
          (exhausted
            ? `That's your ${GUEST_TURN_LIMIT} free messages. Make a free account and this trip, plus everything we've talked about, comes with you.`
            : "Make a free account and this trip, plus everything we've talked about, is yours to come back to.")}
      </p>

      {sent ? (
        <p role="status" className="mt-4 rounded-xl bg-coral-soft px-4 py-3 text-sm">
          Check your email to confirm. Your trip is saved to this account as soon as you do.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void withGoogle()}
            disabled={Boolean(busy)}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
          >
            {busy === "google" && <Loader2 className="h-4 w-4 animate-spin" />} Continue with Google
          </button>
          <div className="my-3 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={withEmail} className="space-y-2.5">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email"
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/25"
            />
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password, at least 8 characters"
              aria-label="Password"
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/25"
            />
            <button type="submit" disabled={Boolean(busy)} className="btn-primary w-full justify-center">
              {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save my trip"}
            </button>
          </form>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
