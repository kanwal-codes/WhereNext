import { describe, expect, it } from "vitest";
import { rankPlaces } from "../../lib/application/rank-places";
import { inDestination } from "../../lib/places-ui";
import type { Place } from "../../packages/contracts/place";

// The first results Google returned, in its order, for "roof top bars in Niagara Falls, Ontario, Canada" (production, 2026-10-07).
const row = (name: string, category: string, rating: number, userRatingCount: number, address: string): Place => ({
  provider: "google-places", providerId: name, name, category, latitude: 43.08, longitude: -79.08, address, rating, userRatingCount, sourceUrl: null, photoNames: [],
});
const FALLS = (street: string) => `${street}, Niagara Falls, ON, Canada`;
const GOOGLE_ORDER: Place[] = [
  row("La Favella", "restaurant", 4.3, 817, FALLS("6671 Fallsview Blvd")),
  row("Lounge Six Parkway Sky Bar", "bar", 4.3, 51, "327 Ontario St, St. Catharines, ON, Canada"),
  row("Sky Fallsview Steakhouse", "steak_house", 4.2, 437, FALLS("6732 Fallsview Blvd 26th Floor")),
  row("Niagara Brewing Company", "brewery", 4.3, 4824, FALLS("4915-A Clifton Hill")),
  row("Infinity Bar", "bar", 4.1, 20, FALLS("6380 Fallsview Blvd")),
  row("Table Rock House Restaurant", "restaurant", 4.3, 3240, FALLS("6650 Niagara River Pkwy")),
  row("Jonny’s", "bar", 4.5, 137, FALLS("6405 Stanley Ave")),
  row("Great Room Lobby Bar", "bar", 4.9, 10, FALLS("6755 Fallsview Blvd")),
  row("Sheraton Fallsview Hotel", "hotel", 4.1, 13707, FALLS("5875 Falls Ave")),
  row("Fallsview Casino Resort", "casino", 4.3, 25080, FALLS("6380 Fallsview Blvd")),
  row("Harriet's Rooftop", "restaurant", 4.4, 1490, "550 Wellington St W, Toronto, ON, Canada"),
  row("Skylon Tower", "tourist_attraction", 4.4, 14617, FALLS("5200 Robinson St")),
  row("Patrick's Rooftop", "bar", 3.9, 143, "500 Pearl St, Buffalo, NY, USA"),
  row("Prime Steakhouse Niagara Falls", "steak_house", 4.7, 4591, FALLS("5685 Falls Ave")),
  row("Burrata Rooftop Bistro", "american_restaurant", 3.1, 14, "2761 Long Rd, Grand Island, NY, USA"),
];

describe("a typed search for rooftop bars in Niagara Falls", () => {
  it("was ranked by how well known a place is: the casino and the hotel came first", () => {
    const names = rankPlaces(GOOGLE_ORDER).map((r) => r.place.name);
    expect(names.slice(0, 3)).toEqual(["Fallsview Casino Resort", "Skylon Tower", "Prime Steakhouse Niagara Falls"]);
  });

  it("keeps Google's order when only the places in the destination are kept", () => {
    const here = GOOGLE_ORDER.filter((place) => inDestination(place, "Niagara Falls, Ontario, Canada"));
    const names = rankPlaces(here, { providerOrder: true }).map((r) => r.place.name);
    expect(names.slice(0, 4)).toEqual(["La Favella", "Sky Fallsview Steakhouse", "Niagara Brewing Company", "Infinity Bar"]);
    expect(names).not.toContain("Harriet's Rooftop"); // Toronto
    expect(names).not.toContain("Patrick's Rooftop"); // Buffalo
    expect(names).not.toContain("Lounge Six Parkway Sky Bar"); // St. Catharines
  });

  it("treats a place with no destination as in", () => {
    expect(inDestination(GOOGLE_ORDER[1], "")).toBe(true);
  });
});
