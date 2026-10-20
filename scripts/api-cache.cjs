// Record-once, replay-forever cache for the paid provider APIs, for LOCAL phone testing only (scripts/dev-phone.sh loads it with
// NODE_OPTIONS=--require). The first time a request is made it goes to the provider and the answer is saved under .api-cache/; every
// later identical request is answered from disk, so a screen can be reloaded or re-tested without spending another call.
// Only successful (2xx) answers are saved. Delete .api-cache/ to start fresh. Never loaded in production builds.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const dir = path.join(process.cwd(), ".api-cache");
fs.mkdirSync(dir, { recursive: true });
const HOSTS = /(^|\.)(maps\.googleapis\.com|places\.googleapis\.com|weather\.googleapis\.com|api\.mapbox\.com|api\.openweathermap\.org|serpapi\.com|app\.ticketmaster\.com|www\.eventbriteapi\.com|external\.transitapp\.com)$/;
const original = globalThis.fetch;
const stats = { hit: 0, miss: 0 };

async function describe(input, init) {
  let url;
  let method = "GET";
  let body = "";
  if (typeof input === "string" || input instanceof URL) url = String(input);
  else {
    url = input.url;
    method = input.method || method;
    try { body = await input.clone().text(); } catch { /* no body */ }
  }
  if (init) {
    method = init.method || method;
    if (init.body != null) body = typeof init.body === "string" ? init.body : String(init.body);
  }
  return { url, method: method.toUpperCase(), body };
}

globalThis.fetch = async function cachedFetch(input, init) {
  let d;
  try { d = await describe(input, init); } catch { return original(input, init); }
  let host = "";
  try { host = new URL(d.url).hostname; } catch { return original(input, init); }
  if (!HOSTS.test(host)) return original(input, init);
  const file = path.join(dir, `${crypto.createHash("sha1").update(`${d.method} ${d.url}\n${d.body}`).digest("hex")}.json`);
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    stats.hit++;
    console.log(`[api-cache] HIT  ${host} (${stats.hit} hits, ${stats.miss} live)`);
    return new Response(Buffer.from(saved.body, "base64"), { status: saved.status, headers: saved.headers });
  }
  const res = await original(input, init);
  if (res.ok) {
    try {
      const bytes = Buffer.from(await res.clone().arrayBuffer());
      const keep = {};
      for (const name of ["content-type", "content-length-ignore", "cache-control"]) { const v = res.headers.get(name); if (v && !name.includes("ignore")) keep[name] = v; }
      fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), host, status: res.status, headers: keep, body: bytes.toString("base64") }));
    } catch { /* an answer that cannot be saved is still returned */ }
  }
  stats.miss++;
  console.log(`[api-cache] LIVE ${host} -> ${res.status} (${stats.hit} hits, ${stats.miss} live)`);
  return res;
};
