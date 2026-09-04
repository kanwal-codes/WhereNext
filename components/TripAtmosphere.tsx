"use client";

import { useEffect } from "react";

/**
 * The contextual "atmosphere" accent for a trip. A curated palette keyed off the
 * destination (with a quiet seasonal fallback), written to `--accent-trip` /
 * `--accent-trip-soft` on <html> as `light-dark()` pairs so it tracks the theme with no
 * JS. Deliberately small and clamped — a bright building never turns the app pink. The
 * core UI stays neutral; only hero washes, the active-nav rule, recommendation labels,
 * selected states and decorative rules read this token.
 */
type Accent = { light: [accent: string, soft: string]; dark: [accent: string, soft: string] };

const P = {
  pink: { light: ["oklch(0.7 0.11 350)", "oklch(0.95 0.03 350)"], dark: ["oklch(0.78 0.1 350)", "oklch(0.32 0.06 350)"] },
  slate: { light: ["oklch(0.58 0.09 245)", "oklch(0.95 0.025 245)"], dark: ["oklch(0.72 0.1 245)", "oklch(0.3 0.05 245)"] },
  amber: { light: ["oklch(0.66 0.14 70)", "oklch(0.95 0.04 70)"], dark: ["oklch(0.78 0.13 70)", "oklch(0.32 0.06 70)"] },
  terracotta: { light: ["oklch(0.62 0.13 40)", "oklch(0.95 0.035 40)"], dark: ["oklch(0.74 0.12 40)", "oklch(0.32 0.06 40)"] },
  burgundy: { light: ["oklch(0.5 0.13 15)", "oklch(0.94 0.03 15)"], dark: ["oklch(0.66 0.14 15)", "oklch(0.3 0.06 15)"] },
  tropical: { light: ["oklch(0.6 0.12 155)", "oklch(0.94 0.035 155)"], dark: ["oklch(0.72 0.11 155)", "oklch(0.3 0.05 155)"] },
  ice: { light: ["oklch(0.63 0.08 230)", "oklch(0.95 0.025 230)"], dark: ["oklch(0.74 0.09 230)", "oklch(0.3 0.05 230)"] },
  olive: { light: ["oklch(0.56 0.1 110)", "oklch(0.94 0.03 110)"], dark: ["oklch(0.7 0.1 110)", "oklch(0.3 0.05 110)"] },
} satisfies Record<string, Accent>;

const DEST: Array<[RegExp, Accent]> = [
  [/kyoto|osaka|tokyo|japan|seoul|korea/i, P.pink],
  [/iceland|reykjav|troms|svalbard|greenland/i, P.slate],
  [/lisbon|porto|portugal|barcelona|valencia|athens|greece|malta/i, P.terracotta],
  [/bali|lombok|thailand|bangkok|vietnam|hanoi|indonesia|philippines|sri lanka/i, P.tropical],
  [/paris|lyon|bordeaux|france|vienna|prague|budapest/i, P.burgundy],
  [/alps|zermatt|chamonix|interlaken|switzerland|swiss|dolomites|banff|whistler/i, P.ice],
  [/new york|nyc|manhattan|brooklyn|chicago|toronto|montreal|montréal|boston/i, P.slate],
  [/marrakech|morocco|cairo|egypt|dubai|jordan|petra/i, P.amber],
];

function seasonAccent(month: number): Accent | null {
  if (month === 11 || month === 0 || month === 1) return P.ice; // Dec–Feb
  if (month >= 2 && month <= 4) return P.tropical; // Mar–May, soft green
  if (month >= 8 && month <= 10) return P.olive; // Sep–Nov, rust/olive
  return null; // summer stays coral
}

export function TripAtmosphere({ destination, month }: { destination?: string | null; month?: number | null }) {
  useEffect(() => {
    const d = (destination ?? "").toLowerCase();
    const hit =
      DEST.find(([re]) => re.test(d))?.[1] ?? (month != null && Number.isFinite(month) ? seasonAccent(month) : null);
    const root = document.documentElement;
    if (!hit) {
      root.style.removeProperty("--accent-trip");
      root.style.removeProperty("--accent-trip-soft");
      return;
    }
    root.style.setProperty("--accent-trip", `light-dark(${hit.light[0]}, ${hit.dark[0]})`);
    root.style.setProperty("--accent-trip-soft", `light-dark(${hit.light[1]}, ${hit.dark[1]})`);
    return () => {
      root.style.removeProperty("--accent-trip");
      root.style.removeProperty("--accent-trip-soft");
    };
  }, [destination, month]);
  return null;
}
