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
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/95 py-1 pr-3 pl-1 transition-colors hover:bg-accent"
    >
      {shown.length > 0 ? (
        <span className="flex -space-x-1.5">
          {shown.map((m) => (
            <span
              key={m.userId}
              className="grid h-5 w-5 place-items-center rounded-full bg-primary/10 text-[8px] font-semibold text-primary ring-2 ring-background"
            >
              {memberInitials(m.isYou ? "You" : (m.email?.split("@")[0] ?? "?"))}
            </span>
          ))}
          {overflow > 0 && (
            <span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[8px] font-semibold text-muted-foreground ring-2 ring-background">
              +{overflow}
            </span>
          )}
        </span>
      ) : (
        <span className="grid h-5 w-5 place-items-center">
          <Users className="h-3.5 w-3.5" />
        </span>
      )}
    </Link>
  );
}
