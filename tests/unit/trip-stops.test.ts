import { describe, expect, it } from "vitest";
import { shiftStops, currentStop, defaultStops, describeStops, effectiveStops, findStop, parseStops, splitDestinations, stayWindow, stopDayRange, stopForDate, stopsFromStays, tripCalendar } from "../../lib/trip-stops";

describe("splitDestinations", () => {
  it("splits a list written with commas, arrows or 'then', keeps a single place whole and drops repeats", () => {
    expect(splitDestinations("New York, Rome → Paris, then London")).toEqual(["New York", "Rome", "Paris", "London"]);
    expect(splitDestinations("Trinidad and Tobago")).toEqual(["Trinidad and Tobago"]);
    expect(splitDestinations("Rome, rome, Paris")).toEqual(["Rome", "Paris"]);
    expect(splitDestinations(null)).toEqual([]);
  });
});

describe("defaultStops", () => {
  it("shares the nights across the cities, each city's last day being the next one's first", () => {
    const stops = defaultStops("New York, Rome, Paris, Amsterdam, London", "2027-06-05", "2027-06-24");
    expect(stops.map((s) => s.city)).toEqual(["New York", "Rome", "Paris", "Amsterdam", "London"]);
    expect(stops[0]).toEqual({ city: "New York", startDate: "2027-06-05", endDate: "2027-06-09" });
    expect(stops[1]!.startDate).toBe(stops[0]!.endDate);
    expect(stops[4]!.endDate).toBe("2027-06-24");
  });
  it("gives one place the whole trip and an undated trip no dates", () => {
    expect(defaultStops("Lisbon", "2027-06-05", "2027-06-09")).toEqual([{ city: "Lisbon", startDate: "2027-06-05", endDate: "2027-06-09" }]);
    expect(defaultStops("Rome, Paris", null, null)).toEqual([{ city: "Rome", startDate: null, endDate: null }, { city: "Paris", startDate: null, endDate: null }]);
  });
});

describe("parseStops and effectiveStops", () => {
  it("keeps good stops, drops nameless ones and backwards dates", () => {
    expect(parseStops([{ city: " Rome ", startDate: "2027-06-09", endDate: "2027-06-13" }, { city: "" }, { city: "Paris", startDate: "2027-06-13", endDate: "2027-06-10" }, { city: "Nice", startDate: "2027-13-40" }, "x", null])).toEqual([
      { city: "Rome", startDate: "2027-06-09", endDate: "2027-06-13" },
      { city: "Paris", startDate: "2027-06-13", endDate: null },
      { city: "Nice", startDate: null, endDate: null },
    ]);
    expect(parseStops("nope")).toEqual([]);
  });
  it("prefers what the group saved, and says when it is only an estimate", () => {
    const trip = { destination: "Rome, Paris", start_date: "2027-06-05", end_date: "2027-06-11" };
    expect(effectiveStops(trip).estimated).toBe(true);
    const saved = effectiveStops({ ...trip, stops: [{ city: "Rome", startDate: "2027-06-05", endDate: "2027-06-08" }, { city: "Paris", startDate: "2027-06-08", endDate: "2027-06-11" }] });
    expect(saved.estimated).toBe(false);
    expect(saved.stops[0]!.endDate).toBe("2027-06-08");
  });
});

describe("looking a day or a city up", () => {
  const stops = [{ city: "Rome", startDate: "2027-06-09", endDate: "2027-06-13" }, { city: "Paris", startDate: "2027-06-13", endDate: "2027-06-16" }];
  it("finds the city for a day: the travel day belongs to the city being reached, the last departure day to the last city", () => {
    expect(stopForDate(stops, "2027-06-10")?.city).toBe("Rome");
    expect(stopForDate(stops, "2027-06-13")?.city).toBe("Paris");
    expect(stopForDate(stops, "2027-06-16")?.city).toBe("Paris");
    expect(stopForDate(stops, "2027-06-20")).toBeNull();
    expect(stopForDate(stops, null)).toBeNull();
  });
  it("maps a stop to trip day numbers and a stay window", () => {
    expect(stopDayRange(stops[0]!, "2027-06-05")).toEqual({ startDay: 5, endDay: 9 });
    expect(stopDayRange({ city: "x", startDate: null, endDate: null }, "2027-06-05")).toBeNull();
    expect(stayWindow(stops[1]!)).toEqual({ checkin: "2027-06-13", checkout: "2027-06-16" });
  });
  it("picks where the group is: today's stop, the first before the trip, the last after it", () => {
    expect(currentStop(stops, "2027-06-14")?.city).toBe("Paris");
    expect(currentStop(stops, "2027-01-01")?.city).toBe("Rome");
    expect(currentStop(stops, "2028-01-01")?.city).toBe("Paris");
    expect(currentStop([], "2027-06-14")).toBeNull();
  });
  it("finds a stop by a looser city name", () => {
    expect(findStop(stops, "paris")?.city).toBe("Paris");
    expect(findStop(stops, "Rome, Italy")?.city).toBe("Rome");
    expect(findStop(stops, "Berlin")).toBeNull();
  });
});

