/**
 * Audits recorded Roam replies (ai_turn_records) without a single model or provider call: is every price in the reply one the
 * traveller or the evidence gave, does it claim to have booked something, does the layout hold together, are there English slips.
 *
 *   bun run scripts/audit-turns.ts [--since 2026-11-19] [--limit 500] [--show 3] [--json out.json]
 *
 * Reads the LOCAL database only: REPLAY_DATABASE_URL (default the local Docker Supabase, port 54322). It never reads DATABASE_URL,
 * which in .env.local is production. A non-local host is refused unless you pass --allow-remote.
 */
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export type Finding = { check: string; detail: string };

const MONEY = /(?:CA\$|US\$|AU\$|NZ\$|\$|€|£|¥|₹)\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:CAD|USD|EUR|GBP|INR|JPY|AUD)\b/g;
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const norm = (raw: string) => String(Number(raw.replace(/,/g, "")));

/** Every money amount written in a reply, as a plain number string. */
export function moneyIn(text: string): string[] {
  return [...text.matchAll(MONEY)].map((m) => norm(m[1] ?? m[2]!)).filter((n) => n !== "NaN");
}

/** The numbers a reply may use: anything in the evidence, the prompt shown to the writer or what the traveller said, their rounded forms, and the sum or difference of any two of them (a saving is a difference, a total is a sum). */
export function allowedNumbers(haystack: string): Set<string> {
  const base = [...new Set([...haystack.matchAll(NUMBER)].map((m) => Number(m[0].replace(/,/g, ""))).filter((n) => Number.isFinite(n)))];
  const out = new Set<string>();
  for (const n of base) { out.add(String(n)); out.add(String(Math.round(n))); }
  const prices = base.filter((n) => n >= 20 && n < 100000).slice(0, 400);
  for (let i = 0; i < prices.length; i++) for (let j = i + 1; j < prices.length; j++) {
    const d = Math.abs(prices[i]! - prices[j]!); const t = prices[i]! + prices[j]!;
    out.add(String(Math.round(d))); out.add(String(d)); out.add(String(Math.round(t))); out.add(String(t));
  }
  return out;
}

const BOOKING_CLAIM = /\b(?:i(?:'ve| have|’ve)?\s+(?:just\s+)?(?:booked|reserved|confirmed|held|purchased|bought|secured)|(?:your|the)\s+(?:flight|room|hotel|table|booking|reservation|stay)\s+(?:is|has been|was)\s+(?:booked|confirmed|reserved|held)|(?:booking|reservation)\s+(?:is\s+)?confirmed|i(?:'ll|’ll| will)\s+(?:book|reserve)\s+(?:it|that|this|the))\b/i;

