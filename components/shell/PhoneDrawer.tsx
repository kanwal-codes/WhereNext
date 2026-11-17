"use client";

import { useEffect, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Luggage, X } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { NavRow } from "@/components/shell/NavRow";
import { NAV, PHONE_LABEL, PHONE_NAV_GROUPS } from "@/components/shell/trip-nav";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import type { ShellTrip } from "@/components/TripShell";

/** The phone's whole-trip menu: it opens on the trip's name, then every page grouped Trip / Plan / Keep, and All trips at the foot. */
export function PhoneDrawer({ open, onClose, tripId, pathname, trip, unread = 0 }: { open: boolean; onClose: () => void; tripId: string; pathname: string; trip: ShellTrip; unread?: number }) {
  const base = `/trips/${tripId}`;
  const router = useRouter();
  const { guest, openGate } = useGuest();
  const pillId = useId();

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
      {/* The menu is this trip's, so it opens on its name and nothing else: no photo, no second line to cut short. The ✕ is the grey circle every sheet has. */}
      <div className="flex items-center gap-3 pl-1.5">
        <h2 className="min-w-0 flex-1 truncate font-display text-xl font-medium tracking-[-0.025em]">{trip.name}</h2>
        <button type="button" onClick={onClose} aria-label="Close menu" className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-foreground transition-transform duration-150 active:scale-[0.97]">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <nav aria-label="Trip" className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-slim">
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
          <Link href="/trips" prefetch={false} onClick={onClose} className="flex min-h-12 items-center gap-3 rounded-2xl bg-muted px-4 text-body font-medium text-foreground transition-transform active:scale-[0.985]">
            <Luggage className="size-5 text-ink-soft" aria-hidden />
            All trips
          </Link>
        </div>
      )}
    </Sheet>
  );
}
