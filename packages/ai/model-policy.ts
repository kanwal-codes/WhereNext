import { createBulkGateway, createGatewayWithFallback } from "./gateway";

/**
 * The three model *roles* the app has, and the single place their env knobs are read.
 *
 *   resolve — turn planning / structured extraction (tool selection, search directives,
 *             comparison + checklist JSON). Needs strong instruction-following. `RESOLVE_MODEL`.
 *   compose — the streamed conversational answer (only compare-chat now; the main COMPOSE
 *             loop uses `composeModel()` directly). `AI_MODEL` / provider default.
 *   bulk    — cheap, high-context summarisation (thread summary, web-page import, blurb
 *             rewrites). Routes to Gemini Flash when keyed. `SUMMARY_MODEL`.
 *
 * `resolve` / `compose` fail over across `AI_PROVIDER` → `AI_FALLBACK_PROVIDERS` on a
 * provider error. Call sites ask for a role, never a model string.
 */
export type ModelRole = "resolve" | "compose" | "bulk";

export function gatewayFor(role: ModelRole) {
  switch (role) {
    case "resolve":
      return createGatewayWithFallback({ model: process.env.RESOLVE_MODEL || undefined });
    case "compose":
      return createGatewayWithFallback();
    case "bulk":
      return createBulkGateway({ model: process.env.SUMMARY_MODEL || undefined });
  }
}
