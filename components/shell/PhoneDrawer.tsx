"use client";

import { useEffect, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Luggage, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Sheet } from "@/components/motion-primitives";
import { shortTripTitle } from "@/components/shell/trip-title";
import { DateStamp } from "@/components/shell/DateStamp";
import { NavRow } from "@/components/shell/NavRow";
import { NAV, PHONE_LABEL, PHONE_NAV_GROUPS } from "@/components/shell/trip-nav";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { daysUntilTrip } from "@/lib/trip-dates";
import type { ShellTrip } from "@/components/TripShell";

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

  // Every row is a link, and a link prefetches the moment it is on screen: opening the menu fired nine server requests in the middle of
  // its own slide-in. They wait for the slide to finish (still ready before a tap lands), and a row already prefetched costs nothing.
  const hrefs = PHONE_NAV_GROUPS.flatMap((g) => g.segs).map((seg) => (seg ? `${base}/${seg}` : base));
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      for (const href of guest ? [`${base}/chat`] : [...hrefs, "/trips"]) router.prefetch(href);
    }, 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hrefs follows base
  }, [open, base, guest, router]);

  return (
    <Sheet open={open} onClose={onClose} side="left" ariaLabel="Trip menu" className="icons-fine max-w-[19.5rem] rounded-r-4xl bg-background px-3.5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2.5 px-1.5">
        <BrandMark variant="compact" className="size-8 text-2xs" />
        <span className="font-display text-lg font-semibold tracking-[-0.02em]">Where Next</span>
        <button type="button" onClick={onClose} aria-label="Close menu" className="ml-auto grid size-10 place-items-center rounded-full text-muted-foreground hover:text-foreground active:scale-95">
          <X className="size-5" />
        </button>
      </div>

      {!guest && (
        <Link href="/trips" prefetch={false} onClick={onClose} className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 pr-3 transition-transform active:scale-[0.985]" aria-label={`${trip.name}. All trips`}>
          <DateStamp start={live?.start_date} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-base leading-tight font-medium tracking-[-0.015em]">{shortTripTitle(trip.name)}</span>
            {sub && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{sub}</span>}
            {status && <span suppressHydrationWarning className="mt-0.5 block text-xs font-semibold text-coral-ink">{status}</span>}
          </span>
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
                  label={PHONE_LABEL[seg] ?? item.label}
                  icon={item.icon}
                  active={active}
                  pillId={pillId}
                  prefetch={false}
                  onNavigate={onClose}
                  onPrefetch={() => router.prefetch(href)}
                  onLocked={locked ? () => { onClose(); openGate(`open ${(PHONE_LABEL[seg] ?? item.label).toLowerCase()}`); } : undefined}
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
        <div className="mt-2 pt-1">
          {/* Where the other trips live: a soft row, the same icon-then-label shape as the pages above it. */}
          <Link href="/trips" prefetch={false} onClick={onClose} className="flex min-h-12 items-center gap-3 rounded-2xl bg-secondary px-4 text-[0.9375rem] font-medium text-foreground transition-transform active:scale-[0.985]">
            <Luggage className="size-5 text-ink-soft" aria-hidden />
            All trips
          </Link>
        </div>
      )}
    </Sheet>
  );
}
