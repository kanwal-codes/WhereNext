import { describe, expect, it } from "vitest";
import { DAY_CASES, SCENARIOS } from "../../scripts/model-eval/fixtures";
import { languageOf, scoreDay, scoreReply } from "../../scripts/model-eval/score";

const nightlife = SCENARIOS.find((s) => s.id === "nightlife-en")!;
const seafood = SCENARIOS.find((s) => s.id === "dislike-seafood")!;

describe("the model eval's reply scorer", () => {
  it("passes a reply that only uses what it was given, including 12h and 24h forms of the same hours", () => {
    const text = "- **Marea Alta Club** · ★ 4.4 · Carrer del Far 12, Platja Nova · 11:30 PM – 6:00 AM\n- **Bar Faro** · ★ 4.7 · 18:00 – 02:00\n\nStart with **Marea Alta Club**. Book ahead.";
    const s = scoreReply(nightlife, text);
    expect(s.pass).toBe(true);
    expect(s.invented).toEqual([]);
  });
  it("catches a place that was never in the evidence, but not 'AM' or 'PM'", () => {
    const s = scoreReply(nightlife, "**Club Fantasma Blanco** is open until 6 AM, and Marea Alta Club opens at 11:30 PM.");
    expect(s.invented).toContain("Club Fantasma Blanco");
    expect(s.invented.some((x) => /AM|PM/.test(x))).toBe(false);
  });
  it("catches a number that is not in the evidence (a price, a year, a made-up count)", () => {
    const s = scoreReply(nightlife, "Marea Alta Club has been open since 1998 and entry is about €40.");
    expect(s.unknownNumbers).toEqual(expect.arrayContaining(["1998", "40"]));
    expect(s.pass).toBe(false);
  });
  it("accepts the review count written with a separator, and a whole rating written as 4.0", () => {
    expect(scoreReply(nightlife, "**Marea Alta Club** · ★ 4.4 from 2,310 reviews").unknownNumbers).toEqual([]);
    expect(scoreReply(SCENARIOS.find((s) => s.id === "museums-en")!, "**Casa da Moeda Antiga** · ★ 4.0").unknownNumbers).toEqual([]);
  });
  it("reads thousands written the French and Spanish ways, accepts a rounded count, and still catches a made-up number", () => {
    expect(scoreReply(nightlife, "**Marea Alta Club** · ★ 4.4 · 2 310 avis").unknownNumbers).toEqual([]);
    expect(scoreReply(nightlife, "**Marea Alta Club** · ★ 4.4 · 2.300 reseñas").unknownNumbers).toEqual([]);
    expect(scoreReply(nightlife, "**Marea Alta Club** · 9.000 reseñas").unknownNumbers).toEqual(["9000"]);
    expect(scoreReply(nightlife, "open since 1998").unknownNumbers).toEqual(["1998"]);
  });
  it("catches one place given another's rating or hours", () => {
    const s = scoreReply(nightlife, "- **Marea Alta Club** · ★ 4.7 · 6:00 PM – 2:00 AM\n- **Bar Faro** · ★ 4.7");
    expect(s.ratingErrors.length).toBe(1);
    expect(s.hoursErrors.length).toBe(1);
  });
  it("attributes a rating to the place named just before it on the same line", () => {
    expect(scoreReply(nightlife, "**Marea Alta Club** to start, **Bar Faro** (★ 4.7) after.").ratingErrors).toEqual([]);
  });
  it("catches hours given for a place that has none", () => {
    expect(scoreReply(nightlife, "- **Noche Negra** · 10:00 PM – 4:00 AM").hoursErrors.length).toBe(1);
  });
  it("catches a disliked place being recommended", () => {
    expect(scoreReply(seafood, "Try **Casa do Peixe** tonight.").forbidden).toEqual(["Casa do Peixe"]);
    expect(scoreReply(seafood, "Try **Taberna Brasa** tonight.").forbidden).toEqual([]);
  });
  it("reads the language of a reply", () => {
    expect(languageOf("Estas son las discotecas que mejor encajan para una noche en la isla")).toBe("es");
    expect(languageOf("Voici les restaurants que je vous conseille pour ce soir avec des pâtes")).toBe("fr");
    expect(languageOf("These are the places for your night out, which suits you")).toBe("en");
    expect(scoreReply(SCENARIOS.find((s) => s.id === "nightlife-es")!, "Here are the clubs for you and your friends.").langOk).toBe(false);
  });
});

describe("the model eval's day scorer", () => {
  const three = DAY_CASES.find((c) => c.id === "three-days")!;
  const ok = JSON.stringify({ days: [
    { label: "Day 1", stops: [{ time: "10:00", title: "Art Gallery Norte", placeId: "d1" }, { time: "13:00", title: "Mercado Velho", placeId: "d2" }] },
    { label: "Day 2", stops: [{ time: "10:00", title: "Torre Alta", placeId: "d7" }, { time: "14:00", title: "Mercado do Rio", placeId: "d9" }] },
    { label: "Day 3", stops: [{ time: "09:30", title: "Cataratas Tours", placeId: "d13" }, { time: "13:00", title: "Roda Gigante Falls", placeId: "d15" }] },
  ] });
  it("passes a clean plan", () => expect(scoreDay(three, ok)).toEqual({ ok: true, problems: [] }));
  it("catches an invented stop, another day's stop, a bad id, a bad time and the wrong number of stops", () => {
    const bad = JSON.stringify({ days: [
      { label: "Day 1", stops: [{ time: "10:00", title: "Totally Made Up", placeId: "x" }, { time: "13:00", title: "Torre Alta", placeId: "d7" }] },
      { label: "Day 2", stops: [{ time: "10 am", title: "Torre Alta", placeId: "d7" }, { time: "14:00", title: "Mercado do Rio", placeId: "zzz" }] },
      { label: "Day 3", stops: [{ time: "09:30", title: "Cataratas Tours", placeId: "d13" }] },
    ] });
    const r = scoreDay(three, bad);
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/invented|wrong day|wrong id|time|stops/);
  });
  it("wants an empty day left empty, and a booked event kept", () => {
    const thin = DAY_CASES.find((c) => c.id === "thin-and-empty")!;
    const withStops = JSON.stringify({ days: [{ label: "Day 1", stops: [{ time: "10:00", title: "Castelo Pequeno", placeId: "t1" }, { time: "12:00", title: "Café da Torre", placeId: "t2" }] }, { label: "Day 2", stops: [{ time: "10:00", title: "Igreja Velha", placeId: "t3" }] }, { label: "Day 3", stops: [{ time: "10:00", title: "Invented", placeId: "q" }] }] });
    expect(scoreDay(thin, withStops).ok).toBe(false);
    const event = DAY_CASES.find((c) => c.id === "booked-event")!;
    const missing = JSON.stringify({ days: [{ label: "Day 1", stops: [{ time: "10:00", title: "Hall da Fama", placeId: "e1" }, { time: "13:00", title: "Churrasqueira Central", placeId: "e2" }] }, { label: "Day 2", stops: [{ time: "10:00", title: "Mercado Norte", placeId: "e4" }, { time: "13:00", title: "Café Rio", placeId: "e5" }] }] });
    expect(scoreDay(event, missing).problems).toContain("booked event missing");
  });
});
