// promptfoo provider for Roam: signs in to the LOCAL Supabase stack, makes a fresh trip per test and posts to /api/ai (SSE).
// Vars per test: message, or `turns` (a JSON string of user messages, run in one trip; an array var would make promptfoo fan out one
// test per element), plus the trip: destination, travelers, interests ("a, b"), groupType, budget, pace, startDate, endDate,
// accessibilityNeeds ("a, b"). Refuses any host that is not localhost: this makes real model calls and writes trips.
const BASE = process.env.EVAL_BASE_URL || "http://localhost:4001";
const SB = process.env.EVAL_SUPABASE_URL || "http://127.0.0.1:54321";
const isLocal = (url) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
const list = (value, fallback) => (value ? String(value).split(",").map((s) => s.trim()).filter(Boolean) : fallback);

let session = null;
async function signIn() {
  if (session) return session;
  const { EVAL_SUPABASE_ANON_KEY: anon, EVAL_EMAIL: email, EVAL_PASSWORD: password } = process.env;
  if (!anon || !email || !password) throw new Error("Set EVAL_SUPABASE_ANON_KEY, EVAL_EMAIL and EVAL_PASSWORD (the local test user, see evals/roam/README.md)");
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`local sign-in failed: ${r.status}`);
  const body = await r.json();
  const value = "base64-" + Buffer.from(JSON.stringify(body)).toString("base64url");
  const name = `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`;
  const max = 3180; const parts = [];
  for (let i = 0; i < value.length; i += max) parts.push(value.slice(i, i + max));
  session = { anon, token: body.access_token, cookie: parts.length === 1 ? `${name}=${value}` : parts.map((p, i) => `${name}.${i}=${p}`).join("; ") };
  return session;
}

const headers = (s) => ({ cookie: s.cookie, origin: BASE, "content-type": "application/json" });
const days = (a, b) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1);

async function newTrip(s, vars) {
  const startDate = vars.startDate || "2026-12-18";
  const endDate = vars.endDate || "2026-12-22";
  const preferences = { interests: list(vars.interests, ["museums", "seafood"]), budget: vars.budget || "moderate", pace: vars.pace || "moderate", groupType: vars.groupType || "couple" };
  if (vars.accessibilityNeeds) preferences.accessibilityNeeds = list(vars.accessibilityNeeds, []);
  const r = await fetch(`${BASE}/api/trips`, {
    method: "POST", headers: headers(s),
    body: JSON.stringify({ name: `Eval ${Date.now()}`, destination: vars.destination || "Lisbon, Portugal", durationDays: days(startDate, endDate), startDate, endDate, travelerCount: Number(vars.travelers || 2), preferences, idempotencyKey: `eval-${Math.random().toString(36).slice(2)}` }),
  });
  const j = await r.json().catch(() => ({}));
  const id = j.trip?.id || j.id || j.tripId;
  if (!id) throw new Error(`trip create failed: ${r.status}`);
  return id;
}

/** The newest ai_turn_traces row for the trip (router choice, tools, stage timings), read with the test user's own token under RLS. */
async function traceRow(s, tripId) {
  try {
    const r = await fetch(`${SB}/rest/v1/ai_turn_traces?trip_id=eq.${tripId}&order=created_at.desc&limit=1&select=intent,tools,blocks,providers_failed,degraded,resolve_ms,retrieve_ms,compose_ms,total_ms,model_compose,cost_usd`, { headers: { apikey: s.anon, authorization: `Bearer ${s.token}` } });
    const rows = r.ok ? await r.json() : [];
    return rows[0] || null;
  } catch { return null; }
}

/** Every `name` in a block, so a check can ask "was this place in a card?". */
const namesIn = (value, out = []) => {
  if (Array.isArray(value)) value.forEach((v) => namesIn(v, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { if (k === "name" && typeof v === "string") out.push(v); else namesIn(v, out); }
  return out;
};

async function turn(s, tripId, content) {
  const t0 = Date.now(); let firstText = null; let text = ""; let meta = null; const progress = [];
  const r = await fetch(`${BASE}/api/ai`, { method: "POST", headers: headers(s), body: JSON.stringify({ tripId, messages: [{ role: "user", content }], messageIdempotencyKey: `eval-${Math.random().toString(36).slice(2)}` }) });
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
  const m = meta?.meta || meta || {};
  const blocks = (m.blocks || []).map((b) => ({ type: b.type, names: [...new Set(namesIn(b))].slice(0, 40) }));
  return {
    ok: true, text: text.trim(), firstTextMs: firstText, totalMs: Date.now() - t0, blocks, progress,
    unverified: Boolean(m.unverified), language: m.language || null, sourceTitles: (m.sources || []).map((x) => x.title).filter(Boolean).slice(0, 12),
    suggestedFollowups: (m.suggestedFollowups || []).map((f) => f.label),
  };
}

module.exports = class RoamProvider {
  id() { return "roam-chat"; }
  async callApi(prompt, context) {
    if (!isLocal(BASE) && process.env.EVAL_ALLOW_REMOTE !== "1") return { error: `Refusing ${BASE}: the eval only runs against a local server (set EVAL_ALLOW_REMOTE=1 to override)` };
    try {
      const vars = context?.vars || {};
      const s = await signIn();
      const tripId = await newTrip(s, vars);
      const messages = vars.turns ? (typeof vars.turns === "string" ? JSON.parse(vars.turns) : vars.turns) : [prompt];
      const turns = [];
      for (const m of messages) {
        const t = { q: m, ...(await turn(s, tripId, m)) };
        t.trace = await traceRow(s, tripId);
        turns.push(t);
        // A turn whose router or model call failed (no credit, outage) is an infrastructure error, not a reply to score.
        if (t.ok && t.trace?.degraded) return { error: "router degraded: a model call failed (check the Anthropic credit and the dev server log)" };
        if (t.ok && !t.text) return { error: "empty reply" };
      }
      const last = turns[turns.length - 1];
      if (!last.ok) return { error: `HTTP ${last.status}` };
      return {
        output: last.text, latencyMs: last.totalMs,
        metadata: { trip: { destination: vars.destination || "Lisbon, Portugal", travelers: Number(vars.travelers || 2), groupType: vars.groupType || "couple" }, message: messages[messages.length - 1], firstTextMs: last.firstTextMs, totalMs: last.totalMs, blocks: last.blocks, unverified: last.unverified, language: last.language, sourceTitles: last.sourceTitles, trace: last.trace, progress: last.progress, turns },
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
};
