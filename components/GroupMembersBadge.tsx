"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { memberInitials } from "@/lib/member-initials";
import { useTripMembers } from "@/lib/client/use-trip-members";

/** Group tab's entry into `/group/details` — an avatar stack instead of a bare icon, so who's
 *  already in the trip (and that there's a details/invite screen at all) is visible at a glance. */
export function GroupMembersBadge({ tripId }: { tripId: string }) {
  const { members, loaded } = useTripMembers(tripId);

  const shown = (loaded ? members : []).slice(0, 3);
  const overflow = (loaded ? members.length : 0) - shown.length;

  return (
    <Link
      href={`/trips/${tripId}/group/details`}
      aria-label={loaded && members.length > 0 ? `Group details — ${members.length} member${members.length === 1 ? "" : "s"}` : "Group details"}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/95 pr-3 pl-2 transition-colors hover:bg-accent"
    >
      {shown.length > 0 ? (
        <span className="flex -space-x-2">
          {shown.map((m) => (
            <span
              key={m.userId}
              className="grid size-6 place-items-center rounded-full border border-border bg-secondary text-[9px] font-semibold text-foreground ring-2 ring-background"
            >
              {memberInitials(m.isYou ? "You" : (m.email?.split("@")[0] ?? "?"))}
            </span>
          ))}
          {overflow > 0 && (
            <span className="grid size-6 place-items-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground ring-2 ring-background">
              +{overflow}
            </span>
          )}
        </span>
      ) : (
        <span className="grid size-6 place-items-center">
          <Users className="size-4" />
        </span>
      )}
    </Link>
  );
}