/** Slips a reader would notice, found by pattern alone (no model): a cheap net, not a grammar checker. */
export function layoutAndEnglish(reply: string): Finding[] {
  const out: Finding[] = [];
  const text = reply.replace(/\r/g, "");
  if (((text.match(/\*\*/g) ?? []).length) % 2 === 1) out.push({ check: "layout:unbalanced-bold", detail: "an odd number of ** marks" });
  if (/^#{1,6}\s/m.test(text)) out.push({ check: "layout:heading", detail: "a markdown heading in a chat reply" });
  if (/ {2,}\S/.test(text.replace(/^\s+/gm, ""))) out.push({ check: "english:double-space", detail: "two spaces in a row" });
  if (/\s[,.](?=\s|$)/.test(text)) out.push({ check: "english:space-before-punctuation", detail: (text.match(/.{0,18}\s[,.](?=\s|$)/) ?? [""])[0] });
  const dup = text.match(/\b([A-Za-z]{2,})\s+\1\b/i);
  if (dup && !/^(had|that|is|do|so|very)$/i.test(dup[1]!)) out.push({ check: "english:repeated-word", detail: dup[0] });
  if (/(?:^|[.!?]\s+)[a-z][a-z]+\b/.test(text.replace(/\b(?:e\.g|i\.e|vs|etc|approx|a\.m|p\.m)\./gi, "").replace(/\d+\.\s+[a-z]/g, "").replace(/\b[A-Z][a-z]{0,2}\.(?=\s+[a-z])/g, "St").replace(/[A-Za-z]+\.[a-z]+/g, "x"))) out.push({ check: "english:sentence-starts-lowercase", detail: (text.match(/[.!?]\s+[a-z][a-z]+\b.{0,16}/) ?? [""])[0] });
  if (/\bi\b(?![.'’])/.test(text.replace(/`[^`]*`/g, ""))) out.push({ check: "english:lowercase-i", detail: (text.match(/.{0,12}\bi\b.{0,12}/) ?? [""])[0] });
  const last = text.trim().split("\n").pop() ?? "";
  if (text.trim().length > 40 && !/[.!?:)”"'\]*]$/.test(last.trim()) && !/^\s*(?:[-*•]|\d+\.)\s/.test(last) && !/[\p{Emoji_Presentation}]$/u.test(last.trim())) out.push({ check: "layout:ends-mid-sentence", detail: last.slice(-40) });
  if (/\.{4,}|!{2,}|\?{2,}/.test(text)) out.push({ check: "english:stacked-punctuation", detail: (text.match(/.{0,10}(?:\.{4,}|!{2,}|\?{2,})/) ?? [""])[0] });
  return out;
}

/** Audit one recorded turn: the reply against what the writer was shown and what the traveller said. */
export function auditReply(input: { reply: string; prompt: string; history: Array<{ content: string }>; systemPrompt?: string | null; evidence?: unknown }): Finding[] {
  const { reply } = input;
  const out: Finding[] = [];
  const claim = reply.match(BOOKING_CLAIM);
  if (claim) out.push({ check: "truth:claims-booking", detail: claim[0] });
  const haystack = [input.systemPrompt ?? "", input.evidence ? JSON.stringify(input.evidence) : "", input.prompt, ...input.history.map((h) => h.content)].join("\n");
  // A reply with no evidence at all (a clarifying question, a decline) has nothing to ground a price in: any price there is invented.
  const allowed = allowedNumbers(haystack);
  for (const amount of new Set(moneyIn(reply))) if (!allowed.has(amount)) out.push({ check: "truth:ungrounded-price", detail: amount });
  out.push(...layoutAndEnglish(reply));
  return out;
}

type Row = { id: string; created_at: string; kind: string; prompt: string; history: Array<{ content: string }>; system_prompt: string | null; evidence: unknown; reply: string | null };

async function main() {
  const a = process.argv.slice(2);
  const get = (flag: string) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : undefined; };
  const since = get("--since");
  const limit = Number(get("--limit") ?? 500);
  const show = Number(get("--show") ?? 3);
  const url = process.env.REPLAY_DATABASE_URL ?? LOCAL_URL;
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host) && !a.includes("--allow-remote")) throw new Error(`Refusing ${host}: this audit reads the local database only (pass --allow-remote to override)`);
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const rows = await sql<Row[]>`
      select id, created_at, kind, prompt, history, system_prompt, evidence, reply from ai_turn_records
      where reply is not null and (${since ?? null}::timestamptz is null or created_at >= ${since ?? null}::timestamptz)
      order by created_at desc limit ${limit}`;
    const byCheck = new Map<string, Array<{ id: string; prompt: string; detail: string }>>();
    let flaggedTurns = 0;
    const perTurn: Array<{ id: string; prompt: string; findings: Finding[] }> = [];
    for (const r of rows) {
      const findings = auditReply({ reply: r.reply!, prompt: r.prompt, history: r.history ?? [], systemPrompt: r.system_prompt, evidence: r.evidence });
      if (findings.length) flaggedTurns += 1;
      perTurn.push({ id: r.id, prompt: r.prompt, findings });
      for (const f of findings) byCheck.set(f.check, [...(byCheck.get(f.check) ?? []), { id: r.id, prompt: r.prompt, detail: f.detail }]);
    }
    console.log(`${rows.length} replies audited, ${flaggedTurns} with at least one finding\n`);
    for (const [check, list] of [...byCheck].sort((x, y) => y[1].length - x[1].length)) {
      console.log(`${String(list.length).padStart(4)}  ${check}`);
      for (const f of list.slice(0, show)) console.log(`        "${f.prompt.slice(0, 60)}" -> ${f.detail.slice(0, 60)}`);
    }
    const out = get("--json");
    if (out) writeFileSync(out, JSON.stringify(perTurn, null, 1));
  } finally {
    await sql.end();
  }
}

if (import.meta.main) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
