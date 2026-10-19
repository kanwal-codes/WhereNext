"use client";

import { RoamMark } from "@/features/roam/ui/RoamMark";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useState, type ComponentType, type ReactNode } from "react";
import { useTripPanelMaybe } from "@/components/TripPanelProvider";
import { motion, useReducedMotion } from "motion/react";
import {
  BedDouble,
  CalendarDays,
  Compass,
  LayoutGrid,
  Map,
  Users,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Notebook,
  House,
  Ticket,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { NavRow, RoamIcon, SIDEBAR_MOTION } from "@/components/shell/NavRow";
import { NAV as nav } from "@/components/shell/trip-nav";
import { PhoneDrawer } from "@/components/shell/PhoneDrawer";
import { PhoneHeader, PhoneHeaderProvider } from "@/components/shell/PhoneHeader";
import { PHONE_V2 } from "@/lib/phone-v2";
import { Sheet, motionTokens } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { TripCover } from "@/components/trips/TripCover";
import type { TripSummary } from "@/components/trips/types";
import { daysUntilTrip } from "@/lib/trip-dates";

export type ShellTrip = {
  name: string;
  destination: string;
  dates: string;
  travellers: string;
};

function NavList({
  tripId,
  pathname,
  onNavigate,
  collapsed,
}: {
  tripId: string;
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const base = `/trips/${tripId}`;
  const router = useRouter();
  const { guest, openGate } = useGuest();
  const pillId = useId();
  return (
    <nav className="space-y-0.5">
      {nav.map((item) => {
        const href = item.seg ? `${base}/${item.seg}` : base;
        const exact = "exact" in item ? item.exact : false;
        const isActive = exact ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
        // A guest gets Roam (the conversation) only; the rest is visible but closed.
        const locked = guest && item.seg !== "chat";
        return (
          <NavRow
            key={item.label}
            onLocked={locked ? () => { onNavigate?.(); openGate(`open ${item.label.toLowerCase()}`); } : undefined}
            href={href}
            label={item.label}
            icon={item.icon}
            active={isActive}
            collapsed={collapsed}
            pillId={pillId}
            onNavigate={onNavigate}
            onPrefetch={() => router.prefetch(href)}
          />
        );
      })}
    </nav>
  );
}

/** The trip as an identity: its cover photograph in a small tile, the name set in display type, where it is, and how
 *  far off it is. Renaming the trip lives on the Overview page's hero, so this is a pure display. */
function TripIdentity({ trip, tripId, compact, titleAction }: { trip: ShellTrip; tripId: string; compact?: boolean; titleAction?: ReactNode }) {
  const live = useTripDataMaybe()?.data?.trip;
  const cover: TripSummary | null = live
    ? { id: tripId, name: live.name, destination: live.destination ?? null, origin: live.origin ?? null, duration_days: live.duration_days ?? null, start_date: live.start_date ?? null, end_date: live.end_date ?? null, travelers: live.travelers ?? null, hero_photo_name: live.hero_photo_name ?? null, saved_photo_name: null }
    : null;
  const until = daysUntilTrip(live?.start_date);
  const status = until == null ? null : until > 1 ? `${until} days to go` : until === 1 ? "Tomorrow" : until === 0 ? "Starts today" : null;
  const sub = [trip.destination, trip.dates].filter(Boolean).join(" · ");
  return (
    <div className="flex min-w-0 items-center gap-3">
      {!compact && cover && (
        <TripCover trip={cover} typeLed={false} width={240} className="size-12 shrink-0 rounded-2xl shadow-soft" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className={cn("min-w-0 truncate font-display leading-tight", compact ? "text-sm" : "text-lg font-medium tracking-[-0.01em]")}>{trip.name}</h2>
          {titleAction}
        </div>
        {!compact && sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
        {!compact && status && (
          <p suppressHydrationWarning className="mt-1 flex items-center gap-1.5 text-2xs font-medium text-coral-ink">
            <span aria-hidden className="size-1.5 rounded-full bg-coral" />
            {status}
          </p>
        )}
      </div>
    </div>
  );
}

/** The phone's primary navigation: five places in the thumb's reach, the sixth ("More") opening the full list. The
 *  active tab carries the same coral tick as the sidebar's active row, and it glides between tabs. */
function TabBar({ tripId, pathname, onMore }: { tripId: string; pathname: string; onMore: () => void }) {
  const base = `/trips/${tripId}`;
  const router = useRouter();
  const { guest, openGate } = useGuest();
  const reduce = useReducedMotion();
  const tabs = [
    { seg: "", label: "Overview", icon: LayoutGrid, exact: true },
    { seg: "chat", label: "Roam", icon: RoamIcon },
    { seg: "itinerary", label: "Plan", icon: CalendarDays },
    { seg: "discover", label: "Discover", icon: Compass },
  ] as const;
  const cell = "relative flex h-full min-w-0 flex-col items-center justify-center gap-0.5 text-2xs font-medium transition-colors active:scale-95";
  return (
    <nav aria-label="Trip" data-trip-tabbar className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/[0.97] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_oklch(0.2_0.012_65/0.25)] lg:hidden">
      <ul className="grid h-14 grid-cols-5">
        {tabs.map(({ seg, label, icon: Icon, ...rest }) => {
          const href = seg ? `${base}/${seg}` : base;
          const active = "exact" in rest && rest.exact ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
          const locked = guest && seg !== "chat";
          const inner = (
            <>
              {active && <motion.span layoutId="tabbar-tick" transition={reduce ? { duration: 0 } : motionTokens.panelSpring} className="absolute top-0 h-[3px] w-8 rounded-b-full bg-coral" />}
              <Icon className={cn("size-[22px]", active ? "text-foreground" : "text-muted-foreground")} />
              <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
            </>
          );
          return (
            <li key={label} className="min-w-0">
              {locked ? (
                <button type="button" onClick={() => openGate(`open ${label.toLowerCase()}`)} aria-label={`${label}, needs an account`} className={cn(cell, "w-full opacity-60")}>{inner}</button>
              ) : (
                <Link href={href} onClick={() => router.prefetch(href)} aria-current={active ? "page" : undefined} className={cn(cell, "w-full")}>{inner}</Link>
              )}
            </li>
          );
        })}
        <li className="min-w-0">
          <button type="button" onClick={onMore} aria-label="More: open trip navigation" className={cn(cell, "w-full text-muted-foreground")}>
            <Menu className="size-[22px]" />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

export function TripShell({ tripId, trip, children }: { tripId: string; trip: ShellTrip; children: ReactNode }) {
  const pathname = usePathname() ?? `/trips/${tripId}`;
  const { guest } = useGuest();
  // A guest's whole trip is the chat, so its "home" is the chat and the brand goes to the landing page.
  const homeHref = guest ? `/trips/${tripId}/chat` : `/trips/${tripId}`;
  const allTripsHref = guest ? "/" : "/trips";
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // With a side panel open, the page beside the sidebar is a long conversation and a detail view. Sliding the sidebar's
  // column re-wraps every line of both on every frame, which reads as shaking however fast it runs. So then the
  // content takes its new width once, and the sidebar itself does the sliding, over the room it already has.
  const panelOpen = Boolean(useTripPanelMaybe()?.panel);

  const utility = (onNavigate?: () => void) => guest ? null : (
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

  const shell = (
    <div
      // No overflow-x-hidden here — <html> already owns that (see the comment in app/layout.tsx),
      // and adding it again on `<aside>`'s own parent would re-trigger the same sticky-breaking
      // forced-overflow-y-auto quirk this whole component depends on not having.
      // The column is a CSS transition, not a JS spring: the browser interpolates it itself, in step with
      // the label/marker transitions inside (see SIDEBAR_MOTION), exactly like the Roam panel's column.
      // Always animated: with the panel sized from the screen and the chat text at a fixed measure (RoamShell, RAIL_MEASURE),
      // nothing inside re-wraps while the column slides, so the content simply glides.
      data-phone-v2={PHONE_V2 ? "" : undefined}
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
        {/* Both headers stay mounted and cross-fade, so the nav below never jumps when the sidebar toggles. */}
        {/* Collapsed, this block shrinks to the brand mark's height so the nav starts at the top (it used to keep the tall identity's height, which left the icons floating mid-sidebar). */}
        <div className={cn("relative mb-6 min-h-10 px-3 transition-[max-height] duration-300 ease-out", collapsed ? "max-h-10 overflow-hidden" : "max-h-52")}>
          <div inert={collapsed} className={cn("transition-opacity duration-200", collapsed && "pointer-events-none opacity-0")}>
            <TripIdentity
              trip={trip}
              tripId={tripId}
              titleAction={
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
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
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="absolute inset-0 grid place-items-center rounded-full border border-sidebar-border bg-background/60 text-muted-foreground opacity-0 pointer-events-none transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:text-foreground active:scale-95"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-slim">
          <NavList tripId={tripId} pathname={pathname} collapsed={collapsed} />
        </div>

        <div className="hairline my-3 shrink-0" />
        {utility()}
      </aside>

      {/* Mobile top bar */}
      {PHONE_V2 ? (
        <PhoneHeader pathname={pathname} tripId={tripId} tripName={trip.name} onMenu={() => setOpen(true)} />
      ) : (
        <div data-trip-topbar className="sticky top-0 z-30 grid h-[var(--topbar)] grid-cols-[minmax(0,1fr)] items-center gap-3 border-b border-border bg-background/95 px-4 lg:hidden">
          <Link href={homeHref} className="flex h-full min-w-0 items-center gap-3 transition-[opacity,transform] duration-200 hover:opacity-80 active:scale-[0.98]" aria-label={trip.name}>
            <BrandMark variant="compact" className="h-6 w-6 shrink-0 text-2xs" />
            <h2 className="truncate font-display text-sm leading-tight">{trip.name}</h2>
          </Link>

        </div>

      )}

      {/* Mobile navigation sheet */}
      {PHONE_V2 ? (
        <PhoneDrawer open={open} onClose={() => setOpen(false)} tripId={tripId} pathname={pathname} trip={trip} />
      ) : (
        <Sheet open={open} onClose={() => setOpen(false)} side="left" ariaLabel="Trip navigation" className="max-w-[300px] bg-sidebar px-4 py-6">
          <div className="mb-5 flex items-start gap-3">
            <BrandMark variant="compact" className="mt-0.5 h-7 w-7 shrink-0 text-2xs" />
            <TripIdentity trip={trip} tripId={tripId} />
            <button onClick={() => setOpen(false)} aria-label="Close navigation" className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground active:scale-95">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-slim">
            <NavList tripId={tripId} pathname={pathname} onNavigate={() => setOpen(false)} />
          </div>
          <div className="hairline my-3 shrink-0" />
          {utility(() => setOpen(false))}
        </Sheet>

      )}

      {/* No overflow-x-hidden here — <html> already owns that (see app/layout.tsx). Per the CSS
          spec, an element with overflow-x set but not overflow-y has its overflow-y computed as
          `auto`, quietly turning this <main> into an intermediate scroll container. Any sticky
          descendant (the Getting Around map, in Browse and My trip) then sticks relative to this
          box instead of the real viewport and just scrolls away with the page. */}
      <main className={cn("w-full min-w-0 max-w-full", !/\/(chat|group)$/.test(pathname) && "max-lg:pb-[var(--tabbar)]")}>{children}</main>
      {!PHONE_V2 && <TabBar tripId={tripId} pathname={pathname} onMore={() => setOpen(true)} />}
    </div>
  );
  return PHONE_V2 ? <PhoneHeaderProvider>{shell}</PhoneHeaderProvider> : shell;
}
