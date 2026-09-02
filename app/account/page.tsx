"use client";

import { useState } from "react";
import { signOut as signOutUser } from "@/features/identity/application/authClient";

export default function AccountPage() {
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function signOut() {
    await signOutUser();
    location.assign("/sign-in");
  }

  async function deleteAccount() {
    if (!window.confirm("Delete your account and all of its trips? This cannot be undone.")) return;
    setDeleting(true);
    const response = await fetch("/api/account", { method: "DELETE" });
    if (!response.ok) { setError("Account could not be deleted."); setDeleting(false); return; }
    location.assign("/sign-in");
  }

  return <main><div className="card"><p>Account</p><h1>Manage your account</h1><button type="button" onClick={() => void signOut()}>Sign out</button><button type="button" onClick={() => void deleteAccount()} disabled={deleting}>{deleting ? "Deleting…" : "Delete account"}</button>{error && <p role="alert">{error}</p>}</div></main>;
}
