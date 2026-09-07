export type NearbyEvent = { title: string; url: string; date?: string; venue?: string; source: string; imageUrl?: string };

export const presentEvent = (event: NearbyEvent): NearbyEvent => ({
  ...event,
  date: event.date?.trim() || "Date to be confirmed",
  venue: event.venue?.trim() || "Venue to be confirmed",
});

/** Interleave Ticketmaster + Eventbrite results, dropping a provider's listing of the SAME real
 *  event (same title, same date) — a popular show is often cross-listed on both platforms, and
 *  without this it renders twice in "Nearby events" with two different ticket links. */
export function mergeEventSources(tmList: NearbyEvent[], ebList: NearbyEvent[]): NearbyEvent[] {
  const seen = new Set<string>();
  const key = (e: NearbyEvent) => `${e.title.trim().toLowerCase()}|${(e.date ?? "").trim()}`;
  const list: NearbyEvent[] = [];
  for (let i = 0; i < Math.max(tmList.length, ebList.length); i += 1) {
    for (const event of [tmList[i], ebList[i]]) {
      if (!event) continue;
      const k = key(event);
      if (seen.has(k)) continue;
      seen.add(k);
      list.push(event);
    }
  }
  return list;
}
