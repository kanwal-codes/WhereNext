/**
 * Next.js server bootstrap. The Node-only work (pino logging, env validation)
 * lives in ./instrumentation-node so it never enters the edge middleware bundle.
 * Sentry, when SENTRY_DSN is set, is wired by withSentryConfig in next.config.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    registerNode();
  }
}
