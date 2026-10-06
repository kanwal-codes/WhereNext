/** Thin a route's coordinates to at most `max` points (endpoints kept, 5 decimals ≈ 1 m) so a map can draw it from a chat reply. */
export function simplifyPath(points: Array<[number, number]> | undefined, max = 60): Array<[number, number]> | undefined {
  if (!points || points.length < 2) return undefined;
  const round = (n: number) => Math.round(n * 1e5) / 1e5;
  const keep = points.length <= max ? points : Array.from({ length: max }, (_, i) => points[Math.round((i * (points.length - 1)) / (max - 1))]);
  return keep.map(([lng, lat]) => [round(lng), round(lat)]);
}

type PartInput = { mode: string; durationSeconds: number; line?: string; color?: string; departureStop?: string; arrivalStop?: string; polyline?: Array<[number, number]> };
export type LegPart = { mode: string; minutes: number; from?: string; to?: string; line?: string; color?: string; traffic?: string; path: Array<[number, number]> };

/** A transit plan's steps as drawable parts: each in its own mode, back-to-back walks as one, every line thinned to fit a chat reply. */
export function transitParts(steps: PartInput[], max = 24): LegPart[] {
  const parts: LegPart[] = [];
  for (const st of steps) {
    const path = simplifyPath(st.polyline, max);
    if (!path) continue;
    const mode = st.mode.toLowerCase();
    const prev = parts[parts.length - 1];
    if (mode === "walk" && prev?.mode === "walk") {
      prev.minutes += st.durationSeconds / 60;
      prev.to = st.arrivalStop ?? prev.to;
      prev.path = simplifyPath([...prev.path, ...path], max) ?? prev.path;
      continue;
    }
    parts.push({ mode, minutes: st.durationSeconds / 60, ...(st.departureStop ? { from: st.departureStop.slice(0, 80) } : {}), ...(st.arrivalStop ? { to: st.arrivalStop.slice(0, 80) } : {}), ...(st.line ? { line: st.line.slice(0, 24) } : {}), ...(st.color ? { color: st.color.slice(0, 9) } : {}), path });
  }
  return parts.slice(0, 24).map((p) => ({ ...p, minutes: Math.round(p.minutes * 10) / 10 }));
}

/** A drive as parts: one per stretch of the same congestion, so a jam shows on the line. Too many stretches → one plain line. */
export function driveParts(coords: Array<[number, number]>, runs: Array<{ level: string; polyline: Array<[number, number]>; km: number }>, minutes: number): LegPart[] {
  const whole = simplifyPath(coords, 60);
  if (!whole) return [];
  const total = runs.reduce((t, r) => t + r.km, 0) || 1;
  const busy = runs.some((r) => r.level === "moderate" || r.level === "heavy" || r.level === "severe");
  if (!busy || runs.length > 24) return [{ mode: "drive", minutes, path: whole }];
  return runs.flatMap((r) => {
    const path = simplifyPath(r.polyline, 40);
    return path ? [{ mode: "drive", minutes: Math.round((minutes * r.km) / total * 10) / 10, ...(r.level === "low" || r.level === "unknown" ? {} : { traffic: r.level }), path }] : [];
  });
}
