"use client";

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bookmark, CalendarCheck, Check, Loader2, Plus, Trash2 } from "lucide-react";
import type { Place } from "@/packages/contracts/place";
import { type Placement, placementDay } from "@/packages/contracts/placement";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { mutate } from "@/lib/client/mutation-queue";
import { notifyToast } from "@/lib/application/toast";
import { cn } from "@/lib/utils";
import { useGuest } from "@/features/identity/ui/GuestProvider";

/** How many day rows the menu will ever show (a trip longer than this still works — the extra days just aren't offered here). */
const MAX_DAY_ROWS = 30;

const same = (a: Placement, b: Placement) => JSON.stringify(a) === JSON.stringify(b);
const norm = (s: string) => s.trim().toLowerCase();

function isSaved(
  savedPlaces: Array<{ places?: { provider_id?: string } | null; provider_id?: string; providerId?: string }>,
  providerId: string,
) {
  return savedPlaces.some((s) => (s.places?.provider_id ?? s.provider_id ?? s.providerId) === providerId);
}

function toast(name: string, placement: Placement): string {
  const day = placementDay(placement);
  if (day) return `${name} added to Day ${day}.`;
  if (placement === "shortlist") return `${name} shortlisted.`;
  return `Removed ${name} from the trip.`;
}

/**
 * One control for a place's whole relationship to the trip: not in it →
 * shortlisted (still deciding) → scheduled on a day. A plain click on the left
 * opens a menu to pick a day or remove. The bookmark remains an independent
 * saved-place action.
 *
 * Current state and the trip's day count are read from the trip snapshot when
 * one is in context; pass `initialPlacement` to override.
 */
