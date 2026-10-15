"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Copy, Link2, Share2, UserPlus } from "lucide-react";
import { notifyToast } from "@/lib/application/toast";
import { cn } from "@/lib/utils";

type Link = { url: string; expiresAt: string };

/** The trip's "anyone with the link" invite: the one already minted, else a new one. Same link the people menu shows. */
function useInviteLink(tripId: string) {
  const [link, setLink] = useState<Link | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/trips/${tripId}/invites`);
        if (!res.ok) throw new Error();
        const existing = ((await res.json()).invites ?? []).find((i: { email: string | null }) => !i.email) as { token: string; expiresAt: string } | undefined;
        if (existing) return live && setLink({ url: `${location.origin}/join/${existing.token}`, expiresAt: existing.expiresAt });
        const made = await fetch(`/api/trips/${tripId}/invites`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        if (!made.ok) throw new Error();
        const body = await made.json();
        if (live) setLink({ url: body.url, expiresAt: body.expiresAt });
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [tripId]);
  return { link, failed };
}

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

/**
 * Shown in a group chat nobody else has joined yet: the invite link right there, ready to copy or share, instead of
 * a chat that talks to itself. It disappears on its own once someone joins.
 */
export function GroupInviteCard({ tripId, tripName }: { tripId: string; tripName?: string }) {
  const { link, failed } = useInviteLink(tripId);
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      notifyToast("Couldn’t copy. Select the link and copy it by hand.", "error");
    }
  }
  async function share() {
    if (!link) return;
    try {
      await navigator.share({ title: tripName ? `Join ${tripName} on Where Next` : "Join my trip on Where Next", text: "Plan the trip with me.", url: link.url });
    } catch {
      /* closed the share sheet */
    }
  }

  if (failed) return null; // the people menu still has the link; no half-card here

  return (
    <div className="relative mx-auto mt-10 w-full max-w-md overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-coral-soft/70 via-card to-card p-5 text-left shadow-soft">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-coral/10 blur-2xl" />
      <div className="relative flex items-center gap-3">
        {/* You, and the places still waiting for the others. */}
        <span className="flex -space-x-1.5" aria-hidden>
          <span className="relative z-[3] grid size-10 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background ring-2 ring-card">You</span>
          <span className="relative z-[2] grid size-10 place-items-center rounded-full border-2 border-dashed border-border bg-card text-muted-foreground ring-2 ring-card"><UserPlus className="size-4" /></span>
          <span className="relative z-[1] grid size-10 place-items-center rounded-full border-2 border-dashed border-border/70 bg-card text-muted-foreground/70 ring-2 ring-card"><UserPlus className="size-4" /></span>
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-medium leading-tight tracking-[-0.02em]">Just you here so far</p>
          <p className="text-sm text-ink-soft">Send this link and they join the trip, the plan and this chat.</p>
        </div>
      </div>

      <div className="relative mt-4 flex items-center gap-2 rounded-2xl border border-border bg-background/80 p-1.5 pl-3.5 backdrop-blur transition-[border-color,box-shadow] focus-within:border-ink/30 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-ink)_6%,transparent)]">
        <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {link ? (
          <input
            readOnly
            value={link.url.replace(/^https?:\/\//, "")}
            aria-label="Invite link"
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 truncate bg-transparent text-sm tabular-nums text-foreground outline-none"
          />
        ) : (
          <span aria-hidden className="skeleton h-4 flex-1 rounded-md" />
        )}
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!link}
          className={cn(
            "relative inline-flex h-10 shrink-0 items-center gap-1.5 overflow-hidden rounded-xl px-4 text-sm font-medium transition-[background-color,color,transform] active:scale-[0.97] disabled:opacity-50",
            copied ? "bg-positive-soft text-positive" : "bg-primary text-primary-foreground hover:opacity-90",
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={copied ? "done" : "copy"}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.16 }}
              className="inline-flex items-center gap-1.5"
            >
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </motion.span>
          </AnimatePresence>
        </button>
        {canShare && (
          <button type="button" onClick={() => void share()} disabled={!link} aria-label="Share the invite link" className="grid size-10 shrink-0 place-items-center rounded-xl border border-border text-ink-soft transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97] disabled:opacity-50">
            <Share2 className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {link && <p className="relative mt-2.5 text-xs text-muted-foreground">Anyone with it can join. It works for {daysLeft(link.expiresAt)} more days.</p>}
    </div>
  );
}
