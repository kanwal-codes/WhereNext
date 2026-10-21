"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { CalendarDays, Compass, LayoutGrid, Menu } from "lucide-react";
import { RoamIcon } from "@/components/shell/NavRow";
import { motionTokens } from "@/components/motion-primitives";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { cn } from "@/lib/utils";

/** The phone's primary navigation: five places in the thumb's reach, the sixth ("More") opening the full list. The
 *  active tab carries the same coral tick as the sidebar's active row, and it glides between tabs. */
export function TabBar({ tripId, pathname, onMore }: { tripId: string; pathname: string; onMore: () => void }) {
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
