import { describe, expect, it } from "vitest";
import { missingDatesQuestion } from "../../lib/application/orchestrate/date-gate";
import { resolvedTurnSchema } from "../../lib/application/turn-resolver";

const plan = (toolPlan: unknown[], over: Record<string, unknown> = {}) => resolvedTurnSchema.parse({ language: "en", intent: "transport", toolPlan, ...over });
const flights = (extra: Record<string, unknown> = {}) => ({ tool: "flights", origin: "Toronto", destination: "Vancouver", ...extra });
const stays = (extra: Record<string, unknown> = {}) => ({ tool: "stays", location: "Lisbon", ...extra });
const ask = (resolved: ReturnType<typeof plan>, prompt = "cheap flights", rest: { previousReply?: string; tripStart?: string | null; tripEnd?: string | null } = {}) =>
  missingDatesQuestion({ resolved, prompt, ...rest });

describe("missingDatesQuestion", () => {
  it("asks for the day before searching flights with no date anywhere", () => {
    expect(ask(plan([flights()]))).toMatchObject({ question: "What day do you want to fly?", chips: expect.arrayContaining(["I'm flexible"]) });
  });
  it("asks for both dates when the traveller wants a return flight", () => {
    expect(ask(plan([flights()]), "return flights Toronto to Vancouver")?.question).toBe("What are your departure and return dates?");
  });
  it("asks only for the return day when the departure is known", () => {
    expect(ask(plan([flights({ departureDate: "2099-01-10" })]), "round trip to Vancouver on Jan 10")?.question).toBe("And when do you want to fly back?");
  });
  it("asks for check-in and check-out before searching stays", () => {
    expect(ask(plan([stays()], { intent: "stays" }), "show me a hotel in Lisbon")?.question).toBe("What are your check-in and check-out dates?");
  });
  it("asks one question when flights and stays are both missing a date", () => {
    expect(ask(plan([flights(), stays()]))?.question).toBe("What dates are you travelling?");
  });

  it("does not ask when the search already has its date", () => {
    expect(ask(plan([flights({ departureDate: "2099-01-10" })]))).toBeNull();
    expect(ask(plan([stays({ checkin: "2099-01-10" })]))).toBeNull();
  });
  it("does not ask when the trip has dates: the search fills them in", () => {
    expect(ask(plan([flights()]), "cheap flights", { tripStart: "2099-02-01" })).toBeNull();
    expect(ask(plan([stays()]), "hotels", { tripStart: "2099-02-01" })).toBeNull();
    expect(ask(plan([flights({ departureDate: "2099-01-10" })]), "return flights", { tripEnd: "2099-01-20" })).toBeNull();
  });
  it("does not ask twice: after Roam asked about dates, the traveller's answer or dodge goes to the search", () => {
    expect(ask(plan([flights()]), "I'm flexible", { previousReply: "What day do you want to fly?" })).toBeNull();
    expect(ask(plan([stays()]), "just show me", { previousReply: "What are your check-in and check-out dates?" })).toBeNull();
  });
  it("reads the last reply without the suggested-steps note the thread history adds to it", () => {
    const stored = "What day do you want to fly?\n\n[Suggested next steps shown to the user just now: \"Next weekend\" (Next weekend)]";
    expect(ask(plan([flights()]), "I'm flexible", { previousReply: stored })).toBeNull();
  });
  it("still asks after an unrelated question", () => {
    expect(ask(plan([flights()]), "cheap flights", { previousReply: "Want a quieter area instead?" })?.question).toBe("What day do you want to fly?");
  });
  it("leaves a named hotel alone: it was already shown with its dates", () => {
    expect(ask(plan([stays({ hotelName: "Memmo Alfama" })]), "what rooms does Memmo Alfama have"))
      .toBeNull();
  });
  it("leaves other languages to the router, and turns that need no date alone", () => {
    expect(ask(plan([flights()], { language: "es" }))).toBeNull();
    expect(ask(plan([{ tool: "search_places", query: "food" }], { intent: "food" }))).toBeNull();
    expect(ask(plan([flights()], { outOfScope: true }))).toBeNull();
    expect(ask(plan([flights()], { clarify: { question: "Which city?", chips: [] } }))).toBeNull();
  });
});
