// Builds demo/local.env (local Supabase + only provider keys; every other .env.local name blanked) and sets a throwaway password for qa@wherenext.test.
import { execSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const REPO = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
const secret = execSync("docker inspect supabase_auth_sb --format '{{range .Config.Env}}{{println .}}{{end}}'").toString().split("\n").find(l => l.startsWith("GOTRUE_JWT_SECRET=")).split("=").slice(1).join("=");
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = role => { const h = b64({ alg: "HS256", typ: "JWT" }), p = b64({ iss: "supabase-demo", role, exp: 4102444800 }); return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`; };
const anon = jwt("anon"), service = jwt("service_role");
const keep = new Set(["ANTHROPIC_API_KEY","OPENAI_API_KEY","GOOGLE_MAPS_API_KEY","MAPBOX_ACCESS_TOKEN","OPENWEATHER_API_KEY","SERP_API_KEY","TAVILY_API_KEY","TICKETMASTER_CONSUMER_KEY","EVENTBRITE_API_KEY","DUFFEL_API_KEY","TRANSIT_API_KEY","ROUTESTACK_API_KEY","ROUTESTACK_SECRET_KEY","AI_MODEL","AI_PROVIDER","RESOLVE_MODEL","SUMMARY_MODEL","GEMINI_MODEL","GEMINI_BULK_MODEL","AI_FALLBACK_PROVIDERS"]);
const lines = readFileSync(`${REPO}/.env.local`, "utf8").split("\n");
const out = new Map();
for (const l of lines) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue; out.set(m[1], keep.has(m[1]) ? m[2] : '""'); }
out.set("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
out.set("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", anon);
out.set("SUPABASE_SERVICE_ROLE_KEY", service);
out.set("NEXT_PUBLIC_SITE_URL", "http://localhost:4000");
writeFileSync("local.env", [...out].map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
const pw = "Demo-" + randomBytes(9).toString("hex");
const id = "d043c26c-ebff-4353-bef5-6c40a5c36e97";
const r = await fetch(`http://127.0.0.1:54321/auth/v1/admin/users/${id}`, { method: "PUT", headers: { apikey: service, authorization: `Bearer ${service}`, "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
console.log("password set:", r.status);
writeFileSync("qa-login.json", JSON.stringify({ email: "qa@wherenext.test", password: pw }));
console.log("kept provider keys:", [...keep].filter(k => out.get(k) && out.get(k) !== '""').length);
