import type { RouteLeg } from "@/packages/contracts/route-plan";

export type LegOption = {
  mode: RouteLeg["mode"];
  minutes: number;
  km: number;
  fare: { amount: number; currency: string } | null;
  departure: string | null;
  arrival: string | null;
  steps: RouteLeg["steps"];
  polyline: RouteLeg["polyline"];
};

const PREFERENCE_ORDER: RouteLeg["mode"][] = ["transit", "bus", "subway", "tram", "train", "ferry", "walk", "drive", "unknown"];

/** Picks which computed option is "primary" for this leg: the rider's saved choice if it's
 * still available, else transit-first / driving-if-nothing-else. Everything not picked becomes
 * a lightweight alternative the rider can switch to. */
export function pickLegOption(options: LegOption[], chosenMode?: RouteLeg["mode"]) {
  const byPreference = [...options].sort((a, b) => PREFERENCE_ORDER.indexOf(a.mode) - PREFERENCE_ORDER.indexOf(b.mode));
  const picked = (chosenMode && options.find((o) => o.mode === chosenMode)) ?? byPreference[0];
  const transitFailed = !options.some((o) => o.mode !== "drive" && o.mode !== "walk");
  const note = !chosenMode && picked.mode === "drive" && transitFailed ? "No transit route found — driving time shown." : null;
  const alternatives = options.filter((o) => o !== picked).map(({ mode, minutes, km, fare }) => ({ mode, minutes, km, fare }));
  return { picked, note, alternatives };
}
