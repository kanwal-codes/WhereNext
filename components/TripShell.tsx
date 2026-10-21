"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useMediaQuery } from "@/lib/use-media-query";
import { useTripPanelMaybe } from "@/components/TripPanelProvider";
import { SIDEBAR_MOTION } from "@/components/shell/NavRow";
import { NavList } from "@/components/shell/NavList";
import { PhoneDrawer } from "@/components/shell/PhoneDrawer";
import { PhoneHeader, PhoneHeaderProvider } from "@/components/shell/PhoneHeader";
import { SidebarHeader } from "@/components/shell/SidebarHeader";
import { SidebarTools } from "@/components/shell/SidebarTools";
import { type ShellTrip } from "@/components/shell/TripIdentity";
import { useGroupUnread } from "@/lib/client/use-group-unread";
import { cn } from "@/lib/utils";
import { useGuest } from "@/features/identity/ui/GuestProvider";

export type { ShellTrip };

export function TripShell({ tripId, trip, children }: { tripId: string; trip: ShellTrip; children: ReactNode }) {
  const pathname = usePathname() ?? `/trips/${tripId}`;
  const { guest } = useGuest();
  // A guest's whole trip is the chat, so the brand goes to the landing page.
  const allTripsHref = guest ? "/" : "/trips";
  const [open, setOpen] = useState(false);
  // The desktop sidebar stays in the DOM (hidden) on a phone; its cover photo must not be fetched there (two requests, and a paid photo lookup, on every page).
  const wide = useMediaQuery("(min-width: 1024px)");
  // Phone redesign: unread group messages show as a number on the menu's Group chat row and a dot on the menu button.
  const unread = useGroupUnread(tripId, !guest);
  const [collapsed, setCollapsed] = useState(false);
  // With a side panel open, the page beside the sidebar is a long conversation and a detail view. Sliding the sidebar's
  // column re-wraps every line of both on every frame, which reads as shaking however fast it runs. So then the
  // content takes its new width once, and the sidebar itself does the sliding, over the room it already has.
  const panelOpen = Boolean(useTripPanelMaybe()?.panel);

  const shell = (
    <div
      // No overflow-x-hidden here — <html> already owns that (see the comment in app/layout.tsx),
      // and adding it again on `<aside>`'s own parent would re-trigger the same sticky-breaking
      // forced-overflow-y-auto quirk this whole component depends on not having.
      // The column is a CSS transition, not a JS spring: the browser interpolates it itself, in step with
      // the label/marker transitions inside (see SIDEBAR_MOTION), exactly like the Roam panel's column.
      // Always animated: with the panel sized from the screen and the chat text at a fixed measure (RoamShell, RAIL_MEASURE),
      // nothing inside re-wraps while the column slides, so the content simply glides.
      data-phone-v2={""}
      className={cn("min-h-screen w-full min-w-0 max-w-full lg:grid lg:transition-[grid-template-columns]", SIDEBAR_MOTION)}
      style={{ gridTemplateColumns: collapsed ? "76px minmax(0,1fr)" : "264px minmax(0,1fr)" }}
    >
      {/* Desktop sidebar */}
      <aside
        // Beside an open panel the column has already taken its final width, so this slides on its own width.
        style={panelOpen ? { width: collapsed ? 76 : 264 } : undefined}
        className={cn(
          "group sticky top-0 hidden h-[100dvh] flex-col border-r border-sidebar-border bg-sidebar px-3 py-6 lg:flex",
          panelOpen && "z-30 overflow-hidden lg:transition-[width]",
          panelOpen && SIDEBAR_MOTION,
        )}
      >
        <SidebarHeader trip={trip} tripId={tripId} wide={wide} collapsed={collapsed} allTripsHref={allTripsHref} onCollapse={() => setCollapsed(true)} onExpand={() => setCollapsed(false)} />

        <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-slim">
          <NavList tripId={tripId} pathname={pathname} collapsed={collapsed} />
        </div>

        <div className="hairline my-3 shrink-0" />
        {!guest && <SidebarTools tripId={tripId} pathname={pathname} collapsed={collapsed} />}
      </aside>

      {/* Phone header and navigation drawer */}
      <PhoneHeader pathname={pathname} tripId={tripId} tripName={trip.name} onMenu={() => setOpen(true)} menuDot={unread > 0 && !/\/group$/.test(pathname)} />
      <PhoneDrawer open={open} onClose={() => setOpen(false)} tripId={tripId} pathname={pathname} trip={trip} unread={unread} />

      {/* No overflow-x-hidden here — <html> already owns that (see app/layout.tsx). Per the CSS
          spec, an element with overflow-x set but not overflow-y has its overflow-y computed as
          `auto`, quietly turning this <main> into an intermediate scroll container. Any sticky
          descendant (the Getting Around map, in Browse and My trip) then sticks relative to this
          box instead of the real viewport and just scrolls away with the page. */}
      <main className={cn("w-full min-w-0 max-w-full", !/\/(chat|group)$/.test(pathname) && "max-lg:pb-[var(--tabbar)]")}>{children}</main>
    </div>
  );
  return <PhoneHeaderProvider>{shell}</PhoneHeaderProvider>;
}
