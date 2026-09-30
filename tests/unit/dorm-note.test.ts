import { describe, expect, it } from "vitest";
import { dormMismatchNote } from "@/lib/application/orchestrate/block-selection";

describe("dormMismatchNote", () => {
  it("flags hotels returned for a dorm question", () => {
    expect(dormMismatchNote("any dorms under 80?", ["Hôtel Saint-Laurent", "Le Gîte du Survenant"])).toMatch(/these are hotels/);
  });
  it("stays quiet when a result is a hostel, or nothing was asked about dorms", () => {
    expect(dormMismatchNote("show me hostels", ["Samesun Hostel", "Hôtel X"])).toBeNull();
    expect(dormMismatchNote("where should we stay?", ["Hôtel X"])).toBeNull();
  });
});
