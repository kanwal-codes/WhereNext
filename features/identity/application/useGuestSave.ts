import { useEffect, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { resetPassword, signIn, signInWithGoogle } from "@/features/identity/application/authClient";
import { describeAuthError, type SaveFailure } from "@/features/identity/application/saveErrors";

export type SaveStep = "email" | "create" | "signin" | "confirm" | "reset" | "done" | "ended";
export type SaveBusy = "google" | "submit" | "resend" | "reset" | null;

const RESEND_WAIT_S = 30;

/**
 * The roads a guest can take to an account, and where they are on each. `reduce` shortens the beat of "you're in" before the page moves on.
 * Three roads, one card:
 *  - a new email: the guest user is upgraded in place (same id, so the trip is already theirs);
 *  - an email that already has an account, or Google: the person signs in for real and the server
 *    moves the guest's trip to that account (see lib/server/guest-claim.ts), because the guest user
 *    cannot become someone who already exists;
 *  - anything that goes wrong lands on a plain sentence and a next step, never a raw provider error.
 */
export function useGuestSave({ tripId, reduce }: { tripId: string; reduce: boolean }) {
  const [step, setStep] = useState<SaveStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState<SaveBusy>(null);
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

  const go = (next: SaveStep, opts: { keepEmail?: boolean; notice?: string } = {}) => {
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

  return { step, email, setEmail, password, setPassword, reveal, setReveal, busy, failure, notice, pending, wait, go, withGoogle, create, signInAndClaim, forgot, resend, setPending };
}
