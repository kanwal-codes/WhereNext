import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = new Map<string, { value: unknown; hits: number; expires_at: string }>();
vi.mock("../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      let key = "";
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (_c: string, v: string) => { key = v; return q; },
        gt: () => q,
        maybeSingle: async () => {
          const row = rows.get(key);
          return { data: row && row.expires_at > new Date().toISOString() ? row : null };
        },
        update: (patch: { hits: number }) => ({ eq: (_c: string, k: string) => { const r = rows.get(k); if (r) r.hits = patch.hits; return Promise.resolve({}); } }),
        upsert: (row: { key: string; value: unknown; expires_at: string }) => { rows.set(row.key, { value: row.value, hits: 0, expires_at: row.expires_at }); return Promise.resolve({}); },
      };
      return q;
    },
  }),
}));

import { persisted } from "../../lib/server/provider-store";

beforeEach(() => rows.clear());

describe("provider store", () => {
  it("loads once, then serves the saved value and counts the hit", async () => {
    let loads = 0;
    const load = async () => { loads += 1; return [{ url: "https://a.test" }]; };
    await expect(persisted("research-web:tavily:x", 60_000, load)).resolves.toEqual([{ url: "https://a.test" }]);
    await vi.waitFor(() => expect(rows.has("research-web:tavily:x")).toBe(true));
    await expect(persisted("research-web:tavily:x", 60_000, load)).resolves.toEqual([{ url: "https://a.test" }]);
    expect(loads).toBe(1);
    await vi.waitFor(() => expect(rows.get("research-web:tavily:x")?.hits).toBe(1));
  });

  it("does not keep an empty result", async () => {
    await persisted("research-web:tavily:none", 60_000, async () => []);
    await new Promise((r) => setTimeout(r, 10));
    expect(rows.has("research-web:tavily:none")).toBe(false);
  });
});
