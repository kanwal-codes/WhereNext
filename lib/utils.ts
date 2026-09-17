import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** React doesn't block a `javascript:`/`data:` href on an `<a>` — only warns. Use for any link
 *  built from provider/AI-composed data (a place's website, an event's ticket URL) before handing
 *  it to `href`, so a non-http value renders as a dead (non-navigable) link instead of a live one. */
export function safeHref(url: string | null | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url.trim()) ? url : undefined;
}

/** Human travel time: "45 min", "1 h 20 min", "2 h". Accepts minutes; use `fromSeconds` for seconds. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} h ${rem} min` : `${h} h`;
}
export const durationFromSeconds = (seconds: number) => formatDuration(seconds / 60);
