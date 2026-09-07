import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStructuredAnswer } from "../../lib/application/structured-answer";
import type { RetrievedEvidence } from "../../lib/application/retrieve";

const evidence = (sources: Array<{ title: string; url: string; content: string }> = []): RetrievedEvidence =>
  ({ places: [], sources, weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" }) as unknown as RetrievedEvidence;
const withNotes = evidence([{ title: "STM", url: "https://stm.info", content: "The Montreal metro runs 5:30am to 1am. A single fare is 3.75 CAD. Weekend unlimited pass is 15.25 CAD." }]);

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
});

const stubModel = (content: unknown) => {
  process.env.AI_PROVIDER = "openai-compatible";
  process.env.AI_API_KEY = "k";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), { status: 200 }),
  ));
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
});
