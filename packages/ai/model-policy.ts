import type { z } from "zod";
import type { ModelMessage } from "ai";
import type { UsageEntry } from "@/lib/ai/pricing";
import * as llm from "./llm";

/**
 * The three model *roles* the app has, and the single place their env knobs are read.
 *
 *   resolve — turn planning / structured extraction (tool selection, search directives,
 *             comparison + checklist JSON). Needs strong instruction-following. `RESOLVE_MODEL`.
 *   compose — the streamed answer (main COMPOSE loop, group @Roam's buffered reply, and
 *             compare-chat's short verdict). Reads as natural writing, not just correct JSON.
 *             `AI_MODEL`.
 *   bulk    — cheap, high-context structured extraction/summarisation used by every
 *             block-builder (itinerary, budget, comparison, checklist, area guides, ...), plus
 *             thread summaries and trip-import parsing. `SUMMARY_MODEL`.
 *
 * Every role calls Anthropic's API directly (`packages/ai/llm.ts`) with `ANTHROPIC_API_KEY`: one key,
 * one client, and a per-role list of Claude models tried in order. Call sites ask for a role, never a model id.
 */
export type ModelRole = "resolve" | "compose" | "bulk";

/** One entry in a role's fallback list: an Anthropic model id, e.g. "claude-haiku-5-5". */
export type ModelChainEntry = string;

/**
 * Default model list per role. The env override for a role (see `ROLE_ENV`) is tried FIRST when set;
 * these remain the fallback.
 *
 *   resolve — Sonnet 5.5 leads. Planning is on the critical path of every turn, and in a 10-call benchmark (2026-10-08, same
 *   five messages) Sonnet's median was 2.9 s against Haiku 5.5's 4.0 s (Haiku 4.5: 3.6 s) with the same plans; Haiku tends to ask
 *   for an extra search, which lengthens its output. It costs about 20x per token ($2 / $10 against $0.10 / $0.50 per million),
 *   roughly 1.5 cents more per turn. Haiku 5.5 is the fallback.
 *   bulk — Haiku 5.5 leads: the side-card builders run beside the written reply and are 20x cheaper; Sonnet 5.5 is the fallback
 *   (it was ~1.5 s faster on area cards in the same benchmark, at several cents more per turn; revisit if they become the wait).
 *   compose — the one thing the user actually reads: Sonnet 5.5 leads (the better writer in that comparison),
 *   Haiku 5.5 answers if it stalls, and Sonnet 5 is the last resort. Don't reorder on assumption; measure.
 */
const DEFAULT_CHAINS: Record<ModelRole, ModelChainEntry[]> = {
  resolve: ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-haiku-4-5"],
  compose: ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-sonnet-5"],
  bulk: ["claude-haiku-5-5", "claude-sonnet-5-5"],
};

const ROLE_ENV: Record<ModelRole, string> = { resolve: "RESOLVE_MODEL", compose: "AI_MODEL", bulk: "SUMMARY_MODEL" };

/** The model chain for a role: the role's env override (a Gateway model id, e.g.
 *  "anthropic/claude-opus-5") first if set, then the built-in defaults above (minus a
 *  duplicate of the override). An env override is always a bare, unpinned string — pinning is
 *  only ever a built-in default's lead entry, per the doc comment on `ModelChainEntry`. */
export function modelChainFor(role: ModelRole): ModelChainEntry[] {
  const override = process.env[ROLE_ENV[role]];
  const defaults = DEFAULT_CHAINS[role];
  return override ? [override, ...defaults.filter((entry) => entry !== override)] : defaults;
}

/**
 * Hard deadlines for AI calls inside a chat turn — a stalled gateway (throttling, a slow
 * fallback) must fail fast to its graceful path, never hang the turn. Tune here.
 */
