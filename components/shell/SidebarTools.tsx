"use client";

import Link from "next/link";
import { House } from "lucide-react";
import { RoamMark } from "@/features/roam/ui/RoamMark";
import { NavRow, SIDEBAR_MOTION } from "@/components/shell/NavRow";
import { cn } from "@/lib/utils";

/** Under the nav: back to all trips, and a way back into the conversation from any other page. */
export function SidebarTools({ tripId, pathname, collapsed, onNavigate }: { tripId: string; pathname: string; collapsed: boolean; onNavigate?: () => void }) {
  return (

    <div role="group" aria-label="Trip tools" className="space-y-1">
      <NavRow
        href="/trips"
        label="All trips"
        icon={House}
        active={false}
        collapsed={collapsed && !onNavigate}
        onNavigate={onNavigate}
      />
      {/* Already in the conversation (or on the overview, whose hero carries the same button): this would repeat or point at itself. */}
      {!pathname.endsWith("/chat") && pathname.replace(/\/$/, "") !== `/trips/${tripId}` && (
        <Link
          href={`/trips/${tripId}/chat`}
          onClick={onNavigate}
          title="Continue planning"
          className="btn-primary mt-3 flex w-full px-2"
        >
          <RoamMark state="settled" size={28} className="shrink-0" />
          <span className={cn("overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity]", SIDEBAR_MOTION, collapsed && !onNavigate ? "ml-0 max-w-0 opacity-0" : "ml-2.5 max-w-[12rem] opacity-100")}>
            Continue planning
          </span>
        </Link>
      )}
    </div>
  );
}
