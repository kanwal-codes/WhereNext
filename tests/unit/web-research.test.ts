import { beforeEach, describe, expect, it, vi } from "vitest";

const { detailedMock } = vi.hoisted(() => ({ detailedMock: vi.fn() }));
vi.mock("../../lib/server/ttl-cache", () => ({ cached: async (_k: string, _t: number, load: () => Promise<unknown>) => load() }));
vi.mock("../../packages/providers/tavily/client", () => ({ researchDetailed: detailedMock }));
vi.mock("../../packages/providers/exa/client", () => ({ research: vi.fn() }));
vi.mock("../../packages/providers/ticketmaster/client", () => ({ events: vi.fn().mockResolvedValue([]) }));
vi.mock("../../packages/providers/eventbrite/client", () => ({ localEvents: vi.fn().mockResolvedValue([]) }));

import { handleResearchWeb } from "../../lib/application/retrieve/handlers/research-web";
import { handleEvents } from "../../lib/application/retrieve/handlers/events";
import { TRAVEL_AUTHORITIES, webResearchPlan } from "../../lib/application/web-research-plan";

const page = (n: number) => ({ title: `Page ${n}`, url: `https://site${n}.example/p`, content: `content ${n}` });
const makeCtx = (filters: Record<string, unknown> = {}) => ({
  filters, signal: undefined, fail: () => () => undefined, geocode: vi.fn().mockResolvedValue([2.35, 48.85]),
  sources: [] as Array<{ title: string; url: string; content: string }>, eventList: [] as unknown[], eventsBroad: false, eventsWebFallback: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EXA_API_KEY;
  process.env.TAVILY_API_KEY = "k";
  process.env.TICKETMASTER_CONSUMER_KEY = "k";
  process.env.EVENTBRITE_API_KEY = "k";
});

describe("webResearchPlan", () => {
  it("reads only travel authorities for a guide-type question, and asks for a short answer to a plain fact", () => {
    expect(webResearchPlan("best neighbourhoods to stay in Rome")).toEqual({ domains: TRAVEL_AUTHORITIES, answer: false });
    expect(webResearchPlan("Lisbon known for")).toMatchObject({ domains: TRAVEL_AUTHORITIES });
    expect(webResearchPlan("is tap water safe to drink in Lisbon")).toEqual({ answer: true });
    expect(webResearchPlan("Toronto restaurant news")).toEqual({ answer: false });
  });
});

describe("handleResearchWeb", () => {
  it("asks for the travel authorities only for a guide question, and puts a short answer first, credited to the top page", async () => {
    detailedMock.mockResolvedValue({ results: [page(1), page(2)], answer: "Yes, it is safe." });
    const ctx = makeCtx();
    await handleResearchWeb({ tool: "research_web", query: "is tap water safe in Lisbon" }, ctx as never);
    expect(detailedMock).toHaveBeenCalledWith("is tap water safe in Lisbon", undefined, { answer: true });
    expect(ctx.sources[0]).toEqual({ title: "Summary of the top results", url: "https://site1.example/p#summary", content: "Yes, it is safe." });
    expect(ctx.sources).toHaveLength(3);
  });

  it("reads the authorities for a guide question, and asks the open web when they have almost nothing", async () => {
    detailedMock.mockResolvedValueOnce({ results: [page(1)], answer: null }).mockResolvedValueOnce({ results: [page(1), page(2), page(3)], answer: null });
    const ctx = makeCtx();
    await handleResearchWeb({ tool: "research_web", query: "best neighbourhoods to stay in Tinyville" }, ctx as never);
    expect(detailedMock).toHaveBeenNthCalledWith(1, "best neighbourhoods to stay in Tinyville", undefined, { domains: TRAVEL_AUTHORITIES, answer: false });
    expect(detailedMock).toHaveBeenNthCalledWith(2, "best neighbourhoods to stay in Tinyville", undefined, { answer: false });
    expect(ctx.sources).toHaveLength(3);
  });

  it("keeps the authorities' answer when there are enough of them", async () => {
    detailedMock.mockResolvedValue({ results: [page(1), page(2)], answer: null });
    await handleResearchWeb({ tool: "research_web", query: "best areas to stay in Rome" }, makeCtx() as never);
    expect(detailedMock).toHaveBeenCalledTimes(1);
  });
});

describe("handleEvents: the web when the ticket sites have nothing", () => {
  const call = { tool: "events" as const, query: "", location: "Paris, France", artist: null, category: null, dateScoped: true };

  it("sends the web pages to the reply as sources, once per turn, when Ticketmaster and Eventbrite found nothing", async () => {
    detailedMock.mockResolvedValue({ results: [page(1), page(2)], answer: null });
    const ctx = makeCtx({ tripStart: "2026-12-18", tripEnd: "2026-12-21" });
    await handleEvents(call, ctx as never);
    await handleEvents({ ...call, category: "concert" }, ctx as never);
    expect(detailedMock).toHaveBeenCalledTimes(1);
    expect(detailedMock.mock.calls[0][0]).toContain("Paris, France December 2026");
    expect(ctx.sources).toHaveLength(2);
    expect(ctx.eventList).toEqual([]);
  });

  it("does not search the web for a day-by-day plan, which never reads sources", async () => {
    const ctx = makeCtx({ placeLimit: 25 });
    await handleEvents(call, ctx as never);
    expect(detailedMock).not.toHaveBeenCalled();
  });

  it("does not search the web when the ticket sites had events", async () => {
    const { events } = await import("../../packages/providers/ticketmaster/client");
    vi.mocked(events).mockResolvedValueOnce([{ title: "Gig", url: "https://tm.example/1", date: "2026-12-19 20:00", venue: "Hall", imageUrl: null }] as never);
    const ctx = makeCtx();
    await handleEvents(call, ctx as never);
    expect(ctx.eventList).toHaveLength(1);
    expect(detailedMock).not.toHaveBeenCalled();
  });

  it("does nothing extra without a web key", async () => {
    delete process.env.TAVILY_API_KEY;
    await handleEvents(call, makeCtx() as never);
    expect(detailedMock).not.toHaveBeenCalled();
  });
});
