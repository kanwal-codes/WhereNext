import { describe, expect, it } from "vitest";
import { airlineNote } from "@/features/flights/domain/flights-page";

const show = { money: (n: number) => `CA$${n}`, duration: (m: number) => `${Math.floor(m / 60)}h ${m % 60}m` };
const offers = [
  { airline: "Air Canada", price: "320", stops: 0, durationMinutes: 75 },
  { airline: "Air Canada", price: "308", stops: 1, durationMinutes: 300 },
  { airline: "Porter Airlines", price: "250", stops: 0, durationMinutes: 80 },
];

describe("airlineNote: what the fares say about the airlines an ask named", () => {
  it("gives the cheapest fare of each airline that has one, and says so when one has none", () => {
    expect(airlineNote(["Air Canada", "Flair"], offers, show)).toBe("Air Canada from CA$308, 1 stop, 5h 0m. Flair has no flights in these results.");
  });
  it("matches whatever case the name was written in, and says nothing when no airline was named", () => {
    expect(airlineNote(["porter"], offers, show)).toBe("porter from CA$250, nonstop, 1h 20m.");
    expect(airlineNote([], offers, show)).toBeNull();
  });
});
