// Summarises a promptfoo run of the Roam evals: pass rate per case over its repeats, hard / soft / signal checks reported apart, speed
// reported apart (and never part of a pass), route stability, and a comparison with the committed baseline.
//   node evals/roam/report.cjs                 print the summary of output/latest.json
//   node evals/roam/report.cjs --compare       also compare with baseline.json; exit 1 on a hard-check regression
//   node evals/roam/report.cjs --save-baseline write baseline.json from this run (commit it after a run you trust)
const fs = require("node:fs");
const path = require("node:path");

const DIR = __dirname;
const INPUT = process.env.EVAL_OUTPUT || path.join(DIR, "output", "latest.json");
const BASELINE = path.join(DIR, "baseline.json");
const group = (metric) => String(metric || "").split(":")[0];

const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (xs, p) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const rate = (xs) => (xs.length ? xs.filter(Boolean).length / xs.length : null);
const fmt = (x) => (x == null ? "-" : `${Math.round(x * 100)}%`);

function summarise(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = raw.results.results;
  const byCase = new Map();
  for (const r of rows) {
    const id = r.testCase?.description || r.vars?.message || "?";
    if (!byCase.has(id)) byCase.set(id, []);
    byCase.get(id).push(r);
  }
  const cases = {}; const allHard = []; const allSoft = [];
  for (const [id, runs] of byCase) {
    const ok = runs.filter((r) => r.gradingResult);
    const hard = ok.map((r) => r.gradingResult.componentResults.filter((c) => group(c.assertion?.metric) === "hard").every((c) => c.pass));
    const soft = ok.map((r) => r.gradingResult.componentResults.filter((c) => group(c.assertion?.metric) === "soft").every((c) => c.pass));
    allHard.push(...hard); allSoft.push(...soft);
    const unverified = ok.map((r) => Boolean(r.response?.metadata?.unverified));
    const failures = {};
    for (const r of ok) for (const c of r.gradingResult.componentResults) if (!c.pass) { const m = c.assertion?.metric || c.assertion?.type; failures[m] = (failures[m] || 0) + 1; }
    const md = ok.map((r) => r.response?.metadata || {});
    cases[id] = {
      runs: runs.length, errors: runs.length - ok.length,
      hardPass: rate(hard), softPass: rate(soft), unverifiedRate: rate(unverified),
      failures,
      intents: [...new Set(md.map((m) => m.trace?.intent).filter(Boolean))],
      toolSets: [...new Set(md.map((m) => (m.trace?.tools || []).join("+")))].length,
      firstTextMs: median(md.map((m) => m.firstTextMs)), totalMs: median(md.map((m) => m.totalMs)),
    };
  }
  const all = Object.values(cases);
  const mds = rows.filter((r) => r.response?.metadata).map((r) => r.response.metadata);
  return {
    savedAt: new Date().toISOString(),
    cases,
    overall: {
      cases: all.length, runs: rows.length, errors: all.reduce((n, c) => n + c.errors, 0),
      hardPass: rate(allHard), softPass: rate(allSoft),
      unverifiedRate: rate(mds.map((m) => Boolean(m.unverified))),
      unstableRoutes: all.filter((c) => c.intents.length > 1 || c.toolSets > 1).length,
    },
    speed: { firstTextP50: median(mds.map((m) => m.firstTextMs)), firstTextP90: pct(mds.map((m) => m.firstTextMs), 0.9), totalP50: median(mds.map((m) => m.totalMs)), totalP90: pct(mds.map((m) => m.totalMs), 0.9), note: "local dev server timings: not production latency, never part of a pass" },
  };
}

function print(s) {
  const o = s.overall;
  console.log(`\nRoam evals: ${o.cases} cases, ${o.runs} runs, ${o.errors} errors`);
  console.log(`  hard checks (grounding, safety, language, answered, urgent opening, apology): ${fmt(o.hardPass)} of runs pass them all`);
  console.log(`  soft checks (style and length caps, unvalidated):                              ${fmt(o.softPass)} of runs pass them all`);
  console.log(`  signal: server grounding evaluator flagged a claim in ${fmt(o.unverifiedRate)} of replies`);
  console.log(`  route stability: ${o.unstableRoutes} of ${o.cases} cases routed differently between repeats`);
  console.log(`  speed (dev server, reported only): first text p50 ${s.speed.firstTextP50} ms / p90 ${s.speed.firstTextP90} ms, whole turn p50 ${s.speed.totalP50} ms / p90 ${s.speed.totalP90} ms\n`);
  const bad = Object.entries(s.cases).filter(([, c]) => c.hardPass < 1 || c.errors).sort((a, b) => a[1].hardPass - b[1].hardPass);
  console.log("Cases failing a hard check in at least one run:");
  for (const [id, c] of bad) console.log(`  ${id.padEnd(34)} hard ${fmt(c.hardPass).padStart(4)} soft ${fmt(c.softPass).padStart(4)}  ${Object.entries(c.failures).filter(([m]) => group(m) === "hard").map(([m, n]) => `${m}x${n}`).join(" ")}${c.errors ? `  ERRORS x${c.errors}` : ""}`);
  if (!bad.length) console.log("  none");
}

function compare(s) {
  if (!fs.existsSync(BASELINE)) { console.log("\nNo baseline.json yet: run with --save-baseline after a run you trust."); return 0; }
  const b = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  console.log(`\nAgainst baseline of ${b.savedAt.slice(0, 10)} (${b.overall.cases} cases, ${b.overall.runs} runs):`);
  console.log(`  hard ${fmt(b.overall.hardPass)} -> ${fmt(s.overall.hardPass)} | soft ${fmt(b.overall.softPass)} -> ${fmt(s.overall.softPass)} | unverified ${fmt(b.overall.unverifiedRate)} -> ${fmt(s.overall.unverifiedRate)}`);
  const regress = []; const gained = []; const fresh = [];
  for (const [id, c] of Object.entries(s.cases)) {
    const old = b.cases[id];
    if (!old) { fresh.push(id); continue; }
    // One repeat of three is 0.34: a drop of a full repeat or more on a hard check is a regression; less is within run-to-run noise.
    if (old.hardPass - c.hardPass >= 0.33) regress.push(`${id} ${fmt(old.hardPass)} -> ${fmt(c.hardPass)}`);
    if (c.hardPass - old.hardPass >= 0.33) gained.push(`${id} ${fmt(old.hardPass)} -> ${fmt(c.hardPass)}`);
  }
  if (regress.length) console.log(`  HARD REGRESSIONS (${regress.length}):\n    ${regress.join("\n    ")}`);
  if (gained.length) console.log(`  improved (${gained.length}): ${gained.join("; ")}`);
  if (fresh.length) console.log(`  new since baseline (${fresh.length}): ${fresh.join(", ")}`);
  if (!regress.length) console.log("  no hard regressions");
  return regress.length ? 1 : 0;
}

const summary = summarise(INPUT);
fs.mkdirSync(path.join(DIR, "output"), { recursive: true });
fs.writeFileSync(path.join(DIR, "output", "summary.json"), JSON.stringify(summary, null, 1));
print(summary);
if (process.argv.includes("--save-baseline")) {
  if (summary.overall.errors > 0) { console.error(`\nRefusing to save a baseline: ${summary.overall.errors} runs errored (a failed model call is not a result). Fix the cause and re-run.`); process.exit(1); }
  fs.writeFileSync(BASELINE, JSON.stringify(summary, null, 1) + "\n");
  console.log(`\nBaseline written to ${path.relative(process.cwd(), BASELINE)}: commit it.`);
}
process.exitCode = process.argv.includes("--compare") ? compare(summary) : 0;
