import length from "@turf/length";
import { lineString } from "@turf/helpers";

export type AnimatedLeg = { polyline: Array<[number, number]>; mode: string; dim?: boolean; color?: string };
export type LegLine = { line: ReturnType<typeof lineString>; mode: string; color?: string; dim?: boolean; startKm: number; endKm: number };

/** Per-leg cumulative distance along the concatenated path — lets the draw-in reveal and the
 * mode-icon marker both answer "how much of this leg is visible" / "which leg is this point in". */
export function legLines(legList: AnimatedLeg[]): { legs: LegLine[]; totalKm: number } {
  let cursor = 0;
  const legs: LegLine[] = [];
  for (const l of legList) {
    if (l.polyline.length < 2) continue;
    const line = lineString(l.polyline);
    const km = length(line, { units: "kilometers" }) || 0.001;
    legs.push({ line, mode: l.mode, color: l.color, dim: l.dim, startKm: cursor, endKm: cursor + km });
    cursor += km;
  }
  return { legs, totalKm: cursor || 0.001 };
}

/** Cheap identity check — a genuinely new route (not just a `dim` flag changing on hover) gets
 * the progressive draw-in; the same route re-rendered does not restart it. */
export const routeKeyFor = (legList: AnimatedLeg[]) =>
  legList.map((l) => `${l.mode}:${l.polyline[0]}:${l.polyline[l.polyline.length - 1]}:${l.polyline.length}`).join("|");

export const easeOutQuad = (t: number) => 1 - (1 - t) ** 2;
