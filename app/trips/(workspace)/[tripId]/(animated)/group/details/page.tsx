"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, CalendarRange, ChevronDown, LogOut, Mail, Users } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { Reveal, Sheet, motionTokens } from "@/components/motion-primitives";
import { AvailabilityPanel } from "@/features/availability/ui/AvailabilityPanel";
import { InviteToGroup } from "@/features/group-chat/ui/InviteToGroup";
import { notifyToast } from "@/lib/application/toast";
import { useDocumentTitle } from "@/lib/use-document-title";
import { memberInitials } from "@/lib/member-initials";
import { cn } from "@/lib/utils";

type Member = { userId: string; joinedAt: string; email: string | null; isYou: boolean };

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
  const [inviteOpen, setInviteOpen] = useState(false);

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

  // Anyone can leave; nobody manages anyone else's place in the group here — see
  // InviteToGroup/the trip_invites RLS for the matching backend change.
  async function leaveGroup(userId: string) {
    setBusyUserId(userId);
    try {
      const response = await fetch(`/api/trips/${tripId}/members/${userId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await extractError(response, "Couldn’t leave the trip."));
      await refresh();
      notifyToast("You left the trip.", "success");
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : "Couldn’t leave the trip.", "error");
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
        <div className="mt-3 mb-5 flex items-center justify-between gap-3">
          <h1 className="font-display text-3xl leading-tight font-medium tracking-[-0.03em] sm:text-4xl">Group details</h1>
          <button type="button" onClick={() => setAvailabilityOpen(true)} className="btn-chip shrink-0 gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" /> Set your dates
          </button>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mb-5 rounded-2xl border border-border bg-card shadow-soft">
          <button
            type="button"
            onClick={() => setInviteOpen((v) => !v)}
            aria-expanded={inviteOpen}
            className="flex w-full items-center gap-3 p-5 text-left"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-coral/15" aria-hidden="true">
              <Mail className="h-4 w-4 text-coral" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-base">Invite people</span>
              <span className="block text-sm text-muted-foreground">Send a link that adds someone straight into this trip</span>
            </span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", inviteOpen && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {inviteOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={motionTokens.fast}
                className="overflow-hidden"
              >
                <div className="border-t border-border px-5 pb-5 pt-4">
                  <InviteToGroup tripId={tripId} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Reveal>

      {!loaded ? (
        <div aria-hidden className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 skeleton rounded-2xl" />
          ))}
        </div>
      ) : (
        <Reveal delay={0.08}>
          <p className="mb-2 flex items-center gap-1.5 px-1 text-2xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
            <Users className="h-3 w-3" aria-hidden="true" /> {members.length} member{members.length === 1 ? "" : "s"}
          </p>
          <ul className="space-y-2">
            {members.map((m) => {
              const name = m.isYou ? "You" : (m.email?.split("@")[0] ?? "Someone");
              const busy = busyUserId === m.userId;
              return (
                <li key={m.userId} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{memberInitials(name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-2xs text-muted-foreground">{m.email ?? "—"}</p>
                  </div>
                  {m.isYou && (
                    <button
                      type="button"
                      onClick={() => void leaveGroup(m.userId)}
                      disabled={busy}
                      aria-label="Leave trip"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Reveal>
      )}

      <Sheet open={availabilityOpen} onClose={() => setAvailabilityOpen(false)} ariaLabel="Trip dates" side="bottom" className="max-h-[85vh]">
        <AvailabilityPanel tripId={tripId} />
      </Sheet>
    </div>
  );
}
