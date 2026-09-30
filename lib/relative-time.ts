const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [["year", 365 * 86_400], ["month", 30 * 86_400], ["week", 7 * 86_400], ["day", 86_400]];

/** "3 months ago", "2 weeks ago", "yesterday": how place reviews already read, for any ISO date. Empty for an unparsable date. */
export function relativeDate(iso: string, now = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return "today";
}
