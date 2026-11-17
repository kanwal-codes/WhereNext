import { describe, expect, it } from "vitest";
import { readStayAsk, stayAskNeedsModel } from "../../lib/application/stay-ask";

// A Tuesday. Everything below is read against it.
const TODAY = "2026-11-17";
const ask = (q: string) => readStayAsk(q, TODAY);
const D = (a: string, b: string) => ({ checkin: a, checkout: b });

describe("dates, however they are written", () => {
  const range: Array<[string, { checkin: string; checkout: string }]> = [
    ["hotels from dec 10-dec20", D("2026-12-10", "2026-12-20")],
    ["10 dec - 14 dec", D("2026-12-10", "2026-12-14")],
    ["DEC 10 - DEC 14 PLEASE", D("2026-12-10", "2026-12-14")],
    ["from the 10th to the 14th of december", D("2026-12-10", "2026-12-14")],
    ["december 10 through 14", D("2026-12-10", "2026-12-14")],
    ["Dec. 10–14", D("2026-12-10", "2026-12-14")],
    ["dec10-14", D("2026-12-10", "2026-12-14")],
    ["10-14 dec", D("2026-12-10", "2026-12-14")],
    ["10th to 14th of Dec", D("2026-12-10", "2026-12-14")],
    ["check in dec 10 check out dec 14", D("2026-12-10", "2026-12-14")],
    ["arriving december 10th leaving december 14th 2026", D("2026-12-10", "2026-12-14")],
    ["dec 10 until the 14th", D("2026-12-10", "2026-12-14")],
    ["2026-12-10 to 2026-12-14", D("2026-12-10", "2026-12-14")],
    ["jan 3-6", D("2027-01-03", "2027-01-06")],
    ["30 dec to 2 jan", D("2026-12-30", "2027-01-02")],
    ["nov 20 to nov 25", D("2026-11-20", "2026-11-25")],
    ["nov 17 to 19", D("2026-11-17", "2026-11-19")], // today itself still counts
    ["nov 10 to nov 12", D("2027-11-10", "2027-11-12")], // already passed: next year
    ["hotels 5th sept - 9th sept", D("2027-09-05", "2027-09-09")],
  ];
  it.each(range)("%s", (q, want) => expect(ask(q)).toMatchObject(want));

  it("a start with a number of nights", () => {
    expect(ask("dec 10 for 4 nights")).toMatchObject({ checkin: "2026-12-10", nights: 4 });
    expect(ask("4 nights from dec 10")).toMatchObject({ checkin: "2026-12-10", nights: 4 });
    expect(ask("three nights starting 10th dec")).toMatchObject({ checkin: "2026-12-10", nights: 3 });
    expect(ask("a week from dec 10")).toMatchObject({ checkin: "2026-12-10", nights: 7 });
    expect(ask("2 weeks from dec 10")).toMatchObject({ checkin: "2026-12-10", nights: 14 });
    expect(ask("a week from dec 10 for two, over 100 a night, best rated")).toMatchObject({ checkin: "2026-12-10", nights: 7, adults: 2, priceMin: 100, sort: "rating" });
    expect(ask("just a night on dec 10")).toMatchObject({ checkin: "2026-12-10", nights: 1 });
    expect(ask("dec 10 under $150 a night").nights).toBeUndefined();
  });
  it("a start alone keeps the length the screen has; a length alone keeps the start", () => {
    expect(ask("hotels on dec 10")).toEqual({ checkin: "2026-12-10" });
    expect(ask("for 3 nights")).toEqual({ nights: 3 });
  });
  it("tonight, tomorrow and the weekends", () => {
    expect(ask("something tonight")).toEqual({ checkin: "2026-11-17", nights: 1 });
    expect(ask("tomorrow for 3 nights")).toEqual({ checkin: "2026-11-18", nights: 3 });
    expect(ask("this weekend")).toEqual({ checkin: "2026-11-20", nights: 2 });
    expect(ask("next weekend")).toEqual({ checkin: "2026-11-27", nights: 2 });
  });
  it("reads no date from an impossible one", () => {
    expect(ask("feb 30 to mar 3")).toEqual({});
  });
});

