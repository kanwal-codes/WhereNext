"use client";

import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import { useRef, type ReactNode, type RefObject } from "react";
import { ease } from "@/components/motion/tokens";
import { useModalFocus } from "@/components/motion/useModalFocus";
import { cn } from "@/lib/utils";

/**
 * A native-feeling sheet. `side="bottom"` gets a drag handle and swipe-down-to-close;
 * `side="right"` / `"left"` slide in from that edge. Owns its own backdrop, presence,
 * focus handling and scroll lock. Render your header + scrollable body as children.
 */
export function Sheet({
  open,
  onClose,
  side = "bottom",
  ariaLabel,
  initialFocus,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side?: "bottom" | "right" | "left" | "center";
  ariaLabel?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  useModalFocus(open, onClose, panelRef, initialFocus);

  // "center" is a real dialog box, not an edge-anchored sheet — it scales/fades in
  // instead of sliding, since a translate-from-offscreen entrance doesn't read as a
  // popup when the box isn't pinned to that edge.
  const closed =
    side === "center" ? { opacity: 0, scale: 0.96 } : side === "bottom" ? { y: "100%" } : side === "right" ? { x: "100%" } : { x: "-100%" };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn(
            "fixed inset-0 z-50 flex bg-black/40 will-change-[opacity]",
            side === "center" ? "items-center justify-center p-4" : side === "bottom" ? "items-end" : side === "right" ? "justify-end" : "justify-start",
          )}
          initial={{ opacity: 0, pointerEvents: "none" }}
          animate={{ opacity: 1, pointerEvents: "auto" }}
          // `pointerEvents: "none"` lands the instant the exit starts (Framer applies a
          // non-animatable value immediately, not interpolated) — an invisible backdrop
          // fading out, or ever stuck mid-exit for any reason, must never keep swallowing
          // clicks across the whole viewport while it's not actually open.
          exit={{ opacity: 0, pointerEvents: "none", transition: reduce ? { duration: 0 } : { duration: 0.22, ease: "easeIn" } }}
          // The scrim fades in as the panel starts to move, and out over the same stretch it leaves in (it used to be gone in 0.16s while the panel was still sliding).
          transition={reduce ? { duration: 0 } : { duration: 0.26, ease }}
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            tabIndex={-1}
            className={cn(
              // will-change: the slide is a JS-driven transform, which the browser would otherwise repaint (shadow, rounded corners, every row) on each frame instead of moving one cached layer.
              // Not for "center": it scales in, and a layer promoted at 0.96 keeps that raster scale, leaving its text soft.
              "relative flex min-h-0 flex-col bg-surface shadow-lift outline-none",
              side !== "center" && "will-change-transform",
              side === "center" ? "w-full max-w-sm rounded-3xl" : side === "bottom" ? "max-h-[92dvh] w-full rounded-t-3xl" : "h-full w-full max-w-xl",
              className,
            )}
            initial={reduce ? false : closed}
            animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            // Arrives on a soft spring, leaves quicker and straight (ease-in): exits should not linger on the spring's long tail.
            exit={reduce ? undefined : { ...closed, transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } }}
            transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            {...(side === "bottom" && !reduce
              ? {
                  drag: "y" as const,
                  dragControls,
                  dragListener: false,
                  dragConstraints: { top: 0, bottom: 0 },
                  dragElastic: { top: 0, bottom: 0.5 },
                  onDragEnd: (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
                    if (info.offset.y > 90 || info.velocity.y > 600) onClose();
                  },
                }
              : {})}
            {...(side === "left" && !reduce
              ? {
                  // The side menu is closed by pushing it back the way it came.
                  drag: "x" as const,
                  dragConstraints: { left: 0, right: 0 },
                  dragElastic: { left: 0.5, right: 0 },
                  dragDirectionLock: true,
                  onDragEnd: (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
                    if (info.offset.x < -70 || info.velocity.x < -500) onClose();
                  },
                }
              : {})}
          >
            {side === "bottom" && (
              <div
                className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1 active:cursor-grabbing"
                onPointerDown={(e) => !reduce && dragControls.start(e)}
                aria-hidden
              >
                <span className="h-1.5 w-10 rounded-full bg-border" />
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
