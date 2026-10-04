"use client";

import { RoamMark } from "@/features/roam/ui/RoamMark";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useState, type ComponentType, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  BedDouble,
  CalendarDays,
  Compass,
  LayoutGrid,
  Map,
  Users,
  Lock,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Notebook,
  House,
  Ticket,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Sheet, motionTokens } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";
import { useGuest } from "@/features/identity/ui/GuestProvider";

export type ShellTrip = {
  name: string;
  destination: string;
  dates: string;
  travellers: string;
};

/** Roam's route as a nav icon: same 16px slot as the other icons, the 2:1 mark centred in it. */
function RoamIcon({ className }: { className?: string }) {
  return <RoamMark state="settled" size={22} className={className} />;
}

const nav = [
  { seg: "", label: "Overview", icon: LayoutGrid, exact: true },
  { seg: "chat", label: "Roam", icon: RoamIcon },
  { seg: "group", label: "Group chat", icon: Users },
  { seg: "discover", label: "Discover", icon: Compass },
  { seg: "map", label: "Getting around", icon: Map },
  { seg: "stay", label: "Stay", icon: BedDouble },
  { seg: "itinerary", label: "Itinerary", icon: CalendarDays },
  { seg: "knowledge", label: "Trip knowledge", icon: Notebook },
  { seg: "bookings", label: "Bookings & essentials", icon: Ticket },
] as const;

/** One clock for everything that moves when the sidebar collapses (the column, labels, markers), the
 *  same 420ms ease-out as the Roam panel's column, so nothing finishes before the rest. */
const SIDEBAR_MOTION = "duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]";

/** Icon + label row. The label stays mounted and collapses to zero width so it slides, not pops. */
function NavRow({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  onNavigate,
  onPrefetch,
  onLocked,
  pillId,
}: {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  /** Shared by every row of one list: the active highlight glides between rows instead of snapping. */
  pillId?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  onPrefetch?: () => void;
  /** Set for a guest: the row is shown but closed, and asks for an account instead of navigating. */
  onLocked?: () => void;
}) {
  // Desktop rows keep one left inset in both states, so each icon stays put (and sits centred in the
  // 76px rail) while the label clips away; the drawer keeps its own tighter padding.
  const padX = onNavigate ? "px-3" : "px-[1.125rem]";
  const reduce = useReducedMotion();
  if (onLocked) {
    return (
      <button
        type="button"
        onClick={onLocked}
        title={collapsed ? `${label} (needs an account)` : undefined}
        aria-label={`${label}, needs an account`}
        className={cn(
          "group relative flex w-full items-center rounded-xl py-2 text-left text-sm text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          padX,
        )}
      >
        <Icon className="h-4 w-4 shrink-0 opacity-60" />
        <span className={cn("truncate transition-[max-width,margin,opacity]", SIDEBAR_MOTION, collapsed ? "ml-0 max-w-0 opacity-0" : "ml-2.5 max-w-[12rem] flex-1 opacity-100")}>{label}</span>
        <Lock className={cn("h-3 shrink-0 transition-[width,margin,opacity]", SIDEBAR_MOTION, collapsed ? "ml-0 w-0 opacity-0" : "ml-2 w-3 opacity-50")} aria-hidden="true" />
      </button>
    );
  }
  return (
    <Link
      href={href}
      onMouseEnter={onPrefetch}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center rounded-xl py-2 text-sm transition-colors",
        active ? "text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/80 hover:text-sidebar-accent-foreground",
        !active && "hover:bg-sidebar-accent/60",
        padX,
      )}
    >
      {active && (
        <>
          {/* The highlight and its coral tick are one shared element: on navigation they travel to the new row. */}
          <motion.span
            layoutId={pillId ? `${pillId}-pill` : undefined}
            transition={reduce ? { duration: 0 } : motionTokens.panelSpring}
            className="absolute inset-0 -z-10 rounded-xl bg-sidebar-accent shadow-hairline"
          />
          <motion.span
            layoutId={pillId ? `${pillId}-tick` : undefined}
            transition={reduce ? { duration: 0 } : motionTokens.panelSpring}
            className={cn("absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-full bg-coral transition-opacity", SIDEBAR_MOTION, collapsed && "opacity-0")}
          />
        </>
      )}
      <Icon className={cn("h-4 w-4 shrink-0 transition-[opacity,transform] duration-200 ease-out group-hover:scale-110", active ? "opacity-100" : "opacity-70 group-hover:opacity-100")} />
      <span
        className={cn(
          "truncate transition-[max-width,margin,opacity]",
          SIDEBAR_MOTION,
          collapsed ? "ml-0 max-w-0 opacity-0" : "ml-2.5 max-w-[12rem] opacity-100",
        )}
      >
        {label}
      </span>
    </Link>
  );
}

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

