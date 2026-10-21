"use client";

import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { TripIdentity, type ShellTrip } from "@/components/shell/TripIdentity";
import { cn } from "@/lib/utils";

/** The sidebar's top: the trip's identity, and (collapsed) just the brand mark that turns into the expand button. */
export function SidebarHeader({ trip, tripId, wide, collapsed, allTripsHref, onCollapse, onExpand }: { trip: ShellTrip; tripId: string; wide: boolean; collapsed: boolean; allTripsHref: string; onCollapse: () => void; onExpand: () => void }) {
  // Both headers stay mounted and cross-fade, so the nav below never jumps when the sidebar toggles.
  // Collapsed, this block shrinks to the brand mark's height so the nav starts at the top (it used to keep the tall identity's height, which left the icons floating mid-sidebar).
  return (
    <div className={cn("relative mb-6 min-h-10 px-3 transition-[max-height] duration-300 ease-out", collapsed ? "max-h-10 overflow-hidden" : "max-h-52")}>
      <div inert={collapsed} className={cn("transition-opacity duration-200", collapsed && "pointer-events-none opacity-0")}>
        <TripIdentity
          trip={trip}
          tripId={tripId}
          photo={wide}
          titleAction={
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-[opacity,background-color,color] group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-sidebar-accent hover:text-foreground active:scale-95"
            >
              <PanelLeftClose className="size-4" />
            </button>
          }
        />
      </div>
      <div
        inert={!collapsed}
        className={cn(
          "absolute top-0 left-1/2 grid h-8 w-8 -translate-x-1/2 place-items-center transition-opacity duration-300",
          collapsed ? "opacity-100 delay-150" : "pointer-events-none opacity-0",
        )}
      >
        <Link
          href={allTripsHref}
          aria-label="Where next? — all trips"
          className="absolute inset-0 grid place-items-center opacity-100 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
        >
          <BrandMark variant="compact" />
        </Link>
        <button
          onClick={onExpand}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="absolute inset-0 grid place-items-center rounded-full border border-sidebar-border bg-background/60 text-muted-foreground opacity-0 pointer-events-none transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:text-foreground active:scale-95"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
