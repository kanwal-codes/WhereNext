/**
 * Today's date (YYYY-MM-DD) where the visitor is, read from Vercel's geo-IP timezone header. "Tomorrow" and "this weekend" are
 * worked out from it, so a plain UTC date puts them a day off for hours every evening in the Americas and every morning in
 * Asia and Oceania. Without the header (local dev, other hosts) or with an unreadable zone it is the UTC date, as before.
 */
export function localToday(headers: Headers, now: Date = new Date()): string {
  const raw = headers.get("x-vercel-ip-timezone");
  if (raw) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: decodeURIComponent(raw) }).format(now);
    } catch {
      // an unknown zone name: fall through to UTC
    }
  }
  return now.toISOString().slice(0, 10);
}
