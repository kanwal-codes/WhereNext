"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock, Loader2, Mail, Send, X } from "lucide-react";
import { notifyToast } from "@/lib/application/toast";

type Invite = { id: string; token: string; email: string | null; expiresAt: string; createdAt: string };

function daysLeft(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "expires today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/** Mint and manage `/join/[token]` invite links. Every link grants full access — a shared trip
 *  has no view-only tier someone joins into, so there's nothing to choose here beyond who (if
 *  anyone) it's addressed to.
 *
 *  The generic "anyone with the link" invite is shown ready-to-copy the instant this opens — auto
 *  created if none exists yet, reused (not re-minted) if one already does — instead of making
 *  the person open the section AND press a separate "create" button before there's anything to
 *  copy. Inviting a specific person by email is a secondary action below it. */
export function InviteToGroup({ tripId }: { tripId: string }) {
  const [genericInvite, setGenericInvite] = useState<{ id?: string; url: string; expiresAt: string } | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [preparingLink, setPreparingLink] = useState(true);
  const [linkError, setLinkError] = useState(false);
  const [copied, setCopied] = useState(false);

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [emailInvites, setEmailInvites] = useState<Invite[]>([]);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const refreshEmailInvites = useCallback((all: Invite[]) => {
    setEmailInvites(all.filter((i) => i.email));
  }, []);

  const loadInvites = useCallback(async () => {
    try {
      const response = await fetch(`/api/trips/${tripId}/invites`);
      if (!response.ok) throw new Error();
      const body = await response.json();
      const invites: Invite[] = body.invites ?? [];
      refreshEmailInvites(invites);
      const existing = invites.find((i) => !i.email);
      if (existing) {
        setGenericInvite({ id: existing.id, url: `${location.origin}/join/${existing.token}`, expiresAt: existing.expiresAt });
        setPreparingLink(false);
        return;
      }
      // No generic link yet — mint one now so there's something to copy the moment this opens.
      const created = await fetch(`/api/trips/${tripId}/invites`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!created.ok) throw new Error();
      const createdBody = await created.json();
      setGenericInvite({ url: createdBody.url, expiresAt: createdBody.expiresAt });
      setPreparingLink(false);
    } catch {
      setLinkError(true);
      setPreparingLink(false);
    }
  }, [tripId, refreshEmailInvites]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  /** Switch the old link off and make a fresh one: for when it went somewhere it should not have. */
  async function renewLink() {
    if (!genericInvite || renewing) return;
    setRenewing(true);
    try {
      if (genericInvite.id) {
        const off = await fetch(`/api/trips/${tripId}/invites/${genericInvite.id}`, { method: "DELETE" });
        if (!off.ok && off.status !== 404) throw new Error();
      }
      const created = await fetch(`/api/trips/${tripId}/invites`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!created.ok) throw new Error();
      const body = await created.json();
      const list = await fetch(`/api/trips/${tripId}/invites`).then((r) => (r.ok ? r.json() : { invites: [] }));
      const fresh = ((list.invites ?? []) as Invite[]).find((i) => !i.email && i.token === body.token);
      setGenericInvite({ id: fresh?.id, url: body.url, expiresAt: body.expiresAt });
      notifyToast("The old link no longer works. This is a new one.", "success");
    } catch {
      notifyToast("Couldn’t make a new link.", "error");
    } finally {
      setRenewing(false);
    }
  }

  async function copyLink() {
    if (!genericInvite) return;
    try {
      await navigator.clipboard.writeText(genericInvite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notifyToast("Copy failed — select the link manually.", "error");
    }
  }

  async function sendEmailInvite() {
    if (!email.trim()) return;
    if (!emailInputRef.current?.checkValidity()) {
      emailInputRef.current?.reportValidity();
      return;
    }
    setSending(true);
    try {
      const response = await fetch(`/api/trips/${tripId}/invites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!response.ok) throw new Error();
      setEmail("");
      const refreshed = await fetch(`/api/trips/${tripId}/invites`).then((r) => (r.ok ? r.json() : { invites: [] }));
      refreshEmailInvites(refreshed.invites ?? []);
      notifyToast("Invite sent.", "success");
    } catch {
      notifyToast("Couldn’t send that invite.", "error");
    } finally {
      setSending(false);
    }
  }

  async function revoke(id: string) {
    setRevokingId(id);
    try {
      const response = await fetch(`/api/trips/${tripId}/invites/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setEmailInvites((current) => current.filter((i) => i.id !== id));
    } catch {
      notifyToast("Couldn’t revoke that invite.", "error");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div>
      {linkError ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-xs text-destructive">Couldn’t create an invite link.</p>
          <button type="button" onClick={() => { setLinkError(false); setPreparingLink(true); void loadInvites(); }} className="shrink-0 text-xs font-medium text-destructive underline">
            Retry
          </button>
        </div>
      ) : preparingLink || !genericInvite ? (
        <div className="h-11 skeleton rounded-xl" aria-hidden="true" />
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring/25">
            <input
              aria-label="Invite link"
              readOnly
              value={genericInvite.url}
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button type="button" onClick={() => void copyLink()} className="btn-primary-sm shrink-0 gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5" /> : "Copy"}
            </button>
          </div>
          <p className="mt-1.5 text-2xs text-muted-foreground">
            Anyone with this link can join the trip, until {new Date(genericInvite.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.{" "}
            <button type="button" onClick={() => void renewLink()} disabled={renewing} className="underline underline-offset-2 hover:text-foreground disabled:opacity-50">
              {renewing ? "Making a new one…" : "Switch it off and make a new link"}
            </button>
          </p>
        </>
      )}

      <div className="mt-4 flex items-center gap-2">
        <input
          ref={emailInputRef}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void sendEmailInvite()}
          placeholder="Or invite someone by email"
          aria-label="Invite by email"
          className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/25"
        />
        <button
          type="button"
          onClick={() => void sendEmailInvite()}
          disabled={sending || !email.trim()}
          aria-label="Send email invite"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>

      {emailInvites.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {emailInvites.map((inv) => (
            <li key={inv.id} className="flex items-center gap-2.5 rounded-xl border border-dashed border-border px-3 py-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{inv.email}</p>
                <p className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" /> {daysLeft(inv.expiresAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void revoke(inv.id)}
                disabled={revokingId === inv.id}
                aria-label={`Revoke invite for ${inv.email}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
              >
                {revokingId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
