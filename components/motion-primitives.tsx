"use client";

import { googlePhotoSrc } from "@/lib/hotel-photo";
import React from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type HTMLMotionProps,
} from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "@/lib/utils";

/** Same curve as `--ease-out` in globals.css: fast arrival, long soft settle. */
export const ease = [0.22, 1, 0.36, 1] as const;

/**
 * One motion vocabulary for the whole app. Reach for these instead of hand-typing a
 * `{ type: "spring", stiffness: … }` literal.
 *  - `fast`   — hover / press / colour / icon / small toggles (160–200ms)
 *  - `swap`   — a content crossfade inside a stable surface
 *  - `drawer` — sheets / drawers opening and closing (260–360ms)
 *  - `panelSpring` — panels and sheets entering / leaving with a little life, no bounce
 *  - `standard`    — the general-purpose layout spring (label = the old `spring`)
 */
export const motionTokens = {
  fast: { duration: 0.16, ease },
  swap: { duration: 0.24, ease },
  drawer: { duration: 0.36, ease },
  panelSpring: { type: "spring" as const, stiffness: 260, damping: 30, mass: 0.85 },
  standard: { type: "spring" as const, stiffness: 260, damping: 28, mass: 0.9 },
  /** Hover-lift / press-in on a card or button — what `Tactile` uses internally. */
  lift: { type: "spring" as const, stiffness: 420, damping: 34 },
};

/** @deprecated prefer `motionTokens.standard` — kept so existing imports keep working. */
export const spring = motionTokens.standard;

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

/**
 * Whether an entrance should play. Entrances are JS/RAF-driven, so a tab loading in the background would
 * leave `initial` (opacity 0) content stuck invisible, and SSR must not ship a hidden first paint: false on
 * the server, through hydration, and in a hidden tab, so that content just appears in place.
 *
 * Read synchronously on a client mount. It used to start false everywhere and flip in an effect, and every
 * wrapper below swapped a `div` for a `motion.div` when it flipped: React rebuilt the whole subtree right
 * after it mounted, which doubled the render work as a panel or page opened and ran every effect inside it
 * (fetches included) twice, in production.
 */
export function useAnimateIn(): boolean {
  const reduce = useReducedMotion();
  const visible = useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => false);
  return visible && !reduce;
}

/**
 * The wrappers keep one element type whatever `useAnimateIn` says, so their subtree never remounts. `initial`
 * is read only on mount: content that mounted while it was false (hydration, a hidden tab) stays settled
 * instead of replaying an entrance later.
 */
