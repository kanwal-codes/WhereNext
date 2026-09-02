"use client";

import { FormEvent, useState } from "react";
import { resetPassword } from "@/features/identity/application/authClient";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    const result = await resetPassword(email, `${location.origin}/auth-callback?next=/reset-password/update`);
    if (result.error) setError(result.error.message);
    else setMessage("If an account exists for that email, a recovery link is on its way.");
  }

  return <main><div className="card"><p>Next Place to Be</p><h1>Reset your password.</h1><form onSubmit={submit}><label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button type="submit">Send recovery link</button></form>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}<a href="/sign-in">Back to sign in</a></div></main>;
}
