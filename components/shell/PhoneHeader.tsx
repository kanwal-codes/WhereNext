"use client";

import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlignLeft, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { shortTripTitle } from "@/components/shell/trip-title";

/**
 * The phone header (docs/design/phone-redesign-plan.md, phase 1): one round button on the left (menu, or back on a
 * nested page), the page title centred, and one slot on the right. No subtitle, no avatar. Pages that need something
 * other than the default call `useSetPhoneHeader`; most need nothing, because the route decides.
 */
export type PhoneHeaderOverride = {
  title?: string;
  /** Replaces the title with something to press (Discover's city picker). Keep it memoised. */
  titleNode?: ReactNode;
  /** What sits at the right edge: a round button or a pill. Keep it to one thing. */
  trailing?: ReactNode;
  /** `overlay`: no background, for a page that opens on a photograph (the overview hero). */
  variant?: "solid" | "overlay";
};

type Ctx = { override: PhoneHeaderOverride; set: Dispatch<SetStateAction<PhoneHeaderOverride>> };
const PhoneHeaderContext = createContext<Ctx | null>(null);

export function PhoneHeaderProvider({ children }: { children: ReactNode }) {
  const [override, set] = useState<PhoneHeaderOverride>({});
  const value = useMemo(() => ({ override, set }), [override]);
  return <PhoneHeaderContext.Provider value={value}>{children}</PhoneHeaderContext.Provider>;
}

/** Set this page's header title, right-hand slot or variant. Cleared when the page unmounts. */
export function useSetPhoneHeader(next: PhoneHeaderOverride) {
  const ctx = useContext(PhoneHeaderContext);
  const set = ctx?.set;
  const { title, titleNode, trailing, variant } = next;
  // Several parts of a page can each set their own piece (the page sets the right-hand button, its surface sets the title):
  // a call only touches the fields it gives, and takes only those back when it goes.
  useEffect(() => {
    const mine: PhoneHeaderOverride = {};
    if (title !== undefined) mine.title = title;
    if (titleNode !== undefined) mine.titleNode = titleNode;
    if (trailing !== undefined) mine.trailing = trailing;
    if (variant !== undefined) mine.variant = variant;
    set?.((prev) => ({ ...prev, ...mine }));
    return () => set?.((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(mine) as Array<keyof PhoneHeaderOverride>) delete next[key];
      return next;
    });
  }, [set, title, titleNode, trailing, variant]);
}

/** Where "back" goes from a nested page. `null` means the browser's own history (the page was reached from several places). */
export function backTarget(pathname: string, base: string): { href: string | null } | undefined {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/\/$/, "") : "";
  if (/^\/stay\/.+/.test(rest)) return { href: `${base}/stay` };
  if (rest === "/group/details") return { href: `${base}/group` };
  if (/^\/(place|event|compare)(\/|$)/.test(rest)) return { href: null };
  return undefined;
}

const PAGE_TITLES: Record<string, string> = {
  "/chat": "Roam",
  "/group": "Group chat",
  "/group/details": "Group details",
  "/itinerary": "Plan",
  "/today": "Today",
  "/map": "Getting around",
  "/transport": "Getting around",
  "/bookings": "Bookings",
  "/knowledge": "What Roam remembers",
  "/budget": "What Roam remembers",
  "/compare": "Compare",
  "/event": "Event",
};

export const PHONE_ROUND = "grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-transform duration-200 ease-out active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function PhoneHeader({ pathname, tripId, tripName, onMenu, menuDot }: { pathname: string; tripId: string; tripName: string; onMenu: () => void; menuDot?: boolean }) {
  const router = useRouter();
  const ctx = useContext(PhoneHeaderContext);
  const override = ctx?.override ?? {};
  const base = `/trips/${tripId}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/\/$/, "") : "";
  // One rule: the bar names the page you are on. Only the trip's own home page carries the trip name; Discover and Stay put their city picker here instead.
  const defaultTitle = PAGE_TITLES[rest] ?? (/^\/stay\/alternatives/.test(rest) ? "Places to stay" : /^\/stay\/./.test(rest) ? "Stay" : /^\/place\//.test(rest) ? "Place" : shortTripTitle(tripName));
  const title = override.title ?? defaultTitle;
  const back = backTarget(pathname, base);
  const overlay = override.variant === "overlay";
  return (
    <header
      data-trip-topbar
      className={cn("icons-fine sticky top-0 z-30 flex h-[var(--topbar)] items-center gap-3 px-3 pt-[env(safe-area-inset-top)] lg:hidden", overlay ? "bg-transparent" : "bg-background/95")}
    >
      {back ? (
        back.href ? (
          <Link href={back.href} aria-label="Back" className={PHONE_ROUND}><ArrowLeft className="size-[1.2rem]" /></Link>
        ) : (
          <button type="button" onClick={() => router.back()} aria-label="Back" className={PHONE_ROUND}><ArrowLeft className="size-[1.2rem]" /></button>
        )
      ) : (
        <button type="button" onClick={onMenu} aria-label="Open trip menu" className={cn(PHONE_ROUND, "relative")}>
          <AlignLeft className="size-[1.2rem]" />
          {menuDot && <span aria-hidden className="absolute top-2 right-2 size-2.5 rounded-full bg-coral ring-2 ring-background" />}
        </button>
      )}
      {/* A <p>, not a heading: every page already has its own h1, and a second one would be read out first on every screen. */}
      {override.titleNode ? (
        <div className="flex min-w-0 flex-1 justify-center">{override.titleNode}</div>
      ) : (
        <p className="min-w-0 flex-1 truncate text-center font-display text-base font-semibold tracking-[-0.01em]">{title}</p>
      )}
      <div className="flex min-w-11 shrink-0 justify-end">{override.trailing}</div>
    </header>
  );
}
