import { describe, expect, it } from "vitest";
import { tripImportResultSchema } from "../../packages/contracts/trip-import";

describe("tripImportResultSchema", () => {
  it("accepts a minimal result and defaults the arrays", () => {
    const out = tripImportResultSchema.parse({ destination: "Lisbon", suggestedName: "3 days in Lisbon" });
    expect(out.places).toEqual([]);
    expect(out.notes).toEqual([]);
  });

  it("drops a bad date shape", () => {
    expect(tripImportResultSchema.safeParse({ destination: "Lisbon", suggestedName: "L", startDate: "March 3" }).success).toBe(false);
  });

  it("caps places at 30", () => {
    const places = Array.from({ length: 40 }, (_, i) => ({ name: `Place ${i}` }));
    expect(tripImportResultSchema.safeParse({ destination: "Lisbon", suggestedName: "L", places }).success).toBe(false);
  });

  it("keeps place notes and trims", () => {
    const out = tripImportResultSchema.parse({ destination: "Porto", suggestedName: "Porto", places: [{ name: "  Livraria Lello  ", note: "  go early  " }] });
    expect(out.places[0]).toEqual({ name: "Livraria Lello", note: "go early" });
  });
});