export const AI_DEADLINE_MS = {
  /** RESOLVE — one small structured call; a timeout drops to the degraded plan. */
  resolve: 15_000,
  /** RESOLVE's single retry. It's only worth a quick second try — recovering a one-off
   *  malformed response is common and cheap; if the whole provider chain is actually
   *  unhealthy, waiting another full 15s just to find that out again isn't worth it. */
  resolveRetry: 6_000,
  /** Side-builders (comparison, checklist, itinerary, budget, options, weather) — a timeout drops the block. */
  sideBuilder: 22_000,
  /** Whole RETRIEVE stage (every tool call in the plan, run in parallel) — each individual
   *  provider fetch already has its own ~8-10s ceiling (`withProviderTimeout`), but a multi-
   *  tier fallback inside one tool (e.g. `directions`: transit -> geocode -> transit-app -> web
   *  research, each with its own ceiling) can still chain to 30-40s with nothing bounding the
   *  total. Past this deadline every still-pending provider call is aborted and marked
   *  unavailable — RETRIEVE returns with whatever succeeded rather than gating COMPOSE forever. */
  retrieve: 35_000,
  /** COMPOSE time-to-first-token, per provider attempt — a timeout moves to the next model in the
   *  chain. Generous: COMPOSE can legitimately make a tool round-trip before its first text token. */
  composeTtft: 28_000,
  /** Same, but for an attempt that still has another provider to fall back to — worth a shorter
   *  wait, since a real answer is still possible from the next one. Only the last attempt in the
   *  chain (nowhere left to fail over to) gets the full `composeTtft`. Without this, a multi-
   *  provider fallback chain could burn the full 28s on every stalled attempt before it even
   *  reaches whichever provider is actually healthy. */
  composeTtftFallback: 14_000,
  /** Full-generation budget for a BUFFERED compose call (group chat's @Roam route, which uses
   *  generateText, not streamText) — there's no "first token" for a buffered call, so
   *  composeTtft (meant to bound only time-to-first-token) is the wrong deadline to reuse here:
   *  it's too tight for a call that may still need up to 4 tool-calling steps plus final text.
   *  Only the LAST provider in the fallback chain gets this full budget — see
   *  `composeBufferedFallback` for every earlier attempt, mirroring how the streaming path
   *  already gives non-final attempts a shorter leash (`composeTtftFallback`). */
  composeBuffered: 60_000,
  /** Same call, but for an attempt that still has another provider to fall back to. A stalled
   *  first/second provider in the chain should not cost the user the FULL 60s before failing
   *  over — only the final attempt (nowhere left to go) is worth waiting the complete budget for. */
  composeBufferedFallback: 20_000,
  /** Phase 3.2 (docs/overhaul/roadmap/phase-3-accuracy.md) — the grounding evaluator runs AFTER
   *  COMPOSE's own text has already finished (and, on the streaming path, already been shown to
   *  the user live) but BEFORE the meta frame carrying the structured blocks/cards is sent — so a
   *  slow evaluator call directly delays the cards, not just internal bookkeeping. Isolated live
   *  testing (one-off scripts, since removed) showed 230-950ms on
   *  the bulk chain's Cerebras-pinned lead, but repeatedly 2.5-10s on the (real, not rare) case it
   *  falls back past Cerebras — a first attempt at bounding this with only `AbortSignal.timeout`
   *  still measured 8-10s wall-clock in practice (the AI SDK's own internal retry/backoff on a
   *  fallback attempt didn't reliably honor an already-fired abort), so `finalizeAssistantText`
   *  now ALSO races a plain `Promise.race` wall-clock timer against this same value (belt and
   *  suspenders — see its own doc comment). A first attempt at 1.5s (tightest reasonable protection
   *  of the Phase 2 "no silent gap over 1-2s" card-visibility target) turned out too aggressive in
   *  practice: repeated rapid-fire live testing showed even a single, non-fallback Cerebras call on
   *  this role commonly landing in the 1-2s range under load, not the 230-950ms the very first
   *  clean measurement suggested — 1.5s was timing out genuinely-fast, correct judgments, not just
   *  slow fallbacks. Settled on 2.5s as the honest middle ground given that real variance; this
   *  number is a first estimate under bursty synthetic testing, not production traffic, and should
   *  be revisited once this has run against real, spread-out usage (see
   *  docs/overhaul/roadmap/phase-3-accuracy.md sub-phase 3.2.2).
   */
  groundingEvaluator: 2_500,
} as const;

/** COMPOSE's bounded tool-calling loop budget, shared by every caller (personal chat's
 *  streaming loop, group chat's buffered loop) so a future change to the step budget can't be
 *  made in one and forgotten in the other. */
