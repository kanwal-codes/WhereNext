"use client";
import { FormEvent, useEffect, useState } from "react";
import { signIn, signUp } from "@/features/identity/application/authClient";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => { const errorMessage = new URLSearchParams(window.location.search).get("error"); if (errorMessage) setError(errorMessage); }, []);
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); setMessage(""); const result = mode === "sign-in" ? await signIn(email, password) : await signUp(email, password, `${location.origin}/auth-callback`); if (result.error) { setError(result.error.message); return; } if (mode === "sign-up" && !result.data.session) { setMessage("Account created. Check your email to confirm your account, then sign in."); return; } location.assign("/trips"); }
  return <main><div className="card"><p>Next Place to Be</p><h1>{mode === "sign-in" ? "Welcome back." : "Start planning."}</h1><form onSubmit={submit}><label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Password<input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label><button type="submit">{mode === "sign-in" ? "Sign in" : "Create account"}</button></form>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}{mode === "sign-in" && <a href="/reset-password">Forgot password?</a>}<a href={mode === "sign-in" ? "/sign-up" : "/sign-in"}>{mode === "sign-in" ? "Create an account" : "Sign in"}</a></div></main>;
}
