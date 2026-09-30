import { afterEach, describe, expect, it, vi } from "vitest";

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<object>()), generateObject: generateObjectMock }));

import { buildStructuredAnswer } from "../../lib/application/structured-answer";
import type { RetrievedEvidence } from "../../lib/application/retrieve";

const evidence = (sources: Array<{ title: string; url: string; content: string }> = []): RetrievedEvidence =>
  ({ places: [], sources, weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" }) as unknown as RetrievedEvidence;
const withNotes = evidence([{ title: "STM", url: "https://stm.info", content: "The Montreal metro runs 5:30am to 1am. A single fare is 3.75 CAD. Weekend unlimited pass is 15.25 CAD." }]);

afterEach(() => {
  vi.restoreAllMocks();
});

const stubModel = (content: unknown) => {
  generateObjectMock.mockImplementation(async ({ schema }: { schema: { parse: (v: unknown) => unknown } }) => ({
    object: schema.parse(typeof content === "string" ? JSON.parse(content) : content),
    usage: { inputTokens: 10, outputTokens: 10 },
  }));
};

describe("buildStructuredAnswer", () => {
  it("returns null when there are no web notes to work from", async () => {
    stubModel({ intro: "x", sections: [] });
    expect(await buildStructuredAnswer({ prompt: "how does the metro work?", tripSummary: "solo", evidence: evidence() })).toBeNull();
  });

  it("builds a sectioned answer with headings, bullets and optional detail", async () => {
    stubModel({
      intro: "The STM metro is cheap and easy — here's the rundown.",
      sections: [
        { heading: "Fares", bullets: [{ text: "Single ride", detail: "3.75 CAD" }, { text: "Weekend unlimited pass", detail: "15.25 CAD" }] },
        { heading: "Hours", bullets: [{ text: "Runs roughly 5:30am to 1am" }] },
      ],
    });
    const block = await buildStructuredAnswer({ prompt: "how does the metro work?", tripSummary: "solo", evidence: withNotes });
    expect(block).toMatchObject({ type: "structured_answer" });
    const b = block as { intro: string; sections: Array<{ heading: string; bullets: Array<{ text: string; detail?: string }> }> };
    expect(b.sections.map((s) => s.heading)).toEqual(["Fares", "Hours"]);
    expect(b.sections[0].bullets[0]).toEqual({ text: "Single ride", detail: "3.75 CAD" });
    expect(b.sections[1].bullets[0].detail).toBeUndefined();
  });

  it("returns null on an unparseable response", async () => {
    stubModel("not json");
    expect(await buildStructuredAnswer({ prompt: "x", tripSummary: "", evidence: withNotes })).toBeNull();
  });

  it("drops bare labels the notes had no answer for, and sections left empty", async () => {
    stubModel({ intro: "x", sections: [
      { heading: "Power", bullets: [{ text: "Plug type", detail: "Type A and B" }, { text: "Voltage" }] },
      { heading: "Money", bullets: [{ text: "Currency" }, { text: "Tipping" }] },
    ] });
    const block = await buildStructuredAnswer({ prompt: "plugs and currency?", tripSummary: "solo", evidence: withNotes });
    expect(block).toMatchObject({ type: "structured_answer", sections: [{ heading: "Power", bullets: [{ text: "Plug type", detail: "Type A and B" }] }] });
  });
});
