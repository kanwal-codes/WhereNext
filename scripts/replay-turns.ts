/**
 * Replays recorded Roam turns (ai_turn_records) against the code as it is now, so a change to the router, the flight judgement or
 * the prompt can be checked on real questions without paid provider calls.
 *
 *   bun run scripts/replay-turns.ts --list [--limit 20]
 *   bun run scripts/replay-turns.ts --stage judge [--limit 50]
 *       free: flight judgement on the recorded flight evidence; prints the sentences Roam is now given
 *   bun run scripts/replay-turns.ts --stage resolve [--repeat 3] [--limit 20] [--id <record id>]
 *       re-asks the router the recorded question (a paid model call per run) and reports where its plan differs from the
 *       recorded one and from itself. Needs ANTHROPIC_API_KEY in the shell, nothing else from .env.local.
 *
 * Reads the LOCAL database only: REPLAY_DATABASE_URL (default the local Docker Supabase, port 54322). It never reads DATABASE_URL,
 * which in .env.local is production. A non-local host is refused unless you pass --allow-remote.
 */
import postgres from "postgres";
import { judgeFlights } from "../lib/application/flight-judgement";
import { resolveTurn } from "../lib/application/turn-resolver";

const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type Rec = { id: string; created_at: string; kind: string; prompt: string; history: Array<{ role: "user" | "assistant"; content: string }>; trip_summary: string | null; resolved: PlanLike; evidence: { flights?: Parameters<typeof judgeFlights>[0][] } | null };
type PlanLike = { intent?: string; capabilities?: string[]; toolPlan?: Array<{ tool: string }>; clarify?: unknown; outOfScope?: boolean };

/** What the router decided, as one comparable string: intent, structured answers asked for, which tools, whether it asked back or declined. */
export function routeSignature(plan: PlanLike): string {
  const tools = [...new Set((plan.toolPlan ?? []).map((call) => call.tool))].sort().join("+") || "none";
  const caps = [...(plan.capabilities ?? [])].sort().join("+") || "none";
  return `${plan.intent ?? "?"} | caps:${caps} | tools:${tools}${plan.clarify ? " | clarify" : ""}${plan.outOfScope ? " | out-of-scope" : ""}`;
}

/** How a set of re-run plans compares: how many agree with the recorded plan, how many distinct plans came back at all. */
export function compareRoutes(recorded: PlanLike, reruns: PlanLike[]) {
  const want = routeSignature(recorded);
  const got = reruns.map(routeSignature);
  return { recorded: want, same: got.filter((g) => g === want).length, runs: got.length, distinct: [...new Set(got)] };
}

function args() {
  const a = process.argv.slice(2);
  const get = (flag: string) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : undefined; };
  const limit = Number(get("--limit") ?? 20);
  const repeat = Number(get("--repeat") ?? 3);
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive whole number");
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) throw new Error("--repeat must be 1 to 10");
  return { list: a.includes("--list"), stage: get("--stage") ?? "judge", limit, repeat, id: get("--id"), allowRemote: a.includes("--allow-remote") };
}

async function main() {
  const opts = args();
  const url = process.env.REPLAY_DATABASE_URL ?? LOCAL_URL;
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host) && !opts.allowRemote) throw new Error(`Refusing ${host}: replay reads the local database only (pass --allow-remote to override)`);
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const rows = await sql<Rec[]>`
      select id, created_at, kind, prompt, history, trip_summary, resolved, evidence from ai_turn_records
      where (${opts.id ?? null}::uuid is null or id = ${opts.id ?? null}::uuid)
      order by created_at desc limit ${opts.limit}`;
    if (!rows.length) return console.log("No recorded turns yet. Turns are recorded when the app runs (not in production unless ROAM_RECORD_TURNS=1).");

    if (opts.list) {
      for (const r of rows) console.log(`${r.id}  ${new Date(r.created_at).toISOString().slice(0, 16)}  ${r.kind.padEnd(10)} ${routeSignature(r.resolved)}\n    ${r.prompt.slice(0, 100)}`);
      return;
    }

    if (opts.stage === "judge") {
      let shown = 0;
      for (const r of rows) {
        const searches = r.evidence?.flights ?? [];
        if (!searches.length) continue;
        shown += 1;
        console.log(`\n${r.id}  "${r.prompt.slice(0, 90)}"`);
        for (const search of searches) for (const line of judgeFlights(search).read) console.log(`  - ${line}`);
      }
      if (!shown) console.log("None of these turns retrieved flights.");
      return;
    }

    if (opts.stage === "resolve") {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("--stage resolve calls the model: set ANTHROPIC_API_KEY in the shell (it does not read .env.local)");
      console.log(`Re-asking the router ${rows.length} question(s) x ${opts.repeat} (${rows.length * opts.repeat} paid calls)...\n`);
      let unstable = 0;
      let changed = 0;
      for (const r of rows) {
        const reruns: PlanLike[] = [];
        for (let i = 0; i < opts.repeat; i++) reruns.push(await resolveTurn({ message: r.prompt, history: r.history, tripSummary: r.trip_summary ?? "" }));
        const c = compareRoutes(r.resolved, reruns);
        if (c.distinct.length > 1) unstable += 1;
        if (c.same < c.runs) changed += 1;
        const flag = c.distinct.length > 1 ? "UNSTABLE" : c.same < c.runs ? "CHANGED " : "same    ";
        console.log(`${flag} ${c.same}/${c.runs}  "${r.prompt.slice(0, 80)}"`);
        if (c.same < c.runs) { console.log(`    recorded: ${c.recorded}`); for (const d of c.distinct) console.log(`    now:      ${d}`); }
      }
      console.log(`\n${rows.length} turns: ${changed} differ from the recording, ${unstable} give a different plan from one run to the next.`);
      return;
    }
    throw new Error("--stage must be judge or resolve");
  } finally {
    await sql.end();
  }
}

if (import.meta.main) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