describe("prices, however they are written", () => {
  const cases: Array<[string, { priceMin?: number; priceMax?: number }]> = [
    ["between 100 and 200", { priceMin: 100, priceMax: 200 }],
    ["between 100-200", { priceMin: 100, priceMax: 200 }],
    ["between $200 and $100", { priceMin: 100, priceMax: 200 }],
    ["100 to 200 a night", { priceMin: 100, priceMax: 200 }],
    ["$100–$200", { priceMin: 100, priceMax: 200 }],
    ["150-200", { priceMin: 150, priceMax: 200 }],
    ["price 150-200", { priceMin: 150, priceMax: 200 }],
    ["from 100 to 200 dollars", { priceMin: 100, priceMax: 200 }],
    ["priced between 80 and 140 euros", { priceMin: 80, priceMax: 140 }],
    ["under 150", { priceMax: 150 }],
    ["below $150 a night", { priceMax: 150 }],
    ["less than 150 per night", { priceMax: 150 }],
    ["no more than 150", { priceMax: 150 }],
    ["nothing more than €120/night", { priceMax: 120 }],
    ["up to 150 dollars", { priceMax: 150 }],
    ["at most 150", { priceMax: 150 }],
    ["cheaper than 150", { priceMax: 150 }],
    ["max 150", { priceMax: 150 }],
    ["150 max", { priceMax: 150 }],
    ["150 or less", { priceMax: 150 }],
    ["150 a night", { priceMax: 150 }],
    ["budget 200", { priceMax: 200 }],
    ["1,200 a night max", { priceMax: 1200 }],
    ["over 100", { priceMin: 100 }],
    ["above $100", { priceMin: 100 }],
    ["at least 100", { priceMin: 100 }],
    ["more than 100 a night", { priceMin: 100 }],
    ["from 100", { priceMin: 100 }],
    ["minimum 90", { priceMin: 90 }],
    ["100 or more", { priceMin: 100 }],
    ["over 100 and under 200", { priceMin: 100, priceMax: 200 }],
    ["under 200 but over 100", { priceMin: 100, priceMax: 200 }],
    ["around 150", { priceMin: 120, priceMax: 180 }],
    ["about $200 a night", { priceMin: 160, priceMax: 240 }],
  ];
  it.each(cases)("%s", (q, want) => {
    const got = ask(q);
    expect(got.priceMin, "min").toBe(want.priceMin);
    expect(got.priceMax, "max").toBe(want.priceMax);
  });
  it("is not fooled by dates, stars, guests or a whole-trip total", () => {
    for (const q of ["from dec 10", "from 30 dec to 2 jan", "dec 20-25", "20-25 dec", "under 3 stars", "2 to 4 stars", "for 10 nights", "within 5 km", "over 18 months", "total budget $600 for two", "600 total"]) {
      const got = ask(q);
      expect(got.priceMin, q).toBeUndefined();
      expect(got.priceMax, q).toBeUndefined();
    }
  });
});

describe("the order asked for", () => {
  const cases: Array<[string, string | undefined]> = [
    ["sort it from low to high", "price"], ["cheapest first", "price"], ["lowest price", "price"], ["price ascending", "price"], ["sort by price", "price"], ["least expensive", "price"],
    ["high to low", "price_desc"], ["most expensive first", "price_desc"], ["highest price first", "price_desc"], ["price descending", "price_desc"], ["sorted from high to low", "price_desc"],
    ["best rated first", "rating"], ["top rated", "rating"], ["highest rated", "rating"], ["by guest rating", "rating"], ["best reviews", "rating"], ["sort by rating then price", "rating"],
    ["by stars", "stars"], ["most stars", "stars"], ["hotels", undefined],
  ];
  it.each(cases)("%s", (q, want) => expect(ask(q).sort).toBe(want));
});

