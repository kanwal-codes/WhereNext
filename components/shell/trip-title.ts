/**
 * A trip is often named after its whole route ("Toronto → New York → Rome → Paris → Amsterdam → London"), which does not
 * fit a phone header. With three or more stops it becomes "first → last"; anything else is shown as it is.
 */
export function shortTripTitle(name: string): string {
  const stops = name.split(/\s*(?:→|->|—>|➝)\s*/).map((s) => s.trim()).filter(Boolean);
  return stops.length >= 3 ? `${stops[0]} → ${stops[stops.length - 1]}` : name;
}
