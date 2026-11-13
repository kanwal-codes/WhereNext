/**
 * Compares models on the three jobs the app gives them, scored by code (no human reading replies):
 *   resolve  the router: valid JSON, the right intent, the right tools (the repo's own 30-case grade set)
 *   reply    the written answer, from invented-but-realistic evidence: invented names, numbers not in the evidence, another place's rating or
 *            hours, a disliked place recommended, the wrong language
 *   day      the day writer: strict JSON, only that day's places, 2-4 stops, valid times, a booked event kept
 * Real calls, a few dollars for a full run. Needs ANTHROPIC_API_KEY, OPENAI_API_KEY and GOOGLE_GEMINI_API (a missing key shows as errors).
 *
 *   bun run scripts/model-eval/run.ts                              # everything, six models
 *   bun run scripts/model-eval/run.ts --jobs reply --runs 3        # one job, three samples per case
 *   bun run scripts/model-eval/run.ts --models claude-sonnet-5-5,gpt-5.5
 *   bun run scripts/model-eval/run.ts --models gemini-3.5-flash-lite --merge   # rerun some models, keep the others from raw.json

 *   bun run scripts/model-eval/run.ts --rescore                   # re-judge the saved replies with the current scorer, no model calls
 *   GEMINI_CONCURRENCY=1 GEMINI_GAP_MS=3000 bun run ...   # Gemini keys have a low per-minute quota
 * Writes docs/qa/model-eval/RESULTS.md and raw.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { RESOLVE_SYSTEM, resolvedTurnSchema } from "../../lib/application/turn-resolver";
import { DAY_SYSTEM } from "../../lib/application/itinerary-days";
import { compactEvidence } from "../../lib/application/orchestrate/evidence-compaction";
import { buildComposeSystemPrompt } from "../../lib/application/orchestrate/system-prompt-builder";
import { RESOLVE_GRADE_SET } from "../../tests/support/resolve-grade-set";
import { scoreToolPlan } from "../../tests/support/score-tool-plan";
import { DAY_CASES, SCENARIOS, type Scenario } from "./fixtures";
import { MODELS, call, extractJson, type CallResult, type Model } from "./providers";
import { scoreDay, scoreReply } from "./score";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const jobs = new Set((arg("jobs") ?? "resolve,reply,day").split(","));
const runs = Number(arg("runs") ?? 2);
const chosen = arg("models") ? MODELS.filter((m) => arg("models")!.split(",").includes(m.id)) : MODELS;
const today = new Date().toISOString().slice(0, 10);

const p50 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] / 1000 : NaN);
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");
const sec = (n: number) => (Number.isNaN(n) ? "–" : `${n.toFixed(1)}s`);
const key = (m: Model) => `${m.provider}/${m.id}`;

type Row = { model: Model; job: string; id: string; run: number; res: CallResult; detail: Record<string, unknown> };
const rows: Row[] = [];
const tasks: Array<Promise<void>> = [];
const RESCORE = process.argv.includes("--rescore");
const add = (model: Model, job: string, id: string, run: number, system: string, user: string, json: boolean, grade: (res: CallResult) => Record<string, unknown>) =>
  RESCORE ? undefined : tasks.push(call(model, system, user, { json }).then((res) => { rows.push({ model, job, id, run, res, detail: res.error ? { error: res.error } : grade(res) }); }));

// ---- resolve -----------------------------------------------------------------------------------------------------------------
if (jobs.has("resolve")) {
  const system = `${RESOLVE_SYSTEM}\nReturn ONLY the JSON object.`;
  for (const m of chosen) for (const c of RESOLVE_GRADE_SET) {
    const user = `Today's date: ${today}\nTrip so far: ${c.tripSummary}\n\nConversation:\nuser: ${c.message}`;
    add(m, "resolve", c.id, 0, system, user, true, (res) => {
      try {
        const plan = resolvedTurnSchema.parse(extractJson(res.text));
        const s = scoreToolPlan(c.expect, { intent: plan.intent, tools: plan.toolPlan.map((t) => t.tool) });
        return { valid: true, intent: plan.intent, wantIntent: c.expect.intent, intentMatch: s.intentMatch, toolF1: s.toolF1, missing: s.missing, extra: s.extra };
      } catch (e) { return { valid: false, why: String((e as Error).message).slice(0, 120) }; }
    });
  }
}

// ---- reply -------------------------------------------------------------------------------------------------------------------
function composePrompt(s: Scenario) {
  const toolPlan = [
    ...(s.evidence.places.length ? [{ tool: "search_places" as const, query: s.query, location: s.focus }] : []),
    ...(s.evidence.events.length ? [{ tool: "events" as const, query: "", location: s.focus, artist: null, category: null, dateScoped: true }] : []),
    ...(s.evidence.sources.length ? [{ tool: "research_web" as const, query: s.query }] : []),
  ];
  const compact = compactEvidence({ evidence: s.evidence, toolPlan: toolPlan as never, requestedImages: false, photoUrl: (n: string) => n });
  const tripCtx: any = { trip: null, places: [], itinerary: [], preferences: {}, decisions: [], lockedTitles: [], lockedPlaces: [], reservations: [], localExpenses: [], localBalances: [] };
  return buildComposeSystemPrompt({
    hasGrounding: true, locationFocus: s.focus, dislikes: s.dislikes ?? [], accessibilityNeeds: [], surfacedEarlier: new Set(), requestedImages: false, tripCtx, intent: s.intent, evidence: s.evidence, compactSources: compact.compactSources,
    showsItineraryBlock: false, mapCards: s.evidence.places.length ? ["the place cards"] : [], showsBudgetBlock: false, exploreKind: null, eventsGuidance: compact.eventsGuidance, compactFlights: compact.compactFlights, compactStays: compact.compactStays,
    tripSummary: "no trip yet", context: "", compactPlaces: compact.compactPlaces, compactEvents: compact.compactEvents, photoUrl: (n: string) => n, language: s.lang,
  } as never);
}
if (jobs.has("reply")) {
  const prompts = new Map(SCENARIOS.map((s) => [s.id, composePrompt(s)]));
  for (const m of chosen) for (const s of SCENARIOS) for (let r = 0; r < runs; r++)
    add(m, "reply", s.id, r, prompts.get(s.id)!, s.query, false, (res) => ({ ...scoreReply(s, res.text), text: res.text }));
}

// ---- day writer --------------------------------------------------------------------------------------------------------------
if (jobs.has("day")) {
  const system = `${DAY_SYSTEM("en")}\nReturn ONLY the JSON object.`;
  for (const m of chosen) for (const c of DAY_CASES) for (let r = 0; r < runs; r++) {
    const body = c.days.map((d) => `=== Day ${d.number}\nCANDIDATES:\n${d.candidates.length ? d.candidates.map(([n, id, cat, kind, trip]) => `- ${n} | id:${id} | ${cat} | kind: ${kind}${trip ? ", day trip" : ""}`).join("\n") : "(none)"}${d.events?.length ? `\nEVENTS on this day (title | time | venue):\n${d.events.map((e) => `- ${e}`).join("\n")}` : ""}${d.must ? `\nMUST (booked): ${d.must}` : ""}`).join("\n\n");
    add(m, "day", c.id, r, system, `Traveller: ${c.traveller}\nPace: moderate\nRequest: ${c.request}\n\n${body}`, true, (res) => ({ ...scoreDay(c, res.text), text: res.text.slice(0, 1500) }));
  }
}

console.log(`${tasks.length} calls · models: ${chosen.map((m) => m.id).join(", ")} · jobs: ${[...jobs].join(", ")} · ${runs} runs for reply/day`);
const started = performance.now();
// --rescore: no calls. Every saved reply is judged again by the current scorer (the replies were saved in raw.json).
if (process.argv.includes("--rescore") && existsSync("docs/qa/model-eval/raw.json")) {
  const saved = JSON.parse(readFileSync("docs/qa/model-eval/raw.json", "utf8")) as Array<{ model: string; job: string; id: string; run: number; ms: number; inTok: number; outTok: number; retries: number; error?: string; detail: Record<string, any> }>;
  for (const e of saved) {
    const model = MODELS.find((m) => m.id === e.model);
    if (!model) continue;
    const scenario = SCENARIOS.find((s) => s.id === e.id);
    const detail = e.job === "reply" && scenario && e.detail.text ? { ...scoreReply(scenario, e.detail.text), text: e.detail.text } : e.detail;
    rows.push({ model, job: e.job, id: e.id, run: e.run, res: { text: "", ms: e.ms, inTok: e.inTok, outTok: e.outTok, retries: e.retries, error: e.error }, detail });
  }
}
const tick = setInterval(() => process.stdout.write(`\r${rows.length}/${tasks.length} done `), 2000);
await Promise.all(tasks);
clearInterval(tick);
// --merge: keep the earlier rows of models this run did not touch, so one model can be rerun without losing the rest.
if (process.argv.includes("--merge") && existsSync("docs/qa/model-eval/raw.json")) {
  const earlier = JSON.parse(readFileSync("docs/qa/model-eval/raw.json", "utf8")) as Array<{ model: string; job: string; id: string; run: number; ms: number; inTok: number; outTok: number; retries: number; error?: string; detail: Record<string, unknown> }>;
  for (const e of earlier) {
    const model = MODELS.find((m) => m.id === e.model);
    if (model && !chosen.includes(model) && jobs.has(e.job)) rows.push({ model, job: e.job, id: e.id, run: e.run, res: { text: "", ms: e.ms, inTok: e.inTok, outTok: e.outTok, retries: e.retries, error: e.error }, detail: e.detail });
  }
}
console.log(`\nfinished in ${((performance.now() - started) / 1000).toFixed(0)}s`);

// ---- report ------------------------------------------------------------------------------------------------------------------
const shown = MODELS.filter((m) => rows.some((r) => r.model === m));
const of = (m: Model, job: string) => rows.filter((r) => r.model === m && r.job === job);
const ok = (rs: Row[]) => rs.filter((r) => !r.res.error);
const md: string[] = [`# Model eval, ${today}`, "", `Same prompts, same evidence, scored by code. ${shown.length} models. Reply and day jobs: ${runs} samples per case. Times are the median successful call (overload retries are not counted in them).`, ""];

if (jobs.has("resolve")) {
  md.push(`## Resolve (the router), ${RESOLVE_GRADE_SET.length} cases`, "", "| Model | Valid JSON | Right intent | Tool F1 | Median time | Calls failed | Retries |", "|---|---|---|---|---|---|---|");
  for (const m of shown) {
    const rs = of(m, "resolve"); const good = ok(rs);
    const valid = good.filter((r) => r.detail.valid);
    md.push(`| ${key(m)} | ${pct(valid.length, rs.length)} | ${pct(valid.filter((r) => r.detail.intentMatch).length, rs.length)} | ${(valid.reduce((a, r) => a + (r.detail.toolF1 as number), 0) / Math.max(1, rs.length)).toFixed(2)} | ${sec(p50(good.map((r) => r.res.ms)))} | ${rs.length - good.length} | ${rs.reduce((a, r) => a + r.res.retries, 0)} |`);
  }
  md.push("", "Cases where a model picked a different intent than the grade set:", "");
  for (const m of shown) {
    const miss = of(m, "resolve").filter((r) => r.detail.valid && !r.detail.intentMatch);
    md.push(`- **${key(m)}**: ${miss.length ? miss.map((r) => `${r.id} (said ${r.detail.intent}, wanted ${r.detail.wantIntent})`).join("; ") : "none"}`);
  }
  md.push("");
}
if (jobs.has("reply")) {
  md.push(`## Reply (the written answer), ${SCENARIOS.length} scenarios × ${runs}`, "", "A reply is clean when it names no place outside the evidence, quotes no number that is not in it, gives every place its own rating and hours, avoids a disliked place, and is in the traveller's language.", "",
    "| Model | Clean replies | Invented names | Numbers not in evidence | Wrong rating/hours | Disliked place | Wrong language | Avg words | Median time | Calls failed |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const m of shown) {
    const rs = of(m, "reply"); const good = ok(rs);
    const d = (f: (x: any) => boolean) => good.filter((r) => f(r.detail)).length;
    md.push(`| ${key(m)} | ${pct(d((x) => x.pass), rs.length)} | ${d((x) => x.invented.length)} | ${d((x) => x.unknownNumbers.length)} | ${d((x) => x.ratingErrors.length + x.hoursErrors.length)} | ${d((x) => x.forbidden.length)} | ${d((x) => !x.langOk)} | ${Math.round(good.reduce((a, r) => a + (r.detail.words as number), 0) / Math.max(1, good.length))} | ${sec(p50(good.map((r) => r.res.ms)))} | ${rs.length - good.length} |`);
  }
  md.push("", "What went wrong, by model (first examples):", "");
  for (const m of shown) {
    const bad = ok(of(m, "reply")).filter((r) => !r.detail.pass).slice(0, 4);
    md.push(`- **${key(m)}**: ${bad.length ? bad.map((r) => { const x = r.detail as any; return `${r.id}: ${[x.invented.length ? `invented ${x.invented.slice(0, 2).join(", ")}` : "", x.unknownNumbers.length ? `numbers ${x.unknownNumbers.slice(0, 3).join(", ")}` : "", x.ratingErrors.length ? `rating ${x.ratingErrors[0]}` : "", x.hoursErrors.length ? `hours ${x.hoursErrors[0]}` : "", x.forbidden.length ? `recommended ${x.forbidden[0]}` : "", x.langOk ? "" : "wrong language"].filter(Boolean).join("; ")}`; }).join(" | ") : "nothing flagged"}`);
  }
  md.push("");
}
if (jobs.has("day")) {
  md.push(`## Day writer, ${DAY_CASES.length} cases × ${runs}`, "", "| Model | Clean | Median time | Calls failed | Typical problem |", "|---|---|---|---|---|");
  for (const m of shown) {
    const rs = of(m, "day"); const good = ok(rs);
    const bad = good.filter((r) => !(r.detail as any).ok);
    md.push(`| ${key(m)} | ${pct(good.length - bad.length, rs.length)} | ${sec(p50(good.map((r) => r.res.ms)))} | ${rs.length - good.length} | ${bad.length ? [...new Set(bad.flatMap((r) => (r.detail as any).problems))].slice(0, 2).join("; ") : "none"} |`);
  }
  md.push("");
}
const errs = rows.filter((r) => r.res.error);
if (errs.length) { md.push("## Calls that failed even after retries", "", ...[...new Set(errs.map((r) => `- ${key(r.model)}: ${r.res.error!.slice(0, 140)}`))].slice(0, 12), ""); }
md.push("## Limits", "", "- \"Clean\" is not \"good\" and not \"never embellishes\". The scorer checks names, numbers, ratings, hours, dislikes and language. It cannot see a made-up description (\"a massive newly transformed venue\"): a hand-read sample of one query showed the Gemini models doing that, and no score here would have caught it.", "- A model whose calls mostly failed (a quota or overload error) was not measured: its rows describe only the few calls that came back. Gemini 3 Flash Preview on the key used here allowed about five calls in six minutes even with pacing, so it is shown only by those failures; Gemini 3.5 Flash Lite was rerun slowly and is complete.", "- The evidence is invented, so the scores measure how a model treats the data it is given, not how good Google's results are.", "- The router is scored on its raw output; the app also applies code guards afterwards (plan length, stay limits, web-lookup trimming), which would fix some of the mistakes counted here.", "- Models run with their default thinking settings (OpenAI at low effort), so the times include whatever hidden thinking a model does.", "- Dollar cost is not measured; token counts are in raw.json.", "");

mkdirSync("docs/qa/model-eval", { recursive: true });
writeFileSync("docs/qa/model-eval/RESULTS.md", md.join("\n"));
writeFileSync("docs/qa/model-eval/raw.json", JSON.stringify(rows.map((r) => ({ model: r.model.id, job: r.job, id: r.id, run: r.run, ms: Math.round(r.res.ms), inTok: r.res.inTok, outTok: r.res.outTok, retries: r.res.retries, error: r.res.error, detail: r.detail })), null, 1));
console.log("\n" + md.join("\n"));
process.exit(0);
