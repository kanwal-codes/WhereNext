// promptfoo provider for Roam: signs in to the LOCAL Supabase stack, makes a fresh trip per test and posts to /api/ai (SSE).
// Vars per test: `turns` (array of user messages, run in one trip) or the prompt itself; optional `destination`, `interests`, `travelers`.
// Refuses any host that is not localhost: this makes real model calls and writes trips, never point it at production.
const BASE = process.env.EVAL_BASE_URL || "http://localhost:4001";
const SB = process.env.EVAL_SUPABASE_URL || "http://127.0.0.1:54321";
const isLocal = (url) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);

let sessionCookie = null;
async function signIn() {
  if (sessionCookie) return sessionCookie;
  const { EVAL_SUPABASE_ANON_KEY: anon, EVAL_EMAIL: email, EVAL_PASSWORD: password } = process.env;
  if (!anon || !email || !password) throw new Error("Set EVAL_SUPABASE_ANON_KEY, EVAL_EMAIL and EVAL_PASSWORD (the local test user, see evals/roam/README.md)");
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`local sign-in failed: ${r.status}`);
  const value = "base64-" + Buffer.from(JSON.stringify(await r.json())).toString("base64url");
  const name = `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`;
  const max = 3180; const parts = [];
  for (let i = 0; i < value.length; i += max) parts.push(value.slice(i, i + max));
  sessionCookie = parts.length === 1 ? `${name}=${value}` : parts.map((p, i) => `${name}.${i}=${p}`).join("; ");
  return sessionCookie;
}

const headers = (cookie) => ({ cookie, origin: BASE, "content-type": "application/json" });

async function newTrip(cookie, vars) {
  const interests = vars.interests ? String(vars.interests).split(",").map((s) => s.trim()) : ["museums", "seafood"];
  const r = await fetch(`${BASE}/api/trips`, {
    method: "POST", headers: headers(cookie),
    body: JSON.stringify({ name: `Eval ${Date.now()}`, destination: vars.destination || "Lisbon, Portugal", durationDays: 5, startDate: "2026-12-18", endDate: "2026-12-22", travelerCount: Number(vars.travelers || 2), preferences: { interests, budget: "moderate", pace: "moderate", groupType: "couple" }, idempotencyKey: `eval-${Math.random().toString(36).slice(2)}` }),
  });
  const j = await r.json().catch(() => ({}));
  const id = j.trip?.id || j.id || j.tripId;
  if (!id) throw new Error(`trip create failed: ${r.status}`);
  return id;
}

async function turn(cookie, tripId, content) {
  const t0 = Date.now(); let firstText = null; let text = ""; let meta = null; const progress = [];
  const r = await fetch(`${BASE}/api/ai`, { method: "POST", headers: headers(cookie), body: JSON.stringify({ tripId, messages: [{ role: "user", content }], messageIdempotencyKey: `eval-${Math.random().toString(36).slice(2)}` }) });
  if (!r.ok || !r.body) return { ok: false, status: r.status, text: "", totalMs: Date.now() - t0 };
  const dec = new TextDecoder(); let buf = "";
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true }); let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim(); if (payload === "[DONE]") continue;
      let o; try { o = JSON.parse(payload); } catch { continue; }
      const delta = o.choices?.[0]?.delta?.content;
      if (delta) { if (firstText === null) firstText = Date.now() - t0; text += delta; }
      else if (o.progress) progress.push(`${o.progress}@${Date.now() - t0}`);
      else if (!o.choices) meta = { ...(meta || {}), ...o };
    }
  }
  const blocks = (meta?.meta?.blocks || meta?.blocks || []).map((b) => b.type);
  return { ok: true, text: text.trim(), firstTextMs: firstText, totalMs: Date.now() - t0, blocks, progress };
}

module.exports = class RoamProvider {
  id() { return "roam-chat"; }
  async callApi(prompt, context) {
    if (!isLocal(BASE) && process.env.EVAL_ALLOW_REMOTE !== "1") return { error: `Refusing ${BASE}: the eval only runs against a local server (set EVAL_ALLOW_REMOTE=1 to override)` };
    try {
      const vars = context?.vars || {};
      const cookie = await signIn();
      const tripId = await newTrip(cookie, vars);
      const messages = vars.turns ? (typeof vars.turns === "string" ? JSON.parse(vars.turns) : vars.turns) : [prompt];
      const turns = [];
      for (const m of messages) turns.push({ q: m, ...(await turn(cookie, tripId, m)) });
      const last = turns[turns.length - 1];
      if (!last.ok) return { error: `HTTP ${last.status}` };
      return { output: last.text, latencyMs: last.totalMs, metadata: { firstTextMs: last.firstTextMs, totalMs: last.totalMs, blocks: last.blocks, progress: last.progress, turns } };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
};
