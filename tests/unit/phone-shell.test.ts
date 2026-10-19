import { describe, expect, it } from "vitest";
import { backTarget } from "../../components/shell/PhoneHeader";
import { shortTripTitle } from "../../components/shell/trip-title";
import { NAV, PHONE_NAV_GROUPS } from "../../components/shell/trip-nav";

describe("shortTripTitle", () => {
  it("shortens a long route to first and last stop", () => {
    expect(shortTripTitle("Toronto → New York → Rome → Paris → Amsterdam → London")).toBe("Toronto → London");
    expect(shortTripTitle("Toronto -> Rome -> Paris")).toBe("Toronto → Paris");
  });
  it("leaves a name, a pair of stops, or an empty string alone", () => {
    expect(shortTripTitle("Montreal trip")).toBe("Montreal trip");
    expect(shortTripTitle("Toronto → London")).toBe("Toronto → London");
    expect(shortTripTitle("")).toBe("");
  });
});

describe("backTarget", () => {
  const base = "/trips/t1";
  it("goes up one level from a stay or group details, and to browser history from a place, event or compare", () => {
    expect(backTarget(`${base}/stay/h1`, base)).toEqual({ href: `${base}/stay` });
    expect(backTarget(`${base}/group/details`, base)).toEqual({ href: `${base}/group` });
    expect(backTarget(`${base}/place/abc`, base)).toEqual({ href: null });
    expect(backTarget(`${base}/event`, base)).toEqual({ href: null });
  });
  it("has no back button on the top-level pages", () => {
    for (const rest of ["", "/chat", "/group", "/itinerary", "/discover", "/stay", "/map", "/bookings", "/knowledge"]) {
      expect(backTarget(`${base}${rest}`, base)).toBeUndefined();
    }
  });
});

describe("phone menu groups", () => {
  it("lists every page of the trip menu exactly once", () => {
    const grouped = PHONE_NAV_GROUPS.flatMap((g) => g.segs).sort();
    expect(grouped).toEqual(NAV.map((n) => n.seg).sort());
  });
});
