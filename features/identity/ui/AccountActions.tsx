"use client";

import { useState } from "react";
import { LogOut, Trash2 } from "lucide-react";
import { signOut as signOutUser } from "@/features/identity/application/authClient";

/** Sign-out + the irreversible delete-everything action, kept visually and functionally apart. */
export function AccountActions() {
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await signOutUser();
    location.assign("/sign-in");
  }

  async function deleteAccount() {
    if (!window.confirm("Delete your account and all of its trips? This cannot be undone.")) return;
    setDeleting(true);
    const response = await fetch("/api/account", { method: "DELETE" });
    if (!response.ok) {
      setError("Account could not be deleted.");
      setDeleting(false);
      return;
    }
    location.assign("/sign-in");
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={signingOut}
        className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
      >
        Sign out
        <LogOut className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-destructive">Danger zone</p>
        <p className="mt-1 text-xs text-muted-foreground">Deletes your account and every trip you own. Trips you were only invited to are unaffected. This cannot be undone.</p>
        <button
          type="button"
          onClick={() => void deleteAccount()}
          disabled={deleting}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-destructive/40 px-3.5 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {deleting ? "Deleting…" : "Delete account and all trips"}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
