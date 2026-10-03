/**
 * Small pure helpers behind a trip's cover on the home screen: what the type-led "boarding pass"
 * fallback says, and which saved place's photo stands in when the destination has none.
 */

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

/** "Lisbon, Portugal" -> city "Lisbon", country "Portugal". With no destination, the trip's name stands in. */
export function coverText(trip: { name: string; destination: string | null }): { city: string; country: string } {
  const parts = (trip.destination ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return { city: trip.name, country: "" };
  return { city: parts[0]!, country: parts.length > 1 ? parts[parts.length - 1]! : "" };
}

/**
 * The size the city is set in, so a long name still fits its panel. Two limits apply and the smaller
 * size wins: the whole name (it wraps across lines, up to two) and its longest single word (a word
 * cannot wrap, so "Montreal" at the largest size runs under the date stamp).
 */
export function cityScale(city: string): "lg" | "md" | "sm" {
  const rank = { lg: 0, md: 1, sm: 2 } as const;
  const total = city.length <= 8 ? "lg" : city.length <= 13 ? "md" : "sm";
  const longest = Math.max(0, ...city.split(/\s+/).map((word) => word.length));
  const word = longest <= 6 ? "lg" : longest <= 9 ? "md" : "sm";
  return rank[word] > rank[total] ? word : total;
}

/** "2026-10-12" -> { month: "OCT", day: "12" } for the date stamp. Read straight off the string, so no timezone can shift the day. */
export function stampParts(startDate: string | null | undefined): { month: string; day: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate ?? "");
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return null;
  return { month, day: String(Number(match[3])) };
}

type SavedPhotoRow = {
  trip_id: string;
  places: { metadata?: unknown } | Array<{ metadata?: unknown }> | null;
};

/** The first photo name found on each trip's saved places. Rows are expected newest-first, so the most recently saved place with a photo wins. */
export function firstSavedPhotoByTrip(rows: SavedPhotoRow[]): Map<string, string> {
  const byTrip = new Map<string, string>();
  for (const row of rows) {
    if (byTrip.has(row.trip_id)) continue;
    const place = Array.isArray(row.places) ? row.places[0] : row.places;
    const names = (place?.metadata as { photoNames?: unknown } | undefined)?.photoNames;
    const first = Array.isArray(names) ? names.find((name): name is string => typeof name === "string" && name.length > 0) : undefined;
    if (first) byTrip.set(row.trip_id, first);
  }
  return byTrip;
}
