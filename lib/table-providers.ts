import { mapsSearchUrl, openTableUrl, type TableSearch } from "@/lib/table-links";

/**
 * Where to book a table, for a restaurant in a given country. Nothing here books anything: every
 * option opens a site or the phone app and the traveller finishes there.
 *
 * Three kinds of option, most to least helpful:
 *   direct    call the place, open its own website, open it on Google Maps (works in every country)
 *   prefilled a booking site whose link takes the restaurant, party size, date and time (OpenTable)
 *   popular   well-used booking sites for the country, opened on their front page, NOT prefilled
 *
 * Only `prefilled` ever claims to fill anything in. `PREFILLED_COUNTRIES` and `POPULAR` are the two
 * lists to edit when a site changes or a country is wrong; they are data, not logic.
 */

/** Countries where OpenTable takes bookings. Checked by hand, so keep it short and only add what has been confirmed. */
export const PREFILLED_COUNTRIES: readonly string[] = ["US", "CA", "MX", "GB", "IE", "DE", "JP", "AU", "SG", "HK", "AE"];

export type PopularSite = { id: string; name: string; url: string; countries: readonly string[] };

/** Front pages only: the traveller searches for the restaurant there. */
export const POPULAR: readonly PopularSite[] = [
  { id: "catchtable", name: "CatchTable", url: "https://www.catchtable.co.kr/", countries: ["KR"] },
  { id: "naver", name: "Naver Map", url: "https://map.naver.com/", countries: ["KR"] },
  { id: "tabelog", name: "Tabelog", url: "https://tabelog.com/en/", countries: ["JP"] },
  { id: "tablecheck", name: "TableCheck", url: "https://www.tablecheck.com/", countries: ["JP", "KR", "SG", "HK", "TH", "TW", "MY", "ID"] },
  { id: "thefork", name: "TheFork", url: "https://www.thefork.com/", countries: ["FR", "IT", "ES", "PT", "BE", "NL", "CH", "AT", "SE", "DK", "NO", "FI", "GR", "LU"] },
  { id: "quandoo", name: "Quandoo", url: "https://www.quandoo.com/", countries: ["GB", "DE", "IT", "NL", "FR", "AU", "SG", "FI", "SE", "DK", "PL", "AT", "CH"] },
  { id: "chope", name: "Chope", url: "https://www.chope.co/", countries: ["SG", "HK", "TH", "ID", "MY", "CN"] },
  { id: "eatapp", name: "Eat App", url: "https://eatapp.co/", countries: ["AE", "SA", "QA", "KW", "BH", "OM", "EG", "JO", "LB", "TR", "MA"] },
  { id: "resy", name: "Resy", url: "https://resy.com/", countries: ["US", "CA", "GB", "AU"] },
  { id: "zomato", name: "Zomato", url: "https://www.zomato.com/", countries: ["IN", "AE", "LK", "NZ", "PH"] },
];

const COUNTRY_CODES: Record<string, string> = {
  "united states": "US", usa: "US", "united states of america": "US", us: "US", canada: "CA", mexico: "MX", "united kingdom": "GB", uk: "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB", ireland: "IE",
  france: "FR", germany: "DE", italy: "IT", spain: "ES", portugal: "PT", belgium: "BE", netherlands: "NL", "the netherlands": "NL", switzerland: "CH", austria: "AT", sweden: "SE", denmark: "DK", norway: "NO", finland: "FI", greece: "GR", luxembourg: "LU", poland: "PL", hungary: "HU", czechia: "CZ", "czech republic": "CZ",
  japan: "JP", "south korea": "KR", korea: "KR", "republic of korea": "KR", china: "CN", "hong kong": "HK", taiwan: "TW", singapore: "SG", thailand: "TH", malaysia: "MY", indonesia: "ID", philippines: "PH", vietnam: "VN", india: "IN", "sri lanka": "LK",
  "united arab emirates": "AE", uae: "AE", "saudi arabia": "SA", qatar: "QA", kuwait: "KW", bahrain: "BH", oman: "OM", egypt: "EG", jordan: "JO", lebanon: "LB", turkey: "TR", türkiye: "TR", morocco: "MA",
  australia: "AU", "new zealand": "NZ",
};

// A destination typed without its country ("Tokyo") still says where it is.
const CITY_CODES: Record<string, string> = {
  tokyo: "JP", kyoto: "JP", osaka: "JP", seoul: "KR", busan: "KR", dubai: "AE", "abu dhabi": "AE", doha: "QA", riyadh: "SA", singapore: "SG", "hong kong": "HK", bangkok: "TH", taipei: "TW", "kuala lumpur": "MY", bali: "ID", jakarta: "ID", mumbai: "IN", delhi: "IN", "new delhi": "IN",
  paris: "FR", london: "GB", rome: "IT", madrid: "ES", barcelona: "ES", lisbon: "PT", porto: "PT", amsterdam: "NL", berlin: "DE", "new york": "US", "los angeles": "US", "san francisco": "US", toronto: "CA", montreal: "CA", vancouver: "CA", sydney: "AU", melbourne: "AU", istanbul: "TR", cairo: "EG", marrakech: "MA",
};

/** The ISO country code for "Lisbon, Portugal", a full street address ending in its country, or "Tokyo"; null when we can't tell. */
export function countryCodeFor(text: string | null | undefined): string | null {
  const parts = (text ?? "").split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return null;
  return COUNTRY_CODES[parts[parts.length - 1]!] ?? COUNTRY_CODES[parts[0]!] ?? CITY_CODES[parts[0]!] ?? null;
}

/** What Google knows about the chosen restaurant, when it was picked from a search. */
export type TablePlace = { name: string; address?: string | null; phone?: string | null; websiteUri?: string | null; mapsUrl?: string | null; reservable?: boolean | null };

export type TableOptions = {
  code: string | null;
  call: { label: string; href: string } | null;
  website: string | null;
  maps: string;
  /** True when Google lists the place as taking reservations: its Maps page then has a Reserve button. */
  mapsReserve: boolean;
  prefilled: { name: string; url: string } | null;
  popular: Array<{ id: string; name: string; url: string }>;
};

/** A `tel:` link from a phone number as Google writes it ("+351 21 888 1377" or "(212) 555-0100"), or null if it has no digits. */
export function telHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  return /\d{5,}/.test(digits) ? `tel:${digits}` : null;
}

/** An http(s) link, or null: a website string from outside is never trusted as a link. */
function safeHttp(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

export function tableOptions(search: TableSearch, destination: string | null | undefined, place?: TablePlace | null): TableOptions {
  // The restaurant's own address is the best evidence of its country; the trip's destination is the fallback.
  const code = countryCodeFor(place?.address) ?? countryCodeFor(destination);
  const tel = telHref(place?.phone);
  return {
    code,
    call: tel && place?.phone ? { label: place.phone, href: tel } : null,
    website: safeHttp(place?.websiteUri),
    maps: safeHttp(place?.mapsUrl) ?? mapsSearchUrl(search),
    mapsReserve: place?.reservable === true,
    prefilled: code && PREFILLED_COUNTRIES.includes(code) ? { name: "OpenTable", url: openTableUrl(search) } : null,
    popular: code ? POPULAR.filter((site) => site.countries.includes(code)).map(({ id, name, url }) => ({ id, name, url })) : [],
  };
}
