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

/**
 * Hard deadlines for AI calls inside a chat turn — a stalled gateway (throttling, a slow
 * fallback) must fail fast to its graceful path, never hang the turn. Tune here.
 */
export const AI_DEADLINE_MS = {
  /** RESOLVE — one small structured call; a timeout drops to the degraded plan. */
  resolve: 15_000,
  /** Side-builders (comparison, checklist, itinerary, budget, options, weather) — a timeout drops the block. */
  sideBuilder: 22_000,
  /** COMPOSE time-to-first-token, per provider attempt — a timeout moves to the next model in the
   *  chain. Generous: COMPOSE can legitimately make a tool round-trip before its first text token. */
  composeTtft: 28_000,
} as const;

/** `signal` combined with a timeout — the turn's abort still wins, but a stall can't outlast `ms`. */
export function withDeadline(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

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
