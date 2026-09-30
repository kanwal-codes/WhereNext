/**
 * Links that open a restaurant booking site with the details already entered. The traveller finishes
 * the booking there themselves: nothing here books anything or talks to the booking site.
 */

export type TableSearch = { name: string; city?: string | null; date?: string | null; time?: string | null; party?: number | null };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^[0-2]\d:[0-5]\d$/;

export const DEFAULT_TABLE_TIME = "19:30";

/** OpenTable's search page, with the restaurant, party size and date/time filled in. */
export function openTableUrl({ name, city, date, time, party }: TableSearch): string {
  const url = new URL("https://www.opentable.com/s");
  const term = [name.trim(), city?.trim()].filter(Boolean).join(" ");
  if (term) url.searchParams.set("term", term);
  if (party && Number.isInteger(party) && party >= 1 && party <= 20) url.searchParams.set("covers", String(party));
  if (date && DAY.test(date)) url.searchParams.set("dateTime", `${date}T${time && CLOCK.test(time) ? time : DEFAULT_TABLE_TIME}`);
  return url.toString();
}

/** A Google Maps search for the restaurant, for places OpenTable does not cover. */
export function mapsSearchUrl({ name, city }: Pick<TableSearch, "name" | "city">): string {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", [name.trim(), city?.trim()].filter(Boolean).join(", "));
  return url.toString();
}