export function Reveal({
  children,
  delay = 0,
  y = 14,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const on = useAnimateIn();
  return (
    <motion.div
      className={className}
      initial={on ? { opacity: 0, y } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({
  children,
  className,
  delay = 0,
  gap = 0.06,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  gap?: number;
}) {
  const on = useAnimateIn();
  return (
    <motion.div
      className={className}
      initial={on ? "hidden" : false}
      animate="shown"
      variants={{
        hidden: {},
        shown: { transition: { staggerChildren: gap, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  );
}

/** Alias — the semantic name for `Stagger` when it wraps a group of `StaggerItem`s. */
export const StaggerGroup = Stagger;

export function StaggerItem({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & HTMLMotionProps<"div">) {
  // No `initial` of its own: a parent `Stagger` whose `initial` is false settles its items too.
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 16 },
        shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * A thing that rises and fades in when it first appears. `live` is false for restored content, which
 * should settle in place rather than replay; `index` staggers siblings (capped, so a long list never lags).
 */
export function Enter({ live = true, index = 0, y = 10, className, children }: { live?: boolean; index?: number; y?: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={live && !reduce ? { opacity: 0, y } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...motionTokens.swap, delay: Math.min(index, 6) * 0.06 }}
    >
      {children}
    </motion.div>
  );
}

/** Headline reveal: words rise in sequence from behind a mask. */
export function WordReveal({
  text,
  className,
  delay = 0,
  as: Tag = "h1",
}: {
  text: string;
  className?: string;
  delay?: number;
  as?: "h1" | "h2" | "h3" | "p";
}) {
  const on = useAnimateIn();
  const words = text.split(" ");
  if (!on) return <Tag className={className}>{text}</Tag>;

  return (
    <Tag className={className}>
      <motion.span
        className="inline"
        initial="hidden"
        animate="shown"
        variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.055, delayChildren: delay } } }}
      >
        {words.map((word, i) => (
          <span key={`${word}-${i}`} className="inline-block">
            {/* pad the clip box so descenders (g, y, p) aren't cut with tight line-heights; negative margin keeps layout unchanged */}
            <span className="inline-block overflow-hidden align-bottom pb-[0.22em] -mb-[0.22em]">
              <motion.span
                className="inline-block"
                variants={{
                  hidden: { y: "108%", opacity: 1 },
                  shown: { y: "0%", opacity: 1, transition: { duration: 0.7, ease } },
                }}
              >
                {word}
              </motion.span>
            </span>
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}

/** Press + hover feedback for buttons, cards and links. Honours reduced-motion. */
export function Tactile({
  children,
  className,
  lift = 2,
  ...rest
}: { children: ReactNode; className?: string; lift?: number } & HTMLMotionProps<"div">) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <motion.div className={className} {...rest}>
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={className}
      whileHover={{ y: -lift }}
      whileTap={{ scale: 0.985 }}
      transition={motionTokens.lift}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * The one tactile primitive for an interactive element (a `<button>`, `<a>`, etc.).
 * Subtle lift on hover, a real 2% squeeze on press. Reduced-motion → nothing.
 * Pass the element type via `as` is not supported — render your control as the child
 * of `<Pressable asChild>` style is also out; instead use `motion.button`/`motion.a`
 * directly where you need the tag, or wrap non-critical controls in this.
 */
export function Pressable({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & HTMLMotionProps<"span">) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className={cn("inline-flex", className)}
      {...(reduce
        ? {}
        : {
            whileHover: { y: -1 },
            whileTap: { scale: 0.98 },
            transition: motionTokens.fast,
          })}
      {...rest}
    >
      {children}
    </motion.span>
  );
}

/**
 * Crossfade one keyed view into the next inside a surface that itself stays put.
 * `key` change → old fades/slides out, new fades/slides in. Reduced-motion → instant.
 */
export function ContentSwap({
  swapKey,
  className,
  children,
}: {
  swapKey: string;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={swapKey}
        className={className}
        initial={reduce ? false : { opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={reduce ? undefined : { opacity: 0, x: -6 }}
        transition={reduce ? { duration: 0 } : motionTokens.swap}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Modal focus plumbing shared by the panel and the mobile nav: focus moves into the
 * dialog on open, `Escape` closes it, the page scroll locks, focus returns to whatever
 * opened it on close, and Tab is kept inside the container.
 */
export function useFocusReturn(
  active: boolean,
  onEscape?: () => void,
  container?: RefObject<HTMLElement | null>,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  // A ref, not a dependency: callers almost always pass an inline `() => ...` for onEscape,
  // a fresh function every render. If that sat in the effect's own deps, typing anywhere
  // inside the panel (which re-renders the caller on every keystroke) would re-run this
  // whole effect mid-type — re-focusing the panel's first focusable element and yanking
  // focus out of whatever was just typed into.
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // `overflow: hidden` alone stops desktop wheel-scroll but not touch-scroll on mobile
    // Safari, which still rubber-bands the body underneath a fixed overlay — pinning the
    // body in place (and restoring the scroll position on close) blocks both.
    const scrollY = window.scrollY;
    const body = document.body.style;
    const prev = { position: body.position, top: body.top, width: body.width, overflow: body.overflow };
    body.position = "fixed";
    body.top = `-${scrollY}px`;
    body.width = "100%";
    body.overflow = "hidden";

    const focusables = () =>
      Array.from(
        container?.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,select,summary,[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !container?.current) return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Two frames: the presence child needs to commit before it (and its ref) exist.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const target = initialFocus?.current ?? focusables()[0] ?? container?.current ?? null;
        target?.focus?.({ preventScroll: true } as FocusOptions);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      body.position = prev.position;
      body.top = prev.top;
      body.width = prev.width;
      body.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [active, container, initialFocus]);
}

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
  useFocusReturn(open, onClose, panelRef, initialFocus);

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
            "fixed inset-0 z-50 flex bg-black/40 backdrop-blur-[2px]",
            side === "center" ? "items-center justify-center p-4" : side === "bottom" ? "items-end" : side === "right" ? "justify-end" : "justify-start",
          )}
          initial={{ opacity: 0, pointerEvents: "none" }}
          animate={{ opacity: 1, pointerEvents: "auto" }}
          // `pointerEvents: "none"` lands the instant the exit starts (Framer applies a
          // non-animatable value immediately, not interpolated) — an invisible backdrop
          // fading out, or ever stuck mid-exit for any reason, must never keep swallowing
          // clicks across the whole viewport while it's not actually open.
          exit={{ opacity: 0, pointerEvents: "none" }}
          transition={reduce ? { duration: 0 } : motionTokens.fast}
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            tabIndex={-1}
            className={cn(
              "relative flex min-h-0 flex-col bg-surface shadow-lift outline-none",
              side === "center" ? "w-full max-w-sm rounded-3xl" : side === "bottom" ? "max-h-[92dvh] w-full rounded-t-3xl" : "h-full w-full max-w-xl",
              className,
            )}
            initial={reduce ? false : closed}
            animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            exit={reduce ? undefined : closed}
            transition={reduce ? { duration: 0 } : motionTokens.panelSpring}
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

/**
 * Consistent page-entry wrapper — a thin component over the `route-enter` CSS utility
 * (opacity + de-blur, ~0.34s) so pages don't hand-apply the class. CSS-only, so it
 * respects `prefers-reduced-motion` via the global clamp.
 */
export function RouteTransition({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("route-enter", className)}>{children}</div>;
}

/** Image that resolves out of a soft blur instead of popping in. */
export function BlurImage({
  src,
  alt,
  className,
  ...rest
}: { src: string; alt: string; className?: string } & React.ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  // A cached image is already `complete` by the time this ref callback runs, so the
  // `load` event below never fires again — without this check the image stays stuck
  // at opacity-0 on every repeat visit (only a first, uncached load ever showed it).
  const checkLoaded = (img: HTMLImageElement | null) => {
    if (img?.complete) setLoaded(true);
  };
  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative, arbitrary sources
    <img
      ref={checkLoaded}
      src={googlePhotoSrc(src)}
      alt={alt}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      className={cn(
        // Opacity + a hair of scale only. This used to blur-xl -> blur-0: animating a blur is repaint-heavy, and a
        // resting `filter: blur(0)` keeps every photo on its own filtered layer — dozens of them in a long chat.
        "transition-[opacity,transform] duration-500 ease-out",
        loaded ? "scale-100 opacity-100" : "scale-[1.02] opacity-0",
        className,
      )}
      {...rest}
    />
  );
}
