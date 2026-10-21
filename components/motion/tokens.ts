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
