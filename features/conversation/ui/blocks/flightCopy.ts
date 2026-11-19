import { formatDuration } from "@/lib/application/flight-risks";
import type { Tradeoff } from "@/lib/application/flight-tradeoff";

/** "Air Canada · SWISS" → "Air Canada +1", "Air Canada + 2 more" → "Air Canada +2": a name that fits a tile. */
export function shortAirline(name: string): string {
  const parts = name.split(/\s*(?:·|,|\+)\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return name;
  const extra = parts.slice(1).reduce((n, p) => n + (/^\d+\s+more$/i.test(p) ? Number(p.match(/\d+/)![0]) : 1), 0);
  return `${parts[0]} +${extra}`;
}

export type BoardItem = { icon: "wifi" | "power" | "video" | "other"; text: string };

/** What Google lists as on board, said the way a traveller would ("Wi-Fi for a fee" → "Wi-Fi (paid)"). */
export function boardItem(listed: string): BoardItem {
  if (/free wi-?fi/i.test(listed)) return { icon: "wifi", text: "Free Wi-Fi" };
  if (/wi-?fi/i.test(listed)) return { icon: "wifi", text: "Wi-Fi (paid)" };
  if (/power.*usb|usb.*power/i.test(listed)) return { icon: "power", text: "Power and USB at your seat" };
  if (/power/i.test(listed)) return { icon: "power", text: "Power at your seat" };
  if (/usb/i.test(listed)) return { icon: "power", text: "USB at your seat" };
  if (/video|entertain|stream|screen/i.test(listed)) return { icon: "video", text: /on-demand video/i.test(listed) ? "On-demand video" : listed };
  return { icon: "other", text: listed };
}

/** The one sentence under the picks: what the cheapest saves and what it costs in time. Null when one fare is both. */
export function tradeoffText(t: Tradeoff, currency: string, fmt: (amount: number, currency: string) => string): string | null {
  if (t.same) return null;
  const vs = t.fastestIsNonstop ? "the nonstop" : "the fastest";
  const less = `${fmt(Math.round(t.saves), currency)} (${t.savesPct}%)`;
  const time = formatDuration(t.extraMinutes);
  if (t.verdict === "not slower") return `The cheapest is ${less} less than ${vs}, and no slower.`;
  if (t.verdict === "small saving") return `The cheapest is only ${less} less than ${vs}, and takes ${time} longer.`;
  return `The cheapest is ${less} less than ${vs}, but takes ${time} longer.`;
}