export function AddToTripControl({
  tripId,
  place,
  initialPlacement,
  size = "md",
  variant = "default",
  block = false,
  onPlacementChange,
  className,
}: {
  tripId: string;
  place: Place;
  initialPlacement?: Placement;
  size?: "sm" | "md" | "lg";
  /** "orb": one round coral button for a photo card (a plus; "Day 3" once planned), with no separate save button. */
  variant?: "default" | "orb";
  /** Stretch to fill the container (detail aside) instead of hugging its content. */
  block?: boolean;
  onPlacementChange?: (placement: Placement) => void;
  className?: string;
}) {
  const data = useTripDataMaybe()?.data ?? null;
  // A guest can look but not keep: both buttons ask for an account instead of writing to the trip.
  const { guest, openGate } = useGuest();
  const reduce = useReducedMotion();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  const itinerary = (data?.itinerary ?? []) as Array<{ title?: string; day_index?: number }>;
  const savedPlaces = (data?.savedPlaces ?? []) as Array<{ places?: { provider_id?: string } | null; provider_id?: string; providerId?: string }>;

  const tripDays = Number((data?.trip as { duration_days?: number } | null | undefined)?.duration_days) || 0;
  const maxItinDay = itinerary.reduce((m, i) => Math.max(m, Number(i.day_index) || 0), 0);
  const dayCount = Math.min(Math.max(tripDays, maxItinDay), MAX_DAY_ROWS);

  const derived: Placement =
    initialPlacement ??
    (() => {
      const item = itinerary.find((i) => i.title && norm(i.title) === norm(place.name));
      if (item) return { dayIndex: Number(item.day_index) || 1 };
      const shortlisted = savedPlaces.some((s) => {
        const id = s.places?.provider_id ?? s.provider_id ?? s.providerId;
        return id === place.providerId;
      });
      return shortlisted ? "shortlist" : "none";
    })();

  const shellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const savedDerived = isSaved(savedPlaces, place.providerId);
  const [placement, setPlacement] = useState<Placement>(derived);
  const [saved, setSaved] = useState(savedDerived);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  // The menu is portalled to <body> so a card's overflow/stacking can't clip it.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; up: boolean } | null>(null);

  const place_menu = () => {
    const r = shellRef.current?.getBoundingClientRect();
    if (!r) return;
    const W = 240;
    const up = r.bottom > window.innerHeight - 300;
    setMenuPos({
      top: up ? Math.max(8, r.top - 6) : r.bottom + 6,
      left: Math.min(Math.max(8, r.right - W), window.innerWidth - W - 8),
      up,
    });
  };

  // Re-sync from the snapshot when it refreshes and we're not mid-write.
  const derivedKey = JSON.stringify(derived);
  useEffect(() => {
    if (!busyRef.current) {
      setPlacement(JSON.parse(derivedKey) as Placement);
      setSaved(savedDerived);
    }
  }, [derivedKey, savedDerived]);

  useLayoutEffect(() => {
    if (open) place_menu();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const reposition = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  async function apply(next: Placement) {
    setOpen(false);
    if (same(next, placement)) return;
    const previous = placement;
    setPlacement(next);
    setBusy(true);
    busyRef.current = true;
    try {
      const res = await mutate(`/api/trips/${tripId}/places/placement`, {
        method: "PUT",
        body: { place, placement: next },
        announce: ["places", "itinerary"],
      });
      if (!res.ok) throw new Error();
      onPlacementChange?.(next);
      notifyToast(res.queued ? `${place.name} — saved, will sync when you're back online.` : toast(place.name, next), res.queued ? "info" : "success");
    } catch {
      // Revert only if nothing newer has already landed on top of this optimistic value — a
      // rapid second click that already succeeded must not be clobbered by this failure.
      setPlacement((current) => (same(current, next) ? previous : current));
      notifyToast(`Couldn’t update ${place.name}. Try again.`, "error");
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  async function toggleBookmark() {
    if (busy) return;
    const previous = saved;
    const next = !previous;
    setSaved(next);
    setBusy(true);
    busyRef.current = true;
    try {
      const res = await mutate(`/api/trips/${tripId}/places/bookmark`, {
        method: "PUT",
        body: { place, saved: next },
        announce: ["places"],
      });
      if (!res.ok) throw new Error();
      notifyToast(!previous ? `${place.name} saved.` : `${place.name} removed from saved places.`, "success");
    } catch {
      setSaved(previous);
      notifyToast(`Couldn’t update ${place.name}. Try again.`, "error");
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  const day = placementDay(placement);
  const bookmarked = saved;
  const state: "none" | "day" = day ? "day" : "none";
  // On a card ("sm") the room is tight and a place card already says what it is: "Add". The full phrase on the detail view.
  const label = state === "day" ? `Day ${day}` : size === "sm" ? "Add" : "Add to trip";

  const sm = size === "sm";
  const orb = variant === "orb";
  const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  // Two controls, not one pill: the main action (put it on a day) and a separate round save button.
  // They sit a hair apart so each reads, presses and shows its state on its own.
  return (
    <div ref={rootRef} className={cn("relative shrink-0", block ? "block" : "inline-block", className)}>
      <div className={cn("items-center", sm ? "gap-1.5" : "gap-2", block ? "flex w-full" : "inline-flex")}>
        <div ref={shellRef} className={cn("min-w-0", block && "flex-1")}>
          <button
            type="button"
            disabled={busy}
            onClick={() => (guest ? openGate("add places to a trip") : setOpen((o) => !o))}
            aria-label={`Choose an itinerary day for ${place.name}`}
            aria-haspopup="menu"
            aria-expanded={open}
            className={cn(
              orb
                ? cn(
                    cn(sm ? "h-10 min-w-10" : "h-12 min-w-12"),
                    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-sm font-semibold transition-[background-color,color,box-shadow,transform,filter] duration-200 ease-out hover:brightness-105 active:scale-95 disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                    day
                      ? "bg-white px-4 text-ink shadow-[0_6px_16px_oklch(0_0_0/0.35)]"
                      : "bg-coral-fill text-coral-fill-foreground shadow-[0_10px_26px_oklch(0.64_0.175_36/0.5),inset_0_1px_0_oklch(1_0_0/0.35)]",
                  )
                : "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.98] disabled:opacity-70",
              !orb && ring,
              !orb && block && "w-full",
              !orb && (sm ? "h-8 px-3 text-xs" : size === "lg" ? "h-12 px-6 text-[0.9375rem]" : "h-10 px-5 text-sm"),
              !orb &&
                (day
                  ? "border-transparent bg-coral-fill text-coral-fill-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.18)] hover:brightness-105"
                  : sm
                    ? "border-border bg-background text-ink-soft hover:border-ink/30 hover:text-ink"
                    : "border-primary bg-primary text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.14),0_1px_2px_oklch(0.2_0.012_65/0.25)] hover:bg-primary/88"),
            )}
          >
            {busy ? (
              <Loader2 className={cn(sm ? "size-3.5" : "size-4", "animate-spin")} />
            ) : day ? (
              <CalendarCheck className={cn(sm ? "size-3.5" : "size-4")} />
            ) : orb ? (
              <Plus className={sm ? "size-5" : "size-6"} strokeWidth={2} />
            ) : sm ? (
              <Plus className="size-3.5" strokeWidth={2.25} />
            ) : null}
            {orb && !day ? null : <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={label}
                initial={reduce ? false : { opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3 }}
                transition={{ duration: reduce ? 0 : 0.12 }}
              >
                {label}
              </motion.span>
            </AnimatePresence>}
          </button>
        </div>
        {!orb && <button
          type="button"
          disabled={busy}
          onClick={() => (guest ? openGate("save places") : void toggleBookmark())}
          aria-label={saved ? `Remove ${place.name} from saved places` : `Save ${place.name}`}
          aria-pressed={saved}
          className={cn(
            "grid shrink-0 place-items-center rounded-full border transition-[background-color,border-color,color,transform] duration-200 ease-out active:scale-90 disabled:opacity-70",
            ring,
            sm ? "size-8" : size === "lg" ? "size-12" : "size-10",
            saved
              ? "border-coral/35 bg-coral-soft text-coral-ink hover:bg-coral-soft"
              : "border-border bg-background text-muted-foreground hover:border-ink/30 hover:text-ink",
          )}
        >
          <Bookmark className={cn(sm ? "size-3.5" : size === "lg" ? "size-[18px]" : "size-4", "transition-transform duration-200", saved && "scale-110 fill-current")} />
        </button>}
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && menuPos && (
              <motion.div
                id={menuId}
                ref={menuRef}
                role="menu"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: menuPos.up ? 4 : -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: menuPos.up ? 4 : -4 }}
                transition={{ duration: reduce ? 0 : 0.14, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: "fixed",
                  left: menuPos.left,
                  ...(menuPos.up ? { bottom: window.innerHeight - menuPos.top } : { top: menuPos.top }),
                }}
                className={cn(
                  "z-[70] w-60 rounded-2xl border border-border bg-card p-1.5 text-sm shadow-lift",
                  menuPos.up ? "origin-bottom-right" : "origin-top-right",
                )}
              >
            {dayCount > 0 ? (
              <div className={cn(dayCount > 6 && "max-h-56 overflow-y-auto overscroll-contain scrollbar-slim")}>
                {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
                  <MenuRow key={d} selected={day === d} onClick={() => void apply({ dayIndex: d })} title={`Day ${d}`} Icon={CalendarCheck} />
                ))}
              </div>
            ) : (
              <MenuRow selected={Boolean(day)} onClick={() => void apply({ dayIndex: 1 })} title="Add to itinerary" hint="order it later" Icon={CalendarCheck} />
            )}

            {state === "day" && (
              <>
                <div className="mx-2 my-1.5 hairline" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void apply("none")}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  Remove from itinerary
                </button>
              </>
            )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

function MenuRow({
  selected,
  onClick,
  title,
  hint,
  Icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
  Icon: typeof Bookmark;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-accent"
    >
      <span
        className={cn(
          "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
          selected ? "border-leaf bg-leaf text-primary-foreground" : "border-border",
        )}
      >
        {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {hint && <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>}
    </button>
  );
}
