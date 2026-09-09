"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarRange, Crown, LogOut, Trash2 } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { Reveal, Sheet } from "@/components/motion-primitives";
import { AvailabilityPanel } from "@/features/availability/ui/AvailabilityPanel";
import { notifyToast } from "@/lib/application/toast";
import { useDocumentTitle } from "@/lib/use-document-title";

type Role = "owner" | "editor" | "viewer";
type Member = { userId: string; role: Role; joinedAt: string; email: string | null; isYou: boolean };

const ROLES: Role[] = ["owner", "editor", "viewer"];

function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[1][0]).toUpperCase();
}

async function extractError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : fallback;
}

export default function GroupDetailsPage() {
  const { tripId } = useTripData();
  const titleTag = useDocumentTitle("Group details");
  const [members, setMembers] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  const refresh = useCallback(() => {
    return fetch(`/api/trips/${tripId}/members`)
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((body) => setMembers(body.members ?? []))
      .catch(() => notifyToast("Couldn’t load the group.", "error"))
      .finally(() => setLoaded(true));
  }, [tripId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const me = members.find((m) => m.isYou);
  const iAmOwner = me?.role === "owner";

  async function changeRole(userId: string, role: Role) {
    setBusyUserId(userId);
    try {
      const response = await fetch(`/api/trips/${tripId}/members/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) throw new Error(await extractError(response, "Couldn’t change that role."));
      await refresh();
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : "Couldn’t change that role.", "error");
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeMember(userId: string, isSelf: boolean) {
    setBusyUserId(userId);
    try {
      const response = await fetch(`/api/trips/${tripId}/members/${userId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await extractError(response, "Couldn’t remove that person."));
      await refresh();
      notifyToast(isSelf ? "You left the trip." : "Removed from the trip.", "success");
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : "Couldn’t remove that person.", "error");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6 lg:py-5">
      {titleTag}
      <Reveal>
        <Link href={`/trips/${tripId}/group`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to group chat
        </Link>
        <div className="mt-3 mb-4 flex items-center justify-between gap-3">
          <h1 className="font-display text-lg leading-tight lg:text-xl">Group details</h1>
          <button type="button" onClick={() => setAvailabilityOpen(true)} className="btn-chip shrink-0 gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" /> Set your dates
          </button>
        </div>
      </Reveal>

      {!loaded ? (
        <div aria-hidden className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {members.map((m) => {
            const name = m.isYou ? "You" : (m.email?.split("@")[0] ?? "Someone");
            const canManage = iAmOwner && !m.isYou;
            const busy = busyUserId === m.userId;
            return (
              <li key={m.userId} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-medium">
                    {name}
                    {m.role === "owner" && <Crown className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Owner" />}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{m.email ?? "—"}</p>
                </div>
                {canManage ? (
                  <select
                    value={m.role}
                    disabled={busy}
                    onChange={(event) => void changeRole(m.userId, event.target.value as Role)}
                    className="input-field h-8 shrink-0 py-0 pr-6 text-xs capitalize disabled:opacity-50"
                    aria-label={`Role for ${name}`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] text-muted-foreground uppercase">{m.role}</span>
                )}
                {(canManage || m.isYou) && (
                  <button
                    type="button"
                    onClick={() => void removeMember(m.userId, m.isYou)}
                    disabled={busy}
                    aria-label={m.isYou ? "Leave trip" : "Remove from trip"}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                  >
                    {m.isYou ? <LogOut className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={availabilityOpen} onClose={() => setAvailabilityOpen(false)} ariaLabel="Trip dates" side="bottom" className="max-h-[85vh]">
        <AvailabilityPanel tripId={tripId} />
      </Sheet>
    </div>
  );
}
