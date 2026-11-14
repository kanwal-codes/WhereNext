/**
 * Writes the replies travellers rated (down by default) as a file the Roam eval review page loads:
 * evals/roam/review/index.html -> "Results" -> choose the file this writes. Each row carries the question, the reply text,
 * the cards, the trace row and the traveller's note, in the shape promptfoo's output/latest.json has, so a rated reply is
 * labeled the same way an eval run is and a failure you can name becomes an eval case (evals/roam/cases.cjs).
 *
 *   bun run scripts/export-feedback.ts [--rating down|up|all] [--since 2026-11-01] [--limit 200] [--out path.json]
 *
 * Reads the LOCAL database only: EXPORT_DATABASE_URL (default the local Docker Supabase, port 54322). It never reads
 * DATABASE_URL, which in .env.local is production. A non-local host is refused unless you pass --allow-remote.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import postgres from "postgres";

const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type Row = {
  message_id: string; trip_id: string; rating: "up" | "down"; note: string | null; rated_at: Date; replied_at: Date;
  content: string; metadata: { blocks?: unknown[]; sources?: Array<{ title?: string }>; language?: string; unverified?: boolean; suggestedFollowups?: unknown[] } | null;
  question: string | null; destination: string | null; travelers: number | null; group_type: string | null;
  trace: Record<string, unknown> | null;
};

/** Every `name` in a block, so a reviewer can see which places were in a card (same walk as evals/roam/provider.cjs). */
export function namesIn(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => namesIn(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "name" && typeof v === "string") out.push(v);
      else namesIn(v, out);
    }
  }
  return out;
}

/** One rated reply in the shape review/index.html reads from a promptfoo result. */
export function toReviewResult(row: Row) {
  const md = row.metadata ?? {};
  const blocks = (md.blocks ?? []).map((b) => ({ type: (b as { type?: string }).type ?? "?", names: [...new Set(namesIn(b))].slice(0, 40) }));
  const feedback = { rating: row.rating, note: row.note, ratedAt: row.rated_at.toISOString(), messageId: row.message_id, tripId: row.trip_id };
  return {
    testCase: { description: `feedback-${row.message_id.slice(0, 8)}`, metadata: { tags: ["feedback", `rated-${row.rating}`] } },
    response: {
      output: row.content,
      metadata: {
        trip: { destination: row.destination ?? "?", travelers: row.travelers ?? "?", groupType: row.group_type ?? "" },
        message: row.question ?? "",
        turns: [{ q: row.question ?? "", text: row.content }],
        blocks,
        trace: row.trace ?? {},
        progress: [],
        sourceTitles: (md.sources ?? []).map((s) => s.title).filter(Boolean),
        language: md.language ?? null,
        unverified: Boolean(md.unverified),
        suggestedFollowups: md.suggestedFollowups ?? [],
        feedback,
      },
    },
    // No automated checks ran on a real reply: the review page shows an empty list instead of failing to load one.
    gradingResult: { pass: row.rating === "up", componentResults: [] },
  };
}

function args() {
  const a = process.argv.slice(2);
  const get = (flag: string) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : undefined; };
  const rating = get("--rating") ?? "down";
  if (!["down", "up", "all"].includes(rating)) throw new Error("--rating must be down, up or all");
  const since = get("--since");
  if (since && Number.isNaN(Date.parse(since))) throw new Error("--since must be a date such as 2026-11-01");
  const limit = Number(get("--limit") ?? 500);
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive whole number");
  return { rating, since, limit, out: get("--out") ?? join("evals", "roam", "output", "feedback.json"), allowRemote: a.includes("--allow-remote") };
}

async function main() {
  const opts = args();
  const url = process.env.EXPORT_DATABASE_URL ?? LOCAL_URL;
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host) && !opts.allowRemote) {
    throw new Error(`Refusing ${host}: this export reads the local database only (pass --allow-remote to override)`);
  }
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    // The trace row has no message id (ai_turn_traces predates feedback), so the nearest trace in the same trip within a minute
    // of the reply being saved is taken as its own. ponytail: two members' turns finishing in the same second can swap traces;
    // store the trace id on the reply's metadata if that ever shows up.
    const rows = await sql<Row[]>`
      select f.message_id, f.trip_id, f.rating, f.note, f.created_at as rated_at, m.created_at as replied_at, m.content, m.metadata,
        q.content as question, t.destination, t.travelers, tp.data ->> 'groupType' as group_type, to_jsonb(tr) - 'id' - 'trip_id' as trace
      from roam_reply_feedback f
      join conversation_messages m on m.id = f.message_id
      join trips t on t.id = f.trip_id
      left join trip_preferences tp on tp.trip_id = f.trip_id
      left join lateral (
        select content from conversation_messages
        where thread_id = m.thread_id and role = 'user' and created_at <= m.created_at order by created_at desc, id desc limit 1
      ) q on true
      left join lateral (
        select * from ai_turn_traces
        where trip_id = f.trip_id and created_at between m.created_at - interval '5 seconds' and m.created_at + interval '60 seconds'
        order by abs(extract(epoch from created_at - m.created_at)) limit 1
      ) tr on true
      where (${opts.rating} = 'all' or f.rating = ${opts.rating})
        and (${opts.since ?? null}::timestamptz is null or f.created_at >= ${opts.since ?? null}::timestamptz)
      order by f.created_at desc
      limit ${opts.limit}`;
    const results = rows.map(toReviewResult);
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, JSON.stringify({ results: { results } }, null, 1));
    console.log(`${results.length} ${opts.rating === "all" ? "rated" : `${opts.rating}-rated`} repl${results.length === 1 ? "y" : "ies"} -> ${opts.out}`);
  } finally {
    await sql.end();
  }
}

if (import.meta.main) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
