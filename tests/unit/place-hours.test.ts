import { describe, expect, it } from "vitest";
import { hoursPill } from "../../lib/place-hours";

// Toronto is about -5 h from UTC by longitude (-79.4 / 15), so 2026-10-07 16:00 UTC is Wednesday 11:00 there.
const wed11 = new Date("2026-10-07T16:00:00Z");
const week = [
  "Monday: 11:00 AM – 10:00 PM", "Tuesday: 11:00 AM – 10:00 PM", "Wednesday: 11:30 AM – 3:00 PM, 5:00 PM – 10:00 PM",
  "Thursday: 11:00 AM – 10:00 PM", "Friday: 11:00 AM – 11:00 PM", "Saturday: 11:00 AM – 11:00 PM", "Sunday: Closed",
];
const narrow = "Wednesday: 11:30 AM – 3:00 PM";

describe("hoursPill", () => {
  it("says nothing when it is not known whether the place is open", () => {
    expect(hoursPill(undefined, week, -79.4, wed11)).toBeNull();
  });

  it("falls back to plain Open / Closed when there are no hours or no position", () => {
    expect(hoursPill(true, undefined, -79.4, wed11)).toEqual({ open: true, label: "Open now" });
    expect(hoursPill(false, week, undefined, wed11)).toEqual({ open: false, label: "Closed now" });
  });

  it("tells when an open place closes (the range that holds now, in a split shift)", () => {
    expect(hoursPill(true, week, -79.4, new Date("2026-10-07T21:00:00Z"))).toEqual({ open: true, label: "Open · until 10 PM" }); // 4 PM local
    expect(hoursPill(true, week, -79.4, new Date("2026-10-07T18:30:00Z"))).toEqual({ open: true, label: "Open · until 3 PM" }); // 1:30 PM local
  });

  it("tells when a closed place opens: later today, or the next day it is open", () => {
    expect(hoursPill(false, week, -79.4, new Date("2026-10-07T14:00:00Z"))).toEqual({ open: false, label: "Closed · opens 11:30 AM" }); // 9 AM local, before opening
    expect(hoursPill(false, week, -79.4, new Date("2026-10-07T20:30:00Z"))).toEqual({ open: false, label: "Closed · opens 5 PM" }); // between shifts
    expect(hoursPill(false, week, -79.4, new Date("2026-10-08T05:00:00Z"))).toEqual({ open: false, label: "Closed · opens 11 AM" }); // after midnight Thursday: before 11
    expect(hoursPill(false, week, -79.4, new Date("2026-10-11T14:00:00Z"))).toEqual({ open: false, label: "Closed · opens Mon 11 AM" }); // Sunday (closed all day), Monday opens
  });

  it("reads Google's narrow no-break spaces and 24-hour places", () => {
    expect(hoursPill(false, [narrow], -79.4, new Date("2026-10-07T14:00:00Z"))?.label).toBe("Closed · opens 11:30 AM");
    expect(hoursPill(true, ["Wednesday: Open 24 hours"], -79.4, wed11)).toEqual({ open: true, label: "Open 24 hours" });
  });

  it("keeps the flag's answer when the hours cannot be read", () => {
    expect(hoursPill(true, ["Wednesday: by appointment"], -79.4, wed11)).toEqual({ open: true, label: "Open now" });
  });
});
