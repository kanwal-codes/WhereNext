import type { CSSProperties } from "react";
import { MODE_COLOR, MODE_ICON, MODE_SOFT } from "@/lib/application/mode-visuals";
import { cn } from "@/lib/utils";

export const colorOf = (mode: string) => MODE_COLOR[mode] ?? MODE_COLOR.unknown;

/** The stretch between two stops, drawn the way the map draws it: dots on foot, a ribbon by vehicle, dashes over water or air. */
export function railStyle(mode: string): CSSProperties {
  const c = colorOf(mode);
  if (mode === "walk") return { background: `radial-gradient(circle, ${c} 1.5px, transparent 1.8px) center top / 4px 8px repeat-y` };
  if (mode === "flight" || mode === "ferry") return { background: `repeating-linear-gradient(to bottom, ${c} 0 5px, transparent 5px 9px)`, borderRadius: 2 };
  return { background: c, borderRadius: 2 };
}

/** A short sample of a mode's line as the map draws it, for legends: dots on foot, a ribbon by vehicle with its own texture inside. */
export function modeSwatch(mode: string): CSSProperties {
  const c = colorOf(mode);
  if (mode === "walk") return { background: `radial-gradient(circle, ${c} 1.4px, transparent 1.7px) 0 center / 6px 6px repeat-x` };
  if (mode === "flight" || mode === "ferry") return { background: `repeating-linear-gradient(to right, ${c} 0 6px, transparent 6px 10px)` };
  if (mode === "train") return { background: `repeating-linear-gradient(to right, transparent 0 4px, rgb(255 255 255 / 0.9) 4px 6px), ${c}`, borderRadius: 3 };
  if (mode === "bus") return { background: `radial-gradient(circle, rgb(255 255 255 / 0.95) 1px, transparent 1.3px) 0 center / 6px 6px repeat-x, ${c}`, borderRadius: 3 };
  if (mode === "tram") return { background: `linear-gradient(rgb(255 255 255 / 0.9), rgb(255 255 255 / 0.9)) center / 100% 1.5px no-repeat, ${c}`, borderRadius: 3 };
  return { background: c, borderRadius: 3 };
}

export function ModeTile({ mode, size = "md" }: { mode: string; size?: "sm" | "md" }) {
  const Icon = MODE_ICON[mode] ?? MODE_ICON.unknown;
  return (
    <span
      className={cn("grid shrink-0 place-items-center", size === "md" ? "size-8 rounded-xl" : "size-6 rounded-lg")}
      style={{ background: MODE_SOFT[mode] ?? MODE_SOFT.unknown, color: colorOf(mode) }}
    >
      <Icon className={size === "md" ? "size-4" : "size-3.5"} aria-hidden="true" />
    </span>
  );
}


/** Where the time goes: one segment per hop, as wide as it takes. `dim` fades all but one hop (the one the pointer is on); `icons` puts the vehicle in each segment that is wide enough. */
export function Ribbon({ parts, dim = null, icons = false, className }: { parts: Array<{ mode: string; minutes: number; group?: number }>; dim?: number | null; icons?: boolean; className?: string }) {
  const shown = parts.filter((p) => p.minutes > 0);
  if (shown.length === 0) return null;
  const total = shown.reduce((t, p) => t + p.minutes, 0);
  return (
    <div className={cn("flex gap-[3px]", icons ? "h-7" : "h-2.5", className)} aria-hidden="true">
      {parts.map((p, i) => {
        if (p.minutes <= 0) return null;
        const Icon = MODE_ICON[p.mode] ?? MODE_ICON.unknown;
        const walking = p.mode === "walk";
        return (
          <span
            key={i}
            className={cn("grid min-w-1.5 place-items-center rounded-full transition-opacity duration-200", icons && "rounded-[10px]")}
            style={{ flex: `${p.minutes} 1 0`, opacity: dim == null || dim === (p.group ?? i) ? 1 : 0.28, background: walking ? "oklch(0.9 0.007 78)" : colorOf(p.mode), color: walking ? colorOf("walk") : "#fff" }}
          >
            {icons && p.minutes / total >= 0.1 && <Icon className="size-3.5" strokeWidth={2.1} />}
          </span>
        );
      })}
    </div>
  );
}

/** The vehicle a hop is mostly about: the longest ride in it, else the hop's own mode. */
export function mainMode(leg: { mode: string; steps: Array<{ mode: string; minutes: number }> }): string {
  const rides = leg.steps.filter((st) => st.mode !== "walk");
  if (rides.length === 0) return leg.mode;
  return rides.reduce((best, st) => (st.minutes > best.minutes ? st : best)).mode;
}

/** A hop's rail in the list: when it changes vehicle, the rail is split by how long each part takes, in each part's colour. */
export function legRailStyle(leg: { mode: string; steps: Array<{ mode: string; minutes: number }> }): CSSProperties {
  const parts = leg.steps.filter((st) => st.minutes > 0);
  if (parts.length < 2) return railStyle(leg.mode);
  const total = parts.reduce((t, st) => t + st.minutes, 0);
  let at = 0;
  const stops = parts.map((st) => {
    const from = (at / total) * 100;
    at += st.minutes;
    const c = st.mode === "walk" ? "oklch(0.84 0.007 78)" : colorOf(st.mode);
    return `${c} ${from.toFixed(1)}% ${((at / total) * 100).toFixed(1)}%`;
  });
  return { background: `linear-gradient(to bottom, ${stops.join(", ")})`, borderRadius: 2 };
}

/** Back-to-back walking steps are one walk (a road crossing, a platform change, a corner). */
export function mergeWalkSteps<T extends { mode: string; minutes: number }>(steps: T[]): T[] {
  const out: T[] = [];
  for (const st of steps) {
    const prev = out[out.length - 1];
    if (st.mode === "walk" && prev && prev.mode === "walk") out[out.length - 1] = { ...prev, minutes: prev.minutes + st.minutes, to: (st as { to?: string }).to ?? (prev as { to?: string }).to };
    else out.push(st);
  }
  return out;
}
