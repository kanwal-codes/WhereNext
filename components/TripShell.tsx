"use client";

import { RoamMark } from "@/features/roam/ui/RoamMark";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useState, type ComponentType, type ReactNode } from "react";
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
import { Sheet, motionTokens } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

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
  { seg: "chat", label: "Conversation", icon: RoamIcon },
  { seg: "group", label: "Group chat", icon: Users },
  { seg: "discover", label: "Discover", icon: Compass },
  { seg: "map", label: "Getting around", icon: Map },
  { seg: "stay", label: "Stay", icon: BedDouble },
  { seg: "itinerary", label: "Itinerary", icon: CalendarDays },
  { seg: "knowledge", label: "Trip knowledge", icon: Notebook },
  { seg: "bookings", label: "Bookings & essentials", icon: Ticket },
] as const;

/** Icon + label row. The label stays mounted and collapses to zero width so it slides, not pops. */
function NavRow({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  onNavigate,
  onPrefetch,
}: {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
  onPrefetch?: () => void;
}) {
  return (
    <Link
      href={href}
      prefetch
      onMouseEnter={onPrefetch}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center rounded-xl py-2 text-sm transition-colors",
        active ? "text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/80 hover:text-sidebar-accent-foreground",
        !active && "hover:bg-sidebar-accent/60",
        collapsed ? "justify-center px-2" : "px-3",
      )}
    >
      {active && (
        <>
          <span className="absolute inset-0 -z-10 rounded-xl bg-sidebar-accent" />
          {!collapsed && (
            <span
              className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-full"
              style={{ background: "var(--color-accent-trip)" }}
            />
          )}
        </>
      )}
      <Icon className={cn("h-4 w-4 shrink-0", active ? "opacity-100" : "opacity-70")} />
      <span
        className={cn(
          "truncate transition-[max-width,margin,opacity] duration-200 ease-out",
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
  return (
    <nav className="space-y-0.5">
      {nav.map((item) => {
        const href = item.seg ? `${base}/${item.seg}` : base;
        const exact = "exact" in item ? item.exact : false;
        const isActive = exact ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <NavRow
            key={item.label}
            href={href}
            label={item.label}
            icon={item.icon}
            active={isActive}
            collapsed={collapsed}
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
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const utility = (onNavigate?: () => void) => (
    <div role="group" aria-label="Trip tools" className="space-y-1">
      <NavRow
        href="/trips"
        label="All trips"
        icon={House}
        active={false}
        collapsed={collapsed && !onNavigate}
        onNavigate={onNavigate}
      />
      <Link
        href={`/trips/${tripId}/chat`}
        onClick={onNavigate}
        title="Continue planning"
        className={cn(
          "mt-3 flex items-center justify-center gap-2.5 rounded-full bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]",
          collapsed && !onNavigate ? "px-0" : "px-4",
        )}
      >
        <RoamMark state="settled" size={28} className="shrink-0" />
        <span className={cn("overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200", collapsed && !onNavigate ? "max-w-0 opacity-0" : "max-w-[12rem] opacity-100")}>
          Continue planning
        </span>
      </Link>
    </div>
  );

  return (
    <motion.div
      // No overflow-x-hidden here — <html> already owns that (see the comment in app/layout.tsx),
      // and adding it again on `<aside>`'s own parent would re-trigger the same sticky-breaking
      // forced-overflow-y-auto quirk this whole component depends on not having.
      className="min-h-screen w-full min-w-0 max-w-full lg:grid"
      initial={false}
      animate={{ gridTemplateColumns: collapsed ? "76px minmax(0,1fr)" : "264px minmax(0,1fr)" }}
      transition={reduceMotion ? { duration: 0 } : motionTokens.standard}
    >
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "group sticky top-0 hidden h-[100dvh] flex-col border-r border-sidebar-border bg-sidebar py-6 lg:flex",
          collapsed ? "px-3" : "px-4",
        )}
      >
        <div className={cn("mb-6", collapsed ? "flex flex-col items-center gap-3" : "px-2")}>
          {collapsed ? (
            <div className="relative grid h-8 w-8 place-items-center">
              <Link
                href="/trips"
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
          ) : (
            <TripIdentity
              trip={trip}
              titleAction={
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                  className="shrink-0 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-sidebar-accent hover:text-foreground"
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </button>
              }
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-slim">
          <NavList tripId={tripId} pathname={pathname} collapsed={collapsed} />
        </div>

        <div className="hairline my-3 shrink-0" />
        {utility()}
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 grid h-[var(--topbar)] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
        <Link href={`/trips/${tripId}`} className="flex min-w-0 items-center gap-3" aria-label={trip.name}>
          <BrandMark variant="compact" className="h-6 w-6 shrink-0 text-[10px]" />
          <h2 className="truncate font-display text-sm leading-tight">{trip.name}</h2>
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open trip navigation"
          className="shrink-0 rounded-full border border-border p-2 active:scale-95"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {/* Mobile navigation sheet */}
      <Sheet open={open} onClose={() => setOpen(false)} side="left" ariaLabel="Trip navigation" className="max-w-[300px] bg-sidebar px-4 py-6">
        <div className="mb-5 flex items-start gap-3">
          <BrandMark variant="compact" className="mt-0.5 h-7 w-7 shrink-0 text-[11px]" />
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
    </motion.div>
  );
}
