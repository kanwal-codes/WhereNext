import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();
let signedIn = true;
vi.mock("@/lib/server/trip-auth", () => ({
  requireUser: async () => { if (!signedIn) throw Object.assign(new Error("unauthenticated"), { status: 401 }); return { user: { id: "u" }, guest: false, supabase: {} }; },
  tripAuthResponse: (e: { status?: number }) => (e?.status === 401 ? new Response("{}", { status: 401 }) : null),
}));
vi.mock("@/packages/ai/model-policy", () => ({ generateText: (...a: unknown[]) => generateText(...a) }));
vi.mock("@/lib/application/evaluator", () => ({ finalizeAssistantText: async (text: string) => text }));

import { POST } from "@/app/api/listing-chat/route";

const ask = (body: unknown) => POST(new Request("https://app.test/api/listing-chat", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({}) });
const hotel = { name: "Hotel Avenida", detail: "Hotel, 4-star", price: "from $140 per night", rating: "8.6/10 from 1,204 reviews", address: "Av. da Liberdade, Lisbon" };
beforeEach(() => { generateText.mockReset(); signedIn = true; });

describe("a question about a listing, with no trip open", () => {
  it("answers from the listing's own facts, and says nothing of a trip's plans, budget or stay", async () => {
    generateText.mockResolvedValue("**Yes.** A calm 4-star on the main avenue.");
    const res = await ask({ items: [hotel], messages: [{ role: "user", content: "Is it worth it?" }] });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Yes");
    const system = (generateText.mock.calls[0]![1] as Array<{ content: string }>)[0]!.content;
    expect(system).toContain("No trip is open");
    expect(system).toContain("Hotel Avenida");
    expect(system).toContain("from $140 per night");
    expect(system).toContain("say nothing about their plans, budget or where they are staying");
    expect(system).not.toContain("Fits your trip");
    expect(system).not.toContain("Trip context");
  });
  it("asks for a signed-in visitor, not a stranger", async () => {
    signedIn = false;
    expect((await ask({ items: [hotel], messages: [{ role: "user", content: "Hi?" }] })).status).toBe(401);
    expect(generateText).not.toHaveBeenCalled();
  });
  it("turns away a malformed question", async () => {
    expect((await ask({ items: [], messages: [] })).status).toBe(400);
    expect(generateText).not.toHaveBeenCalled();
  });
});
