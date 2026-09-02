type Point = { latitude: number; longitude: number };

/** Straight-line distance in km. A rough proxy for "how close" — not travel time. */
export function haversineKm(a: Point, b: Point): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nearest of `targets` to `from`, with its straight-line distance, or null if none have coordinates. */
export function nearest<T extends Point & { title: string }>(from: Point, targets: T[]): { target: T; km: number } | null {
  let best: { target: T; km: number } | null = null;
  for (const target of targets) {
    if (!Number.isFinite(target.latitude) || !Number.isFinite(target.longitude)) continue;
    const km = haversineKm(from, target);
    if (!best || km < best.km) best = { target, km };
  }
  return best;
}
