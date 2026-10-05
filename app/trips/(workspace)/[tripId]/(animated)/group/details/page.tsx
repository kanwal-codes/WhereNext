"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarRange, ChevronDown, LogOut, Mail, Users } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { Reveal, Sheet, motionTokens } from "@/components/motion-primitives";
import { AvailabilityPanel } from "@/features/availability/ui/AvailabilityPanel";
import { InviteToGroup } from "@/features/group-chat/ui/InviteToGroup";
import { notifyToast } from "@/lib/application/toast";
import { PageHeader } from "@/components/PageHeader";
import { memberInitials } from "@/lib/member-initials";
import { memberTint } from "@/lib/member-tint";
import { memberLabel } from "@/lib/client/use-trip-members";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Member = { userId: string; role?: string; joinedAt: string; email: string | null; name?: string | null; isYou: boolean };

async function extractError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : fallback;
}

export default function GroupDetailsPage() {
  const { tripId } = useTripData();
  const router = useRouter();
  const [confirmLeave, setConfirmLeave] = useState(false);
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
      notifyToast("You left the trip.", "success");
      // You are no longer a member, so there is nothing left to show here.
      router.push("/trips");
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : "Couldn’t leave the trip.", "error");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-5 pb-10 sm:px-8">
      <PageHeader
        eyebrow="Group details"
        title="Group details"
        back={{ href: `/trips/${tripId}/group`, label: "Back to group chat" }}
        action={
          <button type="button" onClick={() => setAvailabilityOpen(true)} className="btn-chip shrink-0 gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" /> Set your dates
          </button>
        }
      />
      <div className="mt-6" />

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
              const label = memberLabel(m);
              const name = m.isYou ? "You" : label;
              const busy = busyUserId === m.userId;
              return (
                <li key={m.userId} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
                  <span aria-hidden style={memberTint(label)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold">{memberInitials(label)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{name}</span>
                      {m.role === "owner" && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-ink-soft">Owner</span>}
                    </p>
                    <p className="truncate text-2xs text-muted-foreground">{m.email ?? "No email"}</p>
                  </div>
                  {m.isYou && (confirmLeave ? (
                    // Leaving cannot be taken back, so it asks once: the same "Leave? / Stay" beat the bookings use for removal.
                    <span className="flex shrink-0 items-center gap-1.5 text-xs">
                      <button type="button" onClick={() => void leaveGroup(m.userId)} disabled={busy} className="h-8 rounded-full bg-destructive px-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40">{busy ? "Leaving…" : "Leave"}</button>
                      <button type="button" onClick={() => setConfirmLeave(false)} disabled={busy} className="h-8 rounded-full border border-border px-3 font-medium text-muted-foreground transition-colors hover:text-foreground">Stay</button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmLeave(true)}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <LogOut className="h-3.5 w-3.5" aria-hidden /> Leave
                    </button>
                  ))}
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
