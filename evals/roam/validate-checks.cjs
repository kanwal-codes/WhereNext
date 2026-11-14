// Measures every code check against human labels (write-code-eval, step 3): for each check, how often it flags a reply a person
// marked Fail (it should), and how often it flags a reply a person marked Pass (a false alarm).
//   node evals/roam/validate-checks.cjs [labels.json] [output/latest.json]
// Labels come from review/index.html (export). Key = "<case id>#<repeat number>", repeats numbered in the order they appear in the output.
// A check's verdicts are only trustworthy with roughly 50 Pass and 50 Fail labels; below that this prints the counts and a warning.
const fs = require("node:fs");
const path = require("node:path");

const labelsFile = process.argv[2] || path.join(__dirname, "labels.json");
const outputFile = process.argv[3] || path.join(__dirname, "output", "latest.json");
if (!fs.existsSync(labelsFile)) { console.log(`No labels yet (${path.relative(process.cwd(), labelsFile)}). Open evals/roam/review/index.html, label replies, export labels.json here.`); process.exit(0); }
const labels = JSON.parse(fs.readFileSync(labelsFile, "utf8"));
const rows = JSON.parse(fs.readFileSync(outputFile, "utf8")).results.results;

const seen = {}; const traces = [];
for (const r of rows) {
  const id = r.testCase?.description; if (!id || !r.gradingResult) continue;
  seen[id] = (seen[id] || 0) + 1;
  const label = labels[`${id}#${seen[id]}`]?.label;
  if (label === "pass" || label === "fail") traces.push({ key: `${id}#${seen[id]}`, label, checks: r.gradingResult.componentResults });
}
const nFail = traces.filter((t) => t.label === "fail").length; const nPass = traces.length - nFail;
console.log(`${traces.length} labeled replies matched to this run: ${nPass} Pass, ${nFail} Fail`);
if (nPass < 50 || nFail < 50) console.log("WARNING: fewer than ~50 of each label, so these rates are indicative only.\n");

const byCheck = {};
for (const t of traces) for (const c of t.checks) {
  const name = `${(c.assertion?.value || "").split(":").pop()} [${c.assertion?.metric}]`;
  const x = (byCheck[name] = byCheck[name] || { flaggedFail: 0, flaggedPass: 0 });
  if (!c.pass) { if (t.label === "fail") x.flaggedFail += 1; else x.flaggedPass += 1; }
}
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "-");
console.log("check".padEnd(48), "catches human Fails".padEnd(22), "false alarms on human Passes");
for (const [name, x] of Object.entries(byCheck).sort()) console.log(name.padEnd(48), `${pct(x.flaggedFail, nFail)} (${x.flaggedFail}/${nFail})`.padEnd(22), `${pct(x.flaggedPass, nPass)} (${x.flaggedPass}/${nPass})`);

const hard = (t) => t.checks.filter((c) => String(c.assertion?.metric).startsWith("hard")).every((c) => c.pass);
const tp = traces.filter((t) => t.label === "pass" && hard(t)).length; const tn = traces.filter((t) => t.label === "fail" && !hard(t)).length;
console.log(`\nAll hard checks together: TPR ${pct(tp, nPass)} (Pass replies they let through), TNR ${pct(tn, nFail)} (Fail replies they catch).`);
const missed = traces.filter((t) => t.label === "fail" && hard(t)).map((t) => `${t.key}${labels[t.key]?.note ? ` (${labels[t.key].note.slice(0, 50)})` : ""}`);
if (missed.length) console.log(`Human Fails no hard check caught (candidates for a new check): ${missed.slice(0, 12).join("; ")}`);