export const COMPOSE_MAX_STEPS = 4;

/** A generous daily-per-user ceiling on AI turns (personal chat + group @Roam combined, since
 *  both run the identical RESOLVE/RETRIEVE/COMPOSE pipeline) — not a UX limit, real usage is
 *  nowhere near this. `trip-ai-queue.ts` only serializes calls per (trip, user); the per-trip
 *  ceiling below is what actually bounds a trip's total. */
export const DAILY_TURN_LIMIT = 300;

/** A per-trip ceiling on top of the per-user one above. A group trip's members each get their
 *  own DAILY_TURN_LIMIT, so a trip with several active members has no aggregate cap at all
 *  without this — one legitimately chatty trip with, say, 6 members nowhere near their own
 *  limits could otherwise still run up unbounded shared cost. Set well above any real trip's
 *  organic usage (6 members maxing out a normal day of planning is nowhere close to this) so it
 *  only trips on a scripted/abusive pattern concentrated on one trip, not real multi-person use. */
export const DAILY_TRIP_TURN_LIMIT = 1_000;

/** `signal` combined with a timeout — the turn's abort still wins, but a stall can't outlast `ms`. */
export function withDeadline(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/**
 * RESOLVE / bulk-builder structured call for `role`, trying that role's whole model chain.
 *
 * Phase 2.6.1 tried switching RESOLVE to `streamStructured` (below, still here and still
 * correctly unit-tested — just not called from here). Live-verified BROKEN: `result.object`
 * hangs forever specifically when `streamObject` is invoked from inside this app's actual
 * Next.js dev-server route context, deterministically reproduced with a fresh server and a
 * single isolated request — while the exact same call succeeds in ~1-2s as a standalone script
 * and while `generateObject` (below) succeeds fine from
 * within the very same route. Not a caching or provider-pinning interaction — reproduced
 * identically with both stripped out. Root cause not chased further (likely a Next.js dev-mode
 * fetch-patching / streaming-body interaction, not this app's own logic) — reverted to
 * `generateStructured`/`generateObject` for every role, which is what's actually proven safe.
 * 2.6.2's progress frames (`app/api/ai/route.ts`, `orchestrate/run-turn.ts`'s
 * `onRetrieveStart`) never depended on `streamObject` in the first place — they're plain
 * milestones the route/orchestrator emit directly — so this revert doesn't touch them at all.
 */
export async function generateStructured<T>(
  role: ModelRole,
  messages: ModelMessage[],
  schema: z.ZodType<T>,
  signal?: AbortSignal,
  onUsage?: (entry: UsageEntry) => void,
): Promise<T> {
  // RESOLVE's system prompt (~16KB) is identical on every turn — ask the Gateway to cache it
  // (Phase 2.4, docs/overhaul/roadmap/phase-2-speed.md). Measured (one-off script, since removed) to be a no-op today: every provider actually in RESOLVE's chain (Cerebras-hosted
  // OpenAI model, Gemini, OpenAI-mini fallbacks) already caches implicitly with zero code change
  // — `cacheReadTokens` showed up on a repeat call with no flag set at all. Set anyway, harmlessly,
  // so this keeps working the day an explicit-caching provider (Anthropic/MiniMax/Alibaba) joins
  // this chain. `bulk`/`compose` don't get this — out of this sub-phase's scope, unmeasured.
  const opts = role === "resolve" ? { caching: "auto" as const } : undefined;
  return llm.generateStructured(modelChainFor(role), messages, schema, signal, onUsage, opts);
}

/** Plain-text call for `role` (thread summaries, compare-chat's verdict, hotel/event blurb rewrites). */
export async function generateText(
  role: ModelRole,
  messages: ModelMessage[],
  signal?: AbortSignal,
  onUsage?: (entry: UsageEntry) => void,
): Promise<string> {
  return llm.generateText(modelChainFor(role), messages, signal, onUsage);
}

/** COMPOSE's model chain as AI SDK `LanguageModel`s, for a route's own streaming/tool-calling loop. */
export function composeModelChain() {
  return llm.modelChain(modelChainFor("compose"));
}
