import { beforeEach, describe, expect, it, vi } from "vitest";

const store: { data: Record<string, unknown> } = { data: {} };
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { data: store.data }, error: null }) }) }),
      upsert: (row: { data: Record<string, unknown> }) => ({ select: () => ({ single: async () => { store.data = row.data; return { data: { data: row.data, updated_at: "now" }, error: null }; } }) }),
    }),
  }),
}));

import { PUT } from "@/app/api/profile/route";

const put = (body: unknown) => PUT(new Request("http://t/api/profile", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({}) });

describe("profile PUT", () => {
  beforeEach(() => { store.data = { pace: "Slow", budget: "Lean", groupType: "Solo", interests: ["Hiking"] }; });

  it("null clears a pace, budget or company that was chosen, and leaves the rest", async () => {
    expect((await put({ pace: null, budget: null, groupType: null })).status).toBe(200);
    expect(store.data).toEqual({ interests: ["Hiking"] });
  });
  it("leaves a stored choice alone when the field is not sent", async () => {
    await put({ interests: ["Wine"] });
    expect(store.data).toMatchObject({ pace: "Slow", budget: "Lean", groupType: "Solo", interests: ["Wine"] });
  });
});
