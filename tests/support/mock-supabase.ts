import { vi } from "vitest";

/**
 * A chainable Supabase stub good enough for the route/eval tests: every builder method
 * returns the same object, and the terminal reads resolve to whatever you configured.
 * Extracted from tests/unit/ai-route.test.ts so the eval suite shares one scaffold.
 */
export function createMockSupabase(opts: {
  user?: { id: string } | null;
  member?: Record<string, unknown> | null;
  /** Rows returned by `.from(...).select(...).maybeSingle()` per table (falls back to `member`). */
  singles?: Record<string, unknown>;
}) {
  const user = opts.user === undefined ? { id: "u1" } : opts.user;
  const member = opts.member === undefined ? { trip_id: "trip", role: "owner" } : opts.member;
  const singles = opts.singles ?? {};

  const makeQuery = (table: string) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    for (const m of ["select", "eq", "order", "limit", "is", "contains", "in", "not", "match", "gte", "lte", "range"]) q[m] = chain;
    q.maybeSingle = async () => ({ data: table in singles ? singles[table] : member, error: null });
    q.single = q.maybeSingle;
    q.upsert = () => ({ select: () => ({ single: async () => ({ data: { id: "x" }, error: null }), maybeSingle: async () => ({ data: { id: "x" }, error: null }) }) });
    q.insert = q.upsert;
    q.update = () => ({ eq: chain, select: () => ({ maybeSingle: async () => ({ data: { id: "x" }, error: null }) }) });
    q.delete = () => ({ eq: chain });
    q.then = undefined;
    return q;
  };

  return {
    auth: { getUser: async () => ({ data: { user } }), signOut: vi.fn(async () => undefined) },
    from: (table: string) => makeQuery(table),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
}
