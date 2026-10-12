import { describe, expect, it } from "vitest";
import { buildTimeline } from "../../lib/trip-reservations";
import { myStayFromDecision, myStayFromTimeline, nightsBetween, viaNote } from "../../features/stays/application/my-stay";
import type { Reservation } from "../../packages/contracts/reservation";
import type { StayDecision } from "../../packages/contracts/stay";

const decision: StayDecision = { provider: "serpapi", hotelId: "g:abc", hotelName: "Bakal Tulum", roomName: "Booking on Bakal Tulum Hotel", board: null, refundable: true, checkin: "2026-11-15", checkout: "2026-11-18", nights: 3, nightlyAmount: 93, totalAmount: 279, currency: "CAD", latitude: null, longitude: null, address: "Tulum", thumbnail: null };
const reservation = (id: string, extra: Partial<Reservation> = {}): Reservation => ({ id, kind: "stay", title: `Hotel ${id}`, startsOn: null, endsOn: null, startTime: null, endTime: null, place: null, toPlace: null, confirmationCode: null, amount: null, currency: null, amountBasis: "total", travellers: null, status: "confirmed", notes: null, attachments: [], createdAt: "2026-09-01T10:00:00Z", ...extra });

describe("my stays", () => {
  it("counts nights and rewords a Google lock's booking site", () => {
    expect(nightsBetween("2026-11-15", "2026-11-18")).toBe(3);
    expect(nightsBetween("2026-11-15", null)).toBeNull();
    expect(nightsBetween("2026-11-18", "2026-11-15")).toBeNull();
    expect(viaNote("Booking on Bakal Tulum Hotel")).toBe("Booking via Bakal Tulum Hotel");
    expect(viaNote("Deluxe King")).toBe("Deluxe King");
  });

  it("maps the chosen hotel", () => {
    expect(myStayFromDecision(decision, "/h")).toMatchObject({ badge: "Your stay", name: "Bakal Tulum", nights: 3, total: "CA$279", perNight: "CA$93 / night", note: "Booking via Bakal Tulum Hotel", refundable: true, href: "/h" });
  });

  it("shows several stays in date order, each labelled for where it came from", () => {
    const items = buildTimeline({
      reservations: [reservation("b", { startsOn: "2026-11-20", endsOn: "2026-11-22", place: "Mexico City", amount: 300, currency: "CAD" }), reservation("c", { startsOn: "2026-11-10", endsOn: "2026-11-12" }), reservation("act", { kind: "activity" })],
      bookings: [],
      stay: decision,
      flight: null,
      tripId: "t",
    }).filter((i) => i.category === "stay");
    const stays = items.map((i) => myStayFromTimeline(i, "t"));
    expect(stays.map((s) => s.name)).toEqual(["Hotel c", "Bakal Tulum", "Hotel b"]);
    expect(stays.map((s) => s.badge)).toEqual(["Reserved", "Your stay", "Reserved"]);
    expect(stays[2]).toMatchObject({ address: "Mexico City", nights: 2, total: "CA$300", href: "/trips/t/bookings" });
    expect(stays[0].total).toBeNull(); // no price entered: the card shows a dash, not 0
  });
});