/** Trip name and where + when. Renaming the trip lives on the Overview page's hero now, not
 *  here — this is a pure display. */
function TripIdentity({ trip, compact, titleAction }: { trip: ShellTrip; compact?: boolean; titleAction?: ReactNode }) {
  const sub = [trip.destination, trip.dates].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <h2 className={cn("min-w-0 truncate font-display leading-tight", compact ? "text-sm" : "text-lg")}>{trip.name}</h2>
        {titleAction}
      </div>
      {!compact && sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
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

  return (
    <div
      // No overflow-x-hidden here — <html> already owns that (see the comment in app/layout.tsx),
      // and adding it again on `<aside>`'s own parent would re-trigger the same sticky-breaking
      // forced-overflow-y-auto quirk this whole component depends on not having.
      // The column is a CSS transition, not a JS spring: the browser interpolates it itself, in step with
      // the label/marker transitions inside (see SIDEBAR_MOTION), exactly like the Roam panel's column.
      className={cn("min-h-screen w-full min-w-0 max-w-full lg:grid lg:transition-[grid-template-columns]", SIDEBAR_MOTION)}
      style={{ gridTemplateColumns: collapsed ? "76px minmax(0,1fr)" : "264px minmax(0,1fr)" }}
    >
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "group sticky top-0 hidden h-[100dvh] flex-col border-r border-sidebar-border bg-sidebar px-3 py-6 lg:flex",
        )}
      >
        {/* Both headers stay mounted and cross-fade, so the nav below never jumps when the sidebar toggles. */}
        <div className="relative mb-6 min-h-10 px-3">
          <div inert={collapsed} className={cn("transition-opacity duration-200", collapsed && "pointer-events-none opacity-0")}>
            <TripIdentity
              trip={trip}
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
      <div data-trip-topbar className="sticky top-0 z-30 grid h-[var(--topbar)] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/95 px-4 lg:hidden">
        <Link href={homeHref} className="flex min-w-0 items-center gap-3 transition-[opacity,transform] duration-200 hover:opacity-80 active:scale-[0.98]" aria-label={trip.name}>
          <BrandMark variant="compact" className="h-6 w-6 shrink-0 text-2xs" />
          <h2 className="truncate font-display text-sm leading-tight">{trip.name}</h2>
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open trip navigation"
          className="shrink-0 rounded-full border border-border p-2 transition-[background-color,transform] hover:bg-accent active:scale-95"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {/* Mobile navigation sheet */}
      <Sheet open={open} onClose={() => setOpen(false)} side="left" ariaLabel="Trip navigation" className="max-w-[300px] bg-sidebar px-4 py-6">
        <div className="mb-5 flex items-start gap-3">
          <BrandMark variant="compact" className="mt-0.5 h-7 w-7 shrink-0 text-2xs" />
          <TripIdentity trip={trip} />
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

      {/* No overflow-x-hidden here — <html> already owns that (see app/layout.tsx). Per the CSS
          spec, an element with overflow-x set but not overflow-y has its overflow-y computed as
          `auto`, quietly turning this <main> into an intermediate scroll container. Any sticky
          descendant (the Getting Around map, in Browse and My trip) then sticks relative to this
          box instead of the real viewport and just scrolls away with the page. */}
      <main className="w-full min-w-0 max-w-full">{children}</main>
    </div>
  );
}
