"use client";

import { useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, Pencil, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Sheet } from "@/components/motion-primitives";
import { NavRow } from "@/components/shell/NavRow";
import { NAV, PHONE_NAV_GROUPS } from "@/components/shell/trip-nav";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { daysUntilTrip } from "@/lib/trip-dates";
import { memberInitials } from "@/lib/member-initials";
import { cn } from "@/lib/utils";
import type { ShellTrip } from "@/components/TripShell";

/** "JUN 5" in a dashed coral box: the stamp trip cards already carry. Not a ticket; just the date. */
function DateStamp({ start }: { start?: string | null }) {
  const d = start ? new Date(`${start}T00:00:00`) : null;
  const valid = d && !Number.isNaN(d.getTime());
  return (
    <span aria-hidden className="grid h-[3.25rem] w-[3.1rem] shrink-0 place-items-center rounded-2xl border-[1.5px] border-dashed border-coral text-coral-ink">
      {valid ? (
        <span className="flex flex-col items-center leading-none">
          <span className="text-2xs font-semibold tracking-[0.14em] uppercase">{d.toLocaleDateString("en", { month: "short" })}</span>
          <span className="mt-1 font-display text-xl font-medium">{d.getDate()}</span>
        </span>
      ) : (
        <CalendarDays className="size-5" />
      )}
    </span>
  );
}

function rangeLabel(start?: string | null, end?: string | null): string | null {
  if (!start) return null;
  const f = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" });
  return end && end !== start ? `${f(start)} – ${f(end)}` : f(start);
}

/** The phone's whole-trip menu: the trip as a plain card, every page grouped Trip / Plan / Keep, then New trip, All trips and the account. */
export function PhoneDrawer({ open, onClose, tripId, pathname, trip, unread = 0 }: { open: boolean; onClose: () => void; tripId: string; pathname: string; trip: ShellTrip; unread?: number }) {
  const base = `/trips/${tripId}`;
  const router = useRouter();
  const { guest, openGate } = useGuest();
  const pillId = useId();
  const data = useTripDataMaybe();
  const live = data?.data?.trip;
  const until = daysUntilTrip(live?.start_date);
  const status = until == null ? null : until > 1 ? `${until} days to go` : until === 1 ? "Tomorrow" : until === 0 ? "Starts today" : null;
  const sub = [trip.travellers, rangeLabel(live?.start_date, live?.end_date)].filter(Boolean).join(" · ");
  const me = data?.me?.name;

  return (
    <Sheet open={open} onClose={onClose} side="left" ariaLabel="Trip menu" className="icons-fine max-w-[19.5rem] rounded-r-[1.75rem] bg-background px-3.5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2.5 px-1.5">
        <BrandMark variant="compact" className="size-8 text-2xs" />
        <span className="font-display text-lg font-semibold tracking-[-0.02em]">Where Next</span>
        <button type="button" onClick={onClose} aria-label="Close menu" className="ml-auto grid size-10 place-items-center rounded-full text-muted-foreground hover:text-foreground active:scale-95">
          <X className="size-5" />
        </button>
      </div>

      {!guest && (
        <Link href="/trips" onClick={onClose} className="mt-4 flex items-center gap-3 rounded-[1.25rem] border border-border bg-surface p-2.5 pr-3 transition-transform active:scale-[0.99]" aria-label={`${trip.name}. All trips`}>
          <DateStamp start={live?.start_date} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-base leading-tight font-medium tracking-[-0.015em]">{trip.name}</span>
            {sub && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{sub}</span>}
            {status && <span suppressHydrationWarning className="mt-0.5 block text-xs font-semibold text-coral-ink">{status}</span>}
          </span>
          <ChevronDown className="size-[1.125rem] shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      )}

      <nav aria-label="Trip" className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-slim">
        {PHONE_NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-1">
            <p className="eyebrow px-3 pt-3 pb-1.5">{group.title}</p>
            {group.segs.map((seg) => {
              const item = NAV.find((n) => n.seg === seg);
              if (!item) return null;
              const href = seg ? `${base}/${seg}` : base;
              const exact = "exact" in item ? item.exact : false;
              const active = exact ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
              const locked = guest && seg !== "chat";
              return (
                <NavRow
                  key={item.label}
                  href={href}
                  label={item.label}
                  icon={item.icon}
                  active={active}
                  pillId={pillId}
                  onNavigate={onClose}
                  onPrefetch={() => router.prefetch(href)}
                  onLocked={locked ? () => { onClose(); openGate(`open ${item.label.toLowerCase()}`); } : undefined}
                  badge={seg === "group" && unread > 0 ? (
                    <span className="ml-auto grid h-[1.375rem] min-w-[1.375rem] place-items-center rounded-full bg-coral-fill px-1.5 text-xs font-semibold text-white tabular-nums" aria-label={`${unread} unread`}>{unread > 9 ? "9+" : unread}</span>
                  ) : undefined}
                />
              );
            })}
          </div>
        ))}
      </nav>

      {!guest && (
        <div className="mt-2 flex items-center gap-2.5 border-t border-border pt-3.5">
          <Link href="/trips/new" onClick={onClose} className="inline-flex h-12 items-center gap-2 rounded-full bg-coral-fill px-5 text-[0.9375rem] font-semibold text-white shadow-[inset_0_1px_0_oklch(1_0_0/0.18)] transition-transform active:scale-[0.97]">
            <Pencil className="size-[1.125rem]" aria-hidden /> New trip
          </Link>
          <Link href="/trips" onClick={onClose} className="ml-auto px-1 text-sm font-semibold text-ink-soft hover:text-foreground">All trips</Link>
          <Link href="/account" onClick={onClose} aria-label="Your account" className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-primary font-display text-sm font-medium text-primary-foreground", !me && "hidden")}>
            {me ? memberInitials(me) : null}
          </Link>
        </div>
      )}
    </Sheet>
  );
}
