"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { signOut as signOutUser } from "@/features/identity/application/authClient";
import { ProfilePanel } from "@/features/profile/ui/ProfilePanel";

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
    if (!response.ok) {
      setError("Account could not be deleted.");
      setDeleting(false);
      return;
    }
    location.assign("/sign-in");
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-14">
      <Link href="/trips" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Trips
      </Link>
      <p className="eyebrow mt-6">Account</p>
      <h1 className="mt-2 font-display text-3xl leading-tight">Manage your account</h1>

      <ProfilePanel />

      <div className="mt-8 space-y-3">
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-accent"
        >
          Sign out
        </button>
        <button
          type="button"
          onClick={() => void deleteAccount()}
          disabled={deleting}
          className="w-full rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete account and all trips"}
        </button>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}