describe("prompt helpers", () => {
  const stops = [{ city: "Rome", startDate: "2027-06-09", endDate: "2027-06-11" }, { city: "Paris", startDate: "2027-06-11", endDate: "2027-06-12" }];
  it("writes a trip calendar a model can label days from", () => {
    expect(tripCalendar("2027-06-09", "2027-06-12", stops)).toEqual(["Day 1 = 2027-06-09 (Wed), Rome", "Day 2 = 2027-06-10 (Thu), Rome", "Day 3 = 2027-06-11 (Fri), Paris", "Day 4 = 2027-06-12 (Sat), Paris"]);
    expect(tripCalendar(null, null, stops)).toEqual([]);
  });
  it("describes the route only when there is more than one place", () => {
    expect(describeStops(stops, true)).toContain("Rome Jun 9 to Jun 11; Paris Jun 11 to Jun 12");
    expect(describeStops(stops, true)).toContain("estimate");
    expect(describeStops(stops.slice(0, 1), false)).toBe("");
  });
});

describe("shiftStops", () => {
  const stops = [{ city: "Rome", startDate: "2027-06-09", endDate: "2027-06-13" }, { city: "Paris", startDate: "2027-06-13", endDate: null }];
  it("moves every date by however far the start moved, keeping lengths", () => {
    expect(shiftStops(stops, "2027-06-05", "2027-06-08")).toEqual([{ city: "Rome", startDate: "2027-06-12", endDate: "2027-06-16" }, { city: "Paris", startDate: "2027-06-16", endDate: null }]);
  });
  it("does nothing without stops, without both starts, or when the start did not move", () => {
    expect(shiftStops([], "2027-06-05", "2027-06-08")).toBeNull();
    expect(shiftStops(stops, null, "2027-06-08")).toBeNull();
    expect(shiftStops(stops, "2027-06-05", "2027-06-05")).toBeNull();
  });
  const route = [{ city: "Rome", startDate: "2027-06-05", endDate: "2027-06-09" }, { city: "Paris", startDate: "2027-06-09", endDate: "2027-06-13" }];
  it("slides everything when the start and the end move the same distance", () => {
    expect(shiftStops(route, "2027-06-05", "2027-06-07", "2027-06-13", "2027-06-15")).toEqual([{ city: "Rome", startDate: "2027-06-07", endDate: "2027-06-11" }, { city: "Paris", startDate: "2027-06-11", endDate: "2027-06-15" }]);
  });
  it("gives extra days at the end to the last city and leaves the others", () => {
    expect(shiftStops(route, "2027-06-05", "2027-06-05", "2027-06-13", "2027-06-17")).toEqual([route[0], { city: "Paris", startDate: "2027-06-09", endDate: "2027-06-17" }]);
  });
  it("gives extra days at the start to the first city and leaves the others", () => {
    expect(shiftStops(route, "2027-06-05", "2027-06-03", "2027-06-13", "2027-06-13")).toEqual([{ city: "Rome", startDate: "2027-06-03", endDate: "2027-06-09" }, route[1]]);
  });
});

describe("stopsFromStays", () => {
  const stays = [{ startsOn: "2027-06-05", endsOn: "2027-06-08" }, { startsOn: "2027-06-09", endsOn: "2027-06-13" }];
  it("runs each city from the previous stay's end to its own stay's end", () => {
    expect(stopsFromStays("New York, Rome", stays, "2027-06-05", "2027-06-13")).toEqual([
      { city: "New York", startDate: "2027-06-05", endDate: "2027-06-08" },
      { city: "Rome", startDate: "2027-06-08", endDate: "2027-06-13" },
    ]);
  });
  it("gives the trip's end to the last city when its stay ends sooner", () => {
    expect(stopsFromStays("New York, Rome", stays, "2027-06-05", "2027-06-15")?.[1]?.endDate).toBe("2027-06-15");
  });
  it("is null unless there is exactly one dated stay per city", () => {
    expect(stopsFromStays("New York, Rome, Paris", stays, "2027-06-05", "2027-06-13")).toBeNull();
    expect(stopsFromStays("Rome", stays.slice(0, 1), "2027-06-05", "2027-06-13")).toBeNull();
    expect(stopsFromStays("New York, Rome", [stays[0]!, { startsOn: null, endsOn: null }], "2027-06-05", "2027-06-13")).toBeNull();
  });
});
