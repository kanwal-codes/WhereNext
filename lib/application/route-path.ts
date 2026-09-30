/** Thin a route's coordinates to at most `max` points (endpoints kept, 5 decimals ≈ 1 m) so a map can draw it from a chat reply. */
export function simplifyPath(points: Array<[number, number]> | undefined, max = 60): Array<[number, number]> | undefined {
  if (!points || points.length < 2) return undefined;
  const round = (n: number) => Math.round(n * 1e5) / 1e5;
  const keep = points.length <= max ? points : Array.from({ length: max }, (_, i) => points[Math.round((i * (points.length - 1)) / (max - 1))]);
  return keep.map(([lng, lat]) => [round(lng), round(lat)]);
}
