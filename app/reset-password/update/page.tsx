"use client";

import { FormEvent, useState } from "react";
import { updatePassword } from "@/features/identity/application/authClient";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    const result = await updatePassword(password);
    if (result.error) setError(result.error.message);
    else { setMessage("Password updated. You can continue planning."); setPassword(""); setConfirmation(""); }
  }

  return <main><div className="card"><p>Next Place to Be</p><h1>Choose a new password.</h1><form onSubmit={submit}><label>New password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm password<input required minLength={8} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button type="submit">Update password</button></form>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}<a href="/sign-in">Back to sign in</a></div></main>;
}
