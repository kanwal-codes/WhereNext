"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AuthShell, Field, SubmitButton, inputClass } from "@/components/AuthShell";
import { updatePassword } from "@/features/identity/application/authClient";
import { authErrorText } from "@/features/identity/application/saveErrors";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const result = await updatePassword(password);
    setLoading(false);
    if (result.error) setError(authErrorText(result.error));
    else {
      setMessage("Password updated. You can continue planning.");
      setPassword("");
      setConfirmation("");
    }
  }

  return (
    <AuthShell
      eyebrow="Reset password"
      title="Choose a new password."
      subtitle="Set a new password for your account, then head back to your trips."
      footer={
        <Link href="/sign-in" className="link-underline inline-flex items-center gap-1.5 text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      }
    >
      {/* method="post" defense-in-depth fallback — see app/sign-in/page.tsx's identical form for
          the live-caught reason (a password leaking into the URL/server logs via the browser's
          own default GET submission, if a click lands before React hydrates onSubmit below). */}
      <form className="space-y-5" method="post" onSubmit={submit}>
        <Field label="New password">
          <input type="password" name="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Confirm password">
          <input type="password" name="password-confirmation" autoComplete="new-password" required minLength={8} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={inputClass} />
        </Field>
        {error && <p role="alert" className="rounded-xl bg-secondary px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-secondary px-3 py-2 text-xs font-medium text-foreground">{message}</p>}
        <SubmitButton loading={loading} type="submit">
          Update password {loading ? null : <ArrowRight className="h-4 w-4" />}
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
