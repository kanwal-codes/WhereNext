import { z } from "zod";

/**
 * Server-side environment validation. Node runtime only (imports zod) — never
 * reference this from `middleware.ts` or an edge route; use `lib/env.ts` there.
 */

/** Required for the app to function at all (auth + the always-used providers + the AI Gateway key). */
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_MAPS_API_KEY",
  "MAPBOX_ACCESS_TOKEN",
  "AI_GATEWAY_API_KEY",
] as const;

/** Missing → a feature quietly degrades ("could not check ..."), not a crash. */
const OPTIONAL_PROVIDERS: Record<string, string> = {
  TAVILY_API_KEY: "web research",
  TICKETMASTER_API_KEY: "events (Ticketmaster)",
  TICKETMASTER_CONSUMER_KEY: "events (Ticketmaster)",
  EVENTBRITE_API_KEY: "local events",
  OPENWEATHER_API_KEY: "weather forecasts",
  TRANSIT_API_KEY: "transit fallback",
  DUFFEL_API_KEY: "flight estimates",
  LITEAPI_KEY: "hotel rates",
  CONNECT_API_KEY: "hotel rates",
  REDIS_URL: "shared cache (falls back to in-process)",
  UPSTASH_REDIS_REST_URL: "shared rate limiting (falls back to in-process)",
  SENTRY_DSN: "error tracking",
};

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GOOGLE_MAPS_API_KEY: z.string().min(1),
  MAPBOX_ACCESS_TOKEN: z.string().min(1),
  AI_GATEWAY_API_KEY: z.string().min(1),
});

export type ServerEnvReport = { ok: boolean; missingRequired: string[]; missingOptional: string[] };

let cached: ServerEnvReport | undefined;

/** Names (never values) of what's missing. Memoized. Never throws. */
export function checkServerEnv(): ServerEnvReport {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  const missingRequired = parsed.success
    ? []
    : parsed.error.issues.map((i) => String(i.path[0] ?? i.message)).filter((v, idx, arr) => arr.indexOf(v) === idx);
  for (const key of REQUIRED) if (!process.env[key] && !missingRequired.includes(key)) missingRequired.push(key);
  const missingOptional = Object.keys(OPTIONAL_PROVIDERS).filter((k) => !process.env[k]);
  cached = { ok: missingRequired.length === 0, missingRequired, missingOptional };
  return cached;
}

type MinimalLogger = { warn: (o: Record<string, unknown>, m: string) => void; error: (o: Record<string, unknown>, m: string) => void };

/** Called once from instrumentation.ts. Logs loudly on missing required vars; the process stays up so /api/ready can report it. */
export function reportEnv(log: MinimalLogger): void {
  const report = checkServerEnv();
  if (report.missingRequired.length) {
    log.error({ missing: report.missingRequired }, "startup: required environment variables are missing — auth or core providers will not work");
  }
  if (report.missingOptional.length) {
    // Two keys can back the same feature (LITEAPI_KEY / CONNECT_API_KEY both mean "hotel
    // rates") — only call a feature disabled when every key that could satisfy it is missing.
    const disabled = [...new Set(report.missingOptional.map((k) => OPTIONAL_PROVIDERS[k]))].filter((label) =>
      Object.entries(OPTIONAL_PROVIDERS).every(([k, v]) => v !== label || report.missingOptional.includes(k)),
    );
    if (disabled.length) log.warn({ missing: report.missingOptional, disabled }, "startup: optional provider keys missing — those features are disabled");
  }
}
