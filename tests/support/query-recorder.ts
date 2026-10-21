/**
 * A recording Supabase stand-in for repository tests: each `.from(table)` chain logs its calls, and the terminal
 * (await / maybeSingle / single) resolves to the next result queued for that table.
 */
type Call = { table: string; method: string; args: unknown[] };

export function createRecorder(results: Record<string, Array<{ data?: unknown; error?: unknown }>>) {
  const calls: Call[] = [];
  const queues = new Map(Object.entries(results).map(([k, v]) => [k, [...v]]));
  const next = (table: string) => queues.get(table)?.shift() ?? { data: null, error: null };
  const client = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      const log = (method: string) => (...args: unknown[]) => { calls.push({ table, method, args }); return q; };
      for (const m of ["select", "eq", "lt", "in", "order", "range", "insert", "upsert"]) q[m] = log(m);
      const terminal = async () => ({ data: null, error: null, ...next(table) });
      q.maybeSingle = (...a: unknown[]) => { calls.push({ table, method: "maybeSingle", args: a }); return terminal(); };
      q.single = (...a: unknown[]) => { calls.push({ table, method: "single", args: a }); return terminal(); };
      q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => terminal().then(resolve, reject);
      return q;
    },
  };
  return { client: client as never, calls, of: (table: string, method: string) => calls.filter((c) => c.table === table && c.method === method) };
}
