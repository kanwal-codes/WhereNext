const SELLERS: Array<[string, string]> = [
  ["seatgeek", "SeatGeek"], ["vividseats", "Vivid Seats"], ["ticketmaster", "Ticketmaster"],
  ["eventbrite", "Eventbrite"], ["axs", "AXS"], ["dice.fm", "DICE"], ["dice", "DICE"],
  ["universe", "Universe"], ["showclix", "ShowClix"],
];

/** Returns a seller users can actually buy from; unrecognized sources are never surfaced. */
export function ticketSellerLabel(source?: string | null, url?: string | null): string | null {
  const haystack = `${source ?? ""} ${url ?? ""}`.toLowerCase();
  if (!haystack) return null;
  return SELLERS.find(([key]) => haystack.includes(key))?.[1] ?? null;
}
