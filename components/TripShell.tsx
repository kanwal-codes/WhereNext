"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import {
  BedDouble,
  CalendarDays,
  Compass,
  LayoutGrid,
  Map,
  MessageCircle,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Notebook,
  House,
  Ticket,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/utils";
import { ProgressRing } from "./ProgressRing";
import { PresenceStrip } from "./PresenceStrip";

export type ShellTrip = {
  name: string;
  destination: string;
  dates: string;
  travellers: string;
  progress: number;
};

const nav = [
  { seg: "", label: "Overview", icon: LayoutGrid, exact: true },
  { seg: "chat", label: "Conversation", icon: MessageCircle },
  { seg: "discover", label: "Discover", icon: Compass },
  { seg: "map", label: "Getting around", icon: Map },
  { seg: "stay", label: "Stay", icon: BedDouble },
  { seg: "itinerary", label: "Itinerary", icon: CalendarDays },
  { seg: "knowledge", label: "Trip knowledge", icon: Notebook },
  { seg: "bookings", label: "Bookings & essentials", icon: Ticket },
] as const;

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
  return (
    <nav className="space-y-0.5">
      {nav.map((item) => {
        const href = item.seg ? `${base}/${item.seg}` : base;
        const exact = "exact" in item ? item.exact : false;
        const isActive = exact ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={item.label}
            href={href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-xl py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
              collapsed ? "justify-center px-2" : "px-3",
            )}
          >
            {isActive && !collapsed && (
              <motion.span
                layoutId="nav-marker"
                className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
              />
            )}
            <item.icon className="h-4 w-4 shrink-0 opacity-70" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function TripShell({ tripId, trip, children }: { tripId: string; trip: ShellTrip; children: ReactNode }) {
  const pathname = usePathname() ?? `/trips/${tripId}`;
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "min-h-screen lg:grid",
        collapsed ? "lg:grid-cols-[76px_minmax(0,1fr)]" : "lg:grid-cols-[264px_minmax(0,1fr)]",
      )}
    >
      {/* Desktop sidebar */}
      <motion.aside
        layout
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
        className={cn(
          "sticky top-0 hidden h-screen flex-col border-r border-sidebar-border bg-sidebar py-6 lg:flex",
          collapsed ? "px-3" : "px-4",
        )}
      >
        <div className={cn("mb-7 flex gap-2", collapsed ? "flex-col items-center gap-3" : "items-center justify-between px-2")}>
          {collapsed ? (
            <Link href="/trips" aria-label="Where next? — all trips">
              <BrandMark variant="compact" />
            </Link>
          ) : (
            <Link href="/trips" className="flex min-w-0 items-center gap-2" aria-label="Where next? — all trips">
              <BrandMark variant="compact" className="h-7 w-7 text-[11px]" />
              <h2 className="truncate font-display text-lg leading-tight">{trip.name}</h2>
            </Link>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="shrink-0 rounded-full border border-sidebar-border bg-background/60 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        {collapsed ? (
          <div className="mb-6 flex justify-center">
            <ProgressRing value={trip.progress} size={40} />
          </div>
        ) : (
          <div className="mb-6 space-y-2 rounded-2xl border border-sidebar-border bg-background/60 px-3 py-3">
            <div className="flex items-center gap-3">
              <ProgressRing value={trip.progress} size={48} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{trip.destination}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {trip.dates} · {trip.travellers}
                </p>
              </div>
            </div>
            <PresenceStrip />
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-slim">
          <NavList tripId={tripId} pathname={pathname} collapsed={collapsed} />
        </div>

        <Link
          href="/trips"
          title="All trips"
          className={cn(
            "mt-2 flex items-center gap-2.5 rounded-xl py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed ? "justify-center px-2" : "px-3",
          )}
        >
          <House className="h-4 w-4 shrink-0 opacity-70" />
          {!collapsed && "All trips"}
        </Link>

        <Link
          href={`/trips/${tripId}/chat`}
          title="Continue planning"
          className={cn(
            "mt-5 flex items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]",
            collapsed ? "px-0" : "px-4",
          )}
        >
          <MessageCircle className="h-4 w-4" />
          {!collapsed && "Continue planning"}
        </Link>
      </motion.aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 grid h-[var(--topbar)] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
        <Link href="/trips" className="flex min-w-0 items-center gap-2" aria-label="Where next? — all trips">
          <BrandMark variant="compact" className="h-6 w-6 text-[10px]" />
          <h2 className="truncate font-display text-sm leading-tight">{trip.name}</h2>
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open trip navigation"
          className="shrink-0 rounded-full border border-border p-2"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduceMotion ? { duration: 0 } : undefined}
            className="fixed inset-0 z-50 bg-ink/30 lg:hidden"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
            className="h-full w-[280px] bg-sidebar px-4 py-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <p className="eyebrow">Trip</p>
              <button onClick={() => setOpen(false)} aria-label="Close navigation">
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavList tripId={tripId} pathname={pathname} onNavigate={() => setOpen(false)} />
            <Link
              href="/trips"
              onClick={() => setOpen(false)}
              className="mt-2 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <House className="h-4 w-4 shrink-0 opacity-70" /> All trips
            </Link>
          </motion.div>
        </motion.div>
      )}

      <main className="min-w-0">{children}</main>
    </div>
  );
}
