import pino, { type Logger } from "pino";
import { getContext } from "@/lib/server/request-context";

/**
 * The one server-side logger. Node runtime only. Every line is merged with the
 * current request context (requestId / route / tripId / userId) when there is one.
 *
 *   import { logger } from "@/lib/server/logger";
 *   logger.info({ foo: 1 }, "did a thing");
 *   logger.error({ err }, "provider call failed");
 *
 * Errors additionally go to Sentry when a client is configured (see sentry.*.config.ts).
 */

const isDev = process.env.NODE_ENV !== "production";

// Plain NDJSON to stdout — no pino `transport`, because its worker thread does not
// bundle cleanly under Next.js. For readable local output: `bun run dev | bunx pino-pretty`.
//
// Memoised on globalThis: every API route is its own webpack module graph and `next dev`
// re-evaluates them on recompile, so a bare `pino()` here runs dozens of times — and each
// call registers a `process` exit listener (via pino → sonic-boom → on-exit-leak-free),
// tripping "MaxListenersExceededWarning: 11 exit listeners added to [process]". One instance
// per process fixes it.
const globalForLogger = globalThis as unknown as { __appLogger?: Logger };
const base: Logger =
  globalForLogger.__appLogger ??
  pino({
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    redact: {
      paths: ["*.authorization", "*.cookie", "*.password", "*.token", "*.apiKey", "*.api_key", "req.headers.authorization"],
      censor: "[redacted]",
    },
  });
globalForLogger.__appLogger = base;

type LogFn = (obj: Record<string, unknown> | string, msg?: string) => void;

function withContext(level: "trace" | "debug" | "info" | "warn" | "error" | "fatal"): LogFn {
  return (obj, msg) => {
    const ctx = getContext();
    if (typeof obj === "string") {
      base[level](ctx ? { ...ctx } : {}, obj);
      return;
    }
    base[level](ctx ? { ...ctx, ...obj } : obj, msg);
    if ((level === "error" || level === "fatal") && process.env.SENTRY_DSN) {
      void reportToSentry((obj as { err?: unknown }).err, msg);
    }
  };
}

/** Lazily loaded so `@sentry/nextjs` never enters the bundle/runtime unless SENTRY_DSN is set. */
async function reportToSentry(err: unknown, msg?: string): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    if (!Sentry.getClient()) return;
    if (err instanceof Error) Sentry.captureException(err);
    else if (msg) Sentry.captureMessage(msg, "error");
  } catch {
    /* logging already succeeded; Sentry is best-effort */
  }
}

export const logger = {
  trace: withContext("trace"),
  debug: withContext("debug"),
  info: withContext("info"),
  warn: withContext("warn"),
  error: withContext("error"),
  fatal: withContext("fatal"),
  /** Escape hatch for the raw pino instance (child loggers, flushing). */
  raw: base,
};
