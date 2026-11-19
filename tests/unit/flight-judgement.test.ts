import { describe, expect, it } from "vitest";
import { judgeFlights } from "../../lib/application/flight-judgement";
import type { FlightSearch } from "../../lib/application/retrieve";
import type { FlightLeg, FlightOffer } from "../../packages/providers/duffel/client";

const leg = (over: Partial<FlightLeg> = {}): FlightLeg => ({ from: "YYZ", departAt: "2027-01-12T10:00:00", to: "FRA", arriveAt: "2027-01-12T20:00:00", minutes: 480, ...over });
const offer = (over: Partial<FlightOffer>): FlightOffer => ({ id: "o", airline: "Air X", priceAmount: "1000", priceCurrency: "CAD", durationMinutes: 900, stops: 1, departAt: "", arriveAt: "", passengerIds: [], ...over });
const search = (offers: FlightOffer[], extra: Partial<FlightSearch> = {}): FlightSearch => ({ origin: "Toronto", destination: "Delhi", departureDate: "2027-01-12", assumedDate: false, offers, ...extra });

describe("flight judgement", () => {
  it("names the layovers and flags the risky ones", () => {
    const o = offer({ legs: [leg({ to: "DOH", toName: "Doha", layoverMinutes: 540, overnight: true }), leg({ from: "DOH", to: "DEL" }), leg({ from: "DEL", to: "BOM", layoverMinutes: 60 })] });
    const { offers } = judgeFlights(search([o]));
    expect(offers[0].layovers[0]).toBe("9 h at Doha (DOH), overnight");
    expect(offers[0].flags).toContain("overnight layover at DOH");
    expect(offers[0].flags.some((f) => f.startsWith("tight connection (60 min"))).toBe(true);
  });

  it("flags a long daytime layover and an often-delayed flight; return legs are labelled", () => {
    const o = offer({
      legs: [leg({ to: "FRA", layoverMinutes: 420, oftenDelayed: true, airline: "Lufthansa", flightNumber: "LH 123" })],
      returnLegs: [leg({ to: "IST", layoverMinutes: 400 })],
    });
    const { offers } = judgeFlights(search([o], { returnDate: "2027-02-02" }));
    expect(offers[0].flags).toContain("long layover (7 h at FRA)");
    expect(offers[0].flags.some((f) => f.includes("Lufthansa LH 123 is often delayed"))).toBe(true);
    expect(offers[0].flags).toContain("return: long layover (6.7 h at IST)");
  });

  it("says what the cheapest option costs in time against the fastest", () => {
    const fast = offer({ airline: "Air Canada", priceAmount: "1900", stops: 0, durationMinutes: 840 });
    const cheap = offer({ id: "c", airline: "Emirates", priceAmount: "1300", stops: 1, durationMinutes: 1380 });
    const { read } = judgeFlights(search([fast, cheap], { returnDate: "2027-02-02" }));
    expect(read[0]).toMatch(/round-trip total/);
    expect(read.join(" ")).toContain("saves 600 CAD (32%) and takes 9 h longer: a real saving, but slower");
    expect(read.join(" ")).not.toContain("cheapest nonstop"); // the nonstop is the fastest: already said
  });

  it("prices the convenience of a nonstop that is not the fastest option", () => {
    const quick = offer({ id: "q", airline: "Fast Air", priceAmount: "2200", stops: 1, durationMinutes: 780 });
    const nonstop = offer({ id: "n", airline: "Air Canada", priceAmount: "1900", stops: 0, durationMinutes: 840 });
    const cheap = offer({ id: "c", airline: "Emirates", priceAmount: "1300", stops: 1, durationMinutes: 1380 });
    expect(judgeFlights(search([quick, nonstop, cheap])).read.join(" ")).toContain("The cheapest nonstop (Air Canada nonstop, 14 h) costs 600 CAD (46%) more than the cheapest option and saves 9 h.");
  });

  it("calls a tiny saving tiny, and reports one flight that is both cheapest and fastest", () => {
    const a = offer({ priceAmount: "1000", durationMinutes: 600 });
    const b = offer({ id: "b", priceAmount: "970", durationMinutes: 1000 });
    expect(judgeFlights(search([a, b])).read.join(" ")).toContain("a small saving for the extra time");
    const both = judgeFlights(search([offer({ priceAmount: "800", durationMinutes: 500 }), offer({ id: "z", priceAmount: "900", durationMinutes: 700 })]));
    expect(both.read.join(" ")).toContain("both the cheapest and the fastest");
  });

  it("passes on Google's price level, and copes with no usable prices", () => {
    const o = offer({});
    const r = judgeFlights(search([o], { insights: { level: "low", lowest: 980, typicalLow: 1150, typicalHigh: 1400 } }));
    expect(r.read.join(" ")).toContain("Google rates these prices low for this route (typically 1,150 CAD to 1,400 CAD)");
    expect(judgeFlights(search([offer({ priceAmount: "n/a" })])).read).toEqual([]);
  });
});
