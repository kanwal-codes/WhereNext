/**
 * Quick load baseline. Assumes `bun run dev` (or `next start`) is already up.
 *
 *   LOADTEST_TRIP_ID=<uuid> LOADTEST_COOKIE='sb-<ref>-auth-token=base64-...' \
 *     bun run bench -- --target all [--url http://localhost:3000] [--conn 20] [--dur 15]
 *
 * Auth can't be faked — grab a real session cookie from a signed-in browser (DevTools →
 * Application → Cookies) or mint one via the Supabase admin API. The `ai` target hits the real
 * Vercel AI Gateway (AI_GATEWAY_API_KEY) and a real configured model — every request is a real,
 * billed call. Leave `ai` out of --target unless you're deliberately load-testing real model
 * latency and accept the cost.
 */
import autocannon from "autocannon";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const URL = arg("url", process.env.LOADTEST_URL ?? "http://localhost:3000");
const CONN = Number(arg("conn", "20"));
const DUR = Number(arg("dur", "15"));
const TARGET = arg("target", "all");
const TRIP = process.env.LOADTEST_TRIP_ID;
const COOKIE = process.env.LOADTEST_COOKIE ?? "";

if (!TRIP && TARGET !== "health") {
  console.error("Set LOADTEST_TRIP_ID (and LOADTEST_COOKIE) — or use --target health.");
  process.exit(1);
}

type Case = { name: string; path: string; method?: "GET" | "POST"; body?: string };
const CASES: Record<string, Case> = {
  health: { name: "GET /api/health", path: "/api/health" },
  places: { name: "GET /api/trips/:id/places", path: `/api/trips/${TRIP}/places?query=coffee` },
  stays: { name: "GET /api/trips/:id/stays", path: `/api/trips/${TRIP}/stays` },
  ai: {
    name: "POST /api/ai",
    path: "/api/ai",
    method: "POST",
    body: JSON.stringify({ tripId: TRIP, messages: [{ role: "user", content: "what should I do on day one?" }], messageIdempotencyKey: "loadtest" }),
  },
};

const pick = TARGET === "all" ? Object.keys(CASES).filter((k) => k !== "ai") : [TARGET];

async function run(c: Case) {
  const result = await autocannon({
    url: URL + c.path,
    method: c.method ?? "GET",
    connections: CONN,
    duration: DUR,
    headers: { cookie: COOKIE, ...(c.method === "POST" ? { "content-type": "application/json" } : {}) },
    body: c.body,
  });
  const p = result.latency;
  console.log(
    `${c.name.padEnd(32)} p50=${String(p.p50).padStart(5)}ms  p90=${String(p.p90).padStart(6)}ms  p99=${String(p.p99).padStart(6)}ms  ` +
      `req/s=${Math.round(result.requests.average)}  non2xx=${result.non2xx}`,
  );
}

for (const key of pick) {
  const c = CASES[key];
  if (!c) {
    console.error(`unknown target "${key}" — one of: ${Object.keys(CASES).join(", ")}, all`);
    process.exit(1);
  }
  await run(c);
}