describe("stars, free cancellation and the party", () => {
  const stars: Array<[string, number[] | undefined]> = [
    ["4 star", [4]], ["4-star hotels", [4]], ["4*", [4]], ["4★", [4]], ["four star", [4]], ["five stars", [5]], ["5 star only", [5]],
    ["3 or 4 stars", [3, 4]], ["3-4 stars", [3, 4]], ["at least 4 stars", [4, 5]], ["4 stars or better", [4, 5]], ["4+ stars", [4, 5]], ["4 star and above", [4, 5]],
    ["minimum 3 star", [3, 4, 5]], ["4 star minimum", [4, 5]], ["under 3 stars", [1, 2]], ["2 to 4 stars", [2, 3, 4]], ["hotels", undefined], ["dec 4", undefined],
  ];
  it.each(stars)("stars: %s", (q, want) => expect(ask(q).stars).toEqual(want));

  it.each(["free cancellation", "refundable", "cancel for free", "free to cancel", "flexible booking", "free cancel", "fully refundable please"])("cancellation: %s", (q) => expect(ask(q).refundable).toBe(true));
  it("does not read a cancellation from other words", () => expect(ask("cancel culture")).toEqual({}));

  const party: Array<[string, { adults?: number; rooms?: number }]> = [
    ["for 2", { adults: 2 }], ["2 adults", { adults: 2 }], ["three people", { adults: 3 }], ["party of 4", { adults: 4 }], ["family of four", { adults: 4 }], ["for two", { adults: 2 }],
    ["4 of us", { adults: 4 }], ["solo", { adults: 1 }], ["a couple", { adults: 2 }], ["me and my wife", { adults: 2 }], ["2 guests and 2 rooms", { adults: 2, rooms: 2 }], ["two rooms", { rooms: 2 }],
    ["3 bedrooms", { rooms: 3 }], ["for 2 nights", {}], ["for 10 dec", {}], ["a room", {}], ["a guest", {}], ["for 40 people", {}],
  ];
  it.each(party)("party: %s", (q, want) => {
    const got = ask(q);
    expect(got.adults).toBe(want.adults);
    expect(got.rooms).toBe(want.rooms);
  });
});

describe("whole sentences, the way they are really typed", () => {
  it("the sentence that started this", () => {
    expect(ask("give me hotels from dec 10-dec20 price 150-200 and sort it from low to high")).toEqual({ priceMin: 150, priceMax: 200, checkin: "2026-12-10", checkout: "2026-12-20", sort: "price" });
  });
  it("everything at once, in any order", () => {
    expect(ask("2 adults 4 star dec 10-14 under 200 free cancel cheapest first")).toEqual({ adults: 2, stars: [4], checkin: "2026-12-10", checkout: "2026-12-14", priceMax: 200, refundable: true, sort: "price" });
    expect(ask("free cancellation, cheapest first, under $200, december 10 to 14, 4 stars or better, for 3")).toEqual({ adults: 3, stars: [4, 5], checkin: "2026-12-10", checkout: "2026-12-14", priceMax: 200, refundable: true, sort: "price" });
  });
  it("shouting, extra spaces, punctuation and filler", () => {
    expect(ask("  PLS find me HOTELS!!  dec 10   to   dec 14,  150 - 200 $$  ")).toMatchObject({ checkin: "2026-12-10", checkout: "2026-12-14", priceMin: 150, priceMax: 200 });
    expect(ask("hey could you show me some options from december 10th to the 14th, nothing over $180 a night?")).toMatchObject({ checkin: "2026-12-10", checkout: "2026-12-14", priceMax: 180 });
  });
  it("a price that sits beside a date", () => {
    expect(ask("dec 20-25 under 200")).toEqual({ checkin: "2026-12-20", checkout: "2026-12-25", priceMax: 200 });
    expect(ask("dec 20-25 between 120-180")).toEqual({ checkin: "2026-12-20", checkout: "2026-12-25", priceMin: 120, priceMax: 180 });
  });
  it("says nothing for a sentence with nothing it reads", () => {
    expect(ask("hotels near the old town")).toEqual({});
    expect(ask("")).toEqual({});
  });
});

describe("when the model is needed", () => {
  it("is not, for a sentence made only of what the reader understands", () => {
    for (const q of ["give me hotels from dec 10-dec20 price 150-200 and sort it from low to high", "4 star hotels with free cancellation for 3 adults", "cheapest first under 200 tonight", "2 rooms for a week from dec 10", "best rated, 4+ stars, over $100 a night"]) {
      expect(stayAskNeedsModel(q), q).toBe(false);
    }
  });
  it("is, for anything about a place, a feature or a taste", () => {
    for (const q of ["hotels near the old town", "hotels in Lisbon dec 10-14", "a villa with a pool under 300 a night", "romantic boutique hotel", "with breakfast", "pet friendly", "close to the airport dec 10-12", "hotl dec 10 to 14"]) {
      expect(stayAskNeedsModel(q), q).toBe(true);
    }
  });
});
