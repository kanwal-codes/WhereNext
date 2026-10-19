"use client";

import Link from "next/link";
import { useReducedMotion, motion } from "motion/react";
import type { ComponentType, ReactNode } from "react";
import { RoamMark } from "@/features/roam/ui/RoamMark";
import { motionTokens } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

/** Roam's route as a nav icon: same 16px slot as the other icons, the 2:1 mark centred in it. */
export function RoamIcon({ className }: { className?: string }) {
  return <RoamMark state="settled" size={22} className={className} />;
}

/** One clock for everything that moves when the sidebar collapses (the column, labels, markers), the
 *  same 420ms ease-out as the Roam panel's column, so nothing finishes before the rest. */
export const SIDEBAR_MOTION = "duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]";

/** Icon + label row. The label stays mounted and collapses to zero width so it slides, not pops. */
export function NavRow({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  onNavigate,
  onPrefetch,
  onLocked,
  pillId,
  badge,
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
  /** Phone drawer: a count or dot at the row's right edge (unread group messages). */
  badge?: ReactNode;
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
      {badge}
    </Link>
  );
}
