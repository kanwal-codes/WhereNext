"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import {
  BedDouble,
  CalendarDays,
  Compass,
  LayoutGrid,
  Map,
  MessageCircle,
  Users,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Notebook,
  House,
  Ticket,
  Check,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Sheet, motionTokens } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";

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
  icon: typeof LayoutGrid;
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
      <Icon className="h-4 w-4 shrink-0 opacity-70" />
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity] duration-200 ease-out",
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

/** Trip name, where + when, and a slim planning-progress bar. */
function TripIdentity({ tripId, trip, compact }: { tripId: string; trip: ShellTrip; compact?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(trip.name);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(trip.name), [trip.name]);
  const sub = [trip.destination, trip.dates].filter(Boolean).join(" · ");

  async function save() {
    const name = draft.trim();
    if (!name || saving) return;
    if (name === trip.name) { setEditing(false); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error("rename");
      setEditing(false);
      announceWorkspaceChange("trip");
      router.refresh();
    } catch {
      notifyToast("The trip name couldn’t be changed.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0">
      {editing ? (
        <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex min-w-0 items-center gap-1">
          <input
            autoFocus
            aria-label="Trip name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") { setDraft(trip.name); setEditing(false); } }}
            className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2 py-1 font-display text-sm outline-none focus:ring-2 focus:ring-ring/25"
          />
          <button type="submit" disabled={!draft.trim() || saving} aria-label="Save trip name" className="rounded-full p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
        </form>
      ) : (
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className={cn("min-w-0 truncate font-display leading-tight", compact ? "text-sm" : "text-lg")}>{draft}</h2>
          <button type="button" onClick={() => setEditing(true)} aria-label="Edit trip name" className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground">
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      )}
      {!compact && sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
      {!compact && (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-sidebar-accent">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(4, trip.progress)}%` }} />
          </div>
          <p className="mt-1 text-[10px] tracking-[0.08em] text-muted-foreground uppercase">Planning {trip.progress}%</p>
        </div>
      )}
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
          "mt-3 flex items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]",
          collapsed && !onNavigate ? "px-0" : "px-4",
        )}
      >
        <MessageCircle className="h-4 w-4 shrink-0" />
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
          "sticky top-0 hidden h-[100dvh] flex-col border-r border-sidebar-border bg-sidebar py-6 lg:flex",
          collapsed ? "px-3" : "px-4",
        )}
      >
        <div className={cn("mb-6 flex gap-2", collapsed ? "flex-col items-center gap-3" : "items-start justify-between px-2")}>
          {collapsed ? (
            <Link href="/trips" aria-label="Where next? — all trips">
              <BrandMark variant="compact" />
            </Link>
          ) : (
            <div className="flex min-w-0 items-start gap-3">
              <Link href={`/trips/${tripId}`} aria-label={`${trip.name} overview`} className="shrink-0">
                <BrandMark variant="compact" className="mt-0.5 h-7 w-7 shrink-0 text-[11px]" />
              </Link>
              <TripIdentity tripId={tripId} trip={trip} />
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="shrink-0 rounded-full border border-sidebar-border bg-background/60 p-1.5 text-muted-foreground transition-colors hover:text-foreground active:scale-95"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-slim">
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
          <TripIdentity tripId={tripId} trip={trip} />
          <button onClick={() => setOpen(false)} aria-label="Close navigation" className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground active:scale-95">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim">
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
