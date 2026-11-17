import { describe, expect, it } from "vitest";
import { readRouteAsk, routeAskIsEmpty } from "../../lib/application/route-ask";

const TODAY = "2026-11-17";
const ends = (q: string) => { const a = readRouteAsk(q, TODAY); return [a.from ?? a.fromSpecial ?? null, a.to ?? a.toSpecial ?? null]; };

describe("readRouteAsk: the two ends", () => {
  it.each([
    ["montreal to portugal", ["Montreal", "Portugal"]],
    ["toronto to montreal", ["Toronto", "Montreal"]],
    ["from toronto to montreal", ["Toronto", "Montreal"]],
    ["Toronto → Montreal", ["Toronto", "Montreal"]],
    ["toronto -> montreal", ["Toronto", "Montreal"]],
    ["toronto - montreal", ["Toronto", "Montreal"]],
    ["lisbon from porto", ["Porto", "Lisbon"]],
    ["to lisbon from porto", ["Porto", "Lisbon"]],
    ["between rome and florence", ["Rome", "Florence"]],
    ["how do i get from the airport to the hotel", ["Airport", "stay"]],
    ["rio de janeiro to sao paulo", ["Rio de Janeiro", "Sao Paulo"]],
    ["new york to los angeles please", ["New York", "Los Angeles"]],
    ["to lisbon", [null, "Lisbon"]],
    ["lisbon", [null, "Lisbon"]],
    ["from toronto", ["Toronto", null]],
    ["here to the airport", ["here", "Airport"]],
    ["my hotel to belem tower", ["stay", "Belem Tower"]],
    ["home to lisbon", ["home", "Lisbon"]],
  ])("%s", (q, want) => expect(ends(q)).toEqual(want));

  it("keeps the first leg of a longer chain and says there is more", () => {
    const a = readRouteAsk("from toronto to montreal to ottawa", TODAY);
    expect([a.from, a.to, a.more]).toEqual(["Toronto", "Montreal", "Ottawa"]);
  });
  it("finds nothing in an empty or placeless sentence", () => {
    expect(routeAskIsEmpty(readRouteAsk("", TODAY))).toBe(true);
    expect(routeAskIsEmpty(readRouteAsk("how do i get around", TODAY))).toBe(true);
    expect(routeAskIsEmpty(readRouteAsk("what is the cheapest way to travel between all of the places on my list", TODAY))).toBe(true);
  });
});

describe("readRouteAsk: the rest of the sentence", () => {
  it("reads the way of travelling", () => {
    expect(readRouteAsk("flights from toronto to montreal", TODAY)).toMatchObject({ from: "Toronto", to: "Montreal", modes: ["flight"] });
    expect(readRouteAsk("toronto to montreal by train", TODAY)).toMatchObject({ from: "Toronto", to: "Montreal", modes: ["train"] });
    expect(readRouteAsk("drive from toronto to ottawa", TODAY)).toMatchObject({ from: "Toronto", to: "Ottawa", modes: ["drive"] });
    expect(readRouteAsk("bus station to downtown", TODAY)).toMatchObject({ from: "Bus Station", to: "Downtown" });
  });
  it("reads a date range as a flight out and back", () => {
    expect(readRouteAsk("flights from toronto to montreal from dec 1-14", TODAY)).toMatchObject({ from: "Toronto", to: "Montreal", modes: ["flight"], date: "2026-12-01", returnDate: "2026-12-14" });
  });
  it("does not make a return of a second date for a train", () => {
    const a = readRouteAsk("toronto to montreal by train dec 1-14", TODAY);
    expect(a.date).toBe("2026-12-01");
    expect(a.returnDate).toBeUndefined();
  });
  it("reads a time and a party", () => {
    expect(readRouteAsk("toronto to montreal at 5pm for 2", TODAY)).toMatchObject({ from: "Toronto", to: "Montreal", time: { kind: "depart", time: "17:00" }, travellers: 2 });
    expect(readRouteAsk("toronto to montreal arrive by 9:15am", TODAY).time).toEqual({ kind: "arrive", time: "09:15" });
  });
});

import { planRoute } from "../../lib/application/route-ask";
import { isBroadPlace } from "../../lib/trip-stops";
import { popularAreasFor } from "../../lib/popular-areas";

describe("planRoute", () => {
  const plan = (q: string, ctx: { from?: string; to?: string; home?: string } = {}) =>
    planRoute(readRouteAsk(q, TODAY), { from: "", to: "", home: "", ...ctx }, isBroadPlace, popularAreasFor);

  it("searches when both ends are said", () => expect(plan("toronto to montreal")).toEqual({ kind: "go", from: "Toronto", to: "Montreal" }));
  it("asks where from when only the destination is said", () => expect(plan("to lisbon")).toEqual({ kind: "ask", need: "from", keep: "Lisbon" }));
  it("asks where to when only the start is said", () => expect(plan("from toronto")).toEqual({ kind: "ask", need: "to", keep: "Toronto" }));
  it("fills an end the sentence leaves out from the screen", () => expect(plan("lisbon", { from: "Toronto" })).toEqual({ kind: "go", from: "Toronto", to: "Lisbon" }));
  it("uses home for 'home to lisbon' and asks when there is none", () => {
    expect(plan("home to lisbon", { home: "Toronto, Canada" })).toEqual({ kind: "go", from: "Toronto, Canada", to: "Lisbon" });
    expect(plan("home to lisbon")).toEqual({ kind: "ask", need: "from", keep: "Lisbon" });
  });
  it("asks which city when an end is a country", () => {
    expect(plan("montreal to portugal")).toMatchObject({ kind: "city", side: "to", place: "Portugal", keep: "Montreal" });
    expect((plan("montreal to portugal") as { options: string[] }).options).toContain("Lisbon");
  });
  it("refuses a trip from a place to itself", () => expect(plan("paris to paris").kind).toBe("same"));
  it("asks about 'here' and 'my hotel' rather than guessing", () => {
    expect(plan("here to the airport")).toEqual({ kind: "ask", need: "from", keep: "Airport" });
    expect(plan("lisbon to my hotel")).toEqual({ kind: "ask", need: "to", keep: "Lisbon" });
  });
});

describe("mode words that belong to a place's name", () => {
  it.each([
    ["Rodeo Drive to Santa Monica", ["Rodeo Drive", "Santa Monica"], undefined],
    ["Bel Air to Venice", ["Bel Air", "Venice"], undefined],
    ["Toronto to the ferry", ["Toronto", "Ferry"], undefined],
    ["Bus Station to Downtown", ["Bus Station", "Downtown"], undefined],
    ["drive from Toronto to Ottawa", ["Toronto", "Ottawa"], ["drive"]],
    ["Toronto to Ottawa by air", ["Toronto", "Ottawa"], ["flight"]],
    ["can you find me a train to Ottawa from Toronto", ["Toronto", "Ottawa"], ["train"]],
  ])("%s", (q, want, modes) => {
    const a = readRouteAsk(q, TODAY);
    expect([a.from, a.to]).toEqual(want);
    expect(a.modes).toEqual(modes);
  });
  it("uses the locked hotel for 'my hotel'", () => {
    expect(planRoute(readRouteAsk("my hotel to the airport", TODAY), { from: "", to: "", home: "", stay: "Hôtel Place d'Armes" }, isBroadPlace, popularAreasFor)).toEqual({ kind: "go", from: "Hôtel Place d'Armes", to: "Airport" });
  });
});
