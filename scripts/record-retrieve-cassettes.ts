/**
 * Phase 0.1.2 (docs/overhaul/roadmap/phase-0-prerequisites.md) — records real provider
 * responses for retrieveEvidence's 7 tool types + one multi-tool plan as Polly.js cassettes
 * under tests/fixtures/cassettes/<name>/, then immediately replays each cassette (network
 * otherwise disabled — `recordIfMissing: false`) and confirms retrieveEvidence's output is
 * byte-identical to what the live call just produced (ignoring `retrievedAt`, a wall-clock
 * timestamp by design — never comparable across two calls).
 *
 * Polly.js, not nock: nock's `nock.define()`-based cassette replay was proven unreliable
 * against this app's real `fetch()`/undici POST calls (silently fell through to a second live
 * call instead of matching — see the Phase 0.1 session notes). Polly's fetch adapter round-
 * trips correctly for the same shape of call, confirmed by a throwaway smoke test before this
 * script was written (deleted per the Phase 0.1.1 discipline, not part of the permanent suite).
 *
 *   bun run scripts/record-retrieve-cassettes.ts
 *
 * Needs real provider API keys in .env.local (bun loads it automatically). The events tool
 * plan only calls Ticketmaster + Eventbrite — GetYourGuide's Partner API and PredictHQ were
 * both removed from retrieveEvidence (affiliate-only for GYG, cost for PredictHQ).
 */

// Force every cached() call (lib/server/ttl-cache.ts) through the in-memory layer, never real
// Redis — otherwise a pre-existing cache entry from prior local dev usage of this app could
// answer from a prior session without ever touching the network, and Polly would record
// nothing for that provider. This runs before any lazy Redis client is constructed (ttl-cache
// only reads REDIS_URL inside its `cached()` call, not at import time), regardless of import
// hoisting order.
delete process.env.REDIS_URL;

import { fileURLToPath } from "node:url";
import { Polly } from "@pollyjs/core";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";
import { retrieveEvidence } from "../lib/application/retrieve";
import { clearMemoryCache } from "../lib/server/ttl-cache";
import type { ToolCall } from "../lib/application/turn-resolver";

Polly.register(FetchAdapter);
Polly.register(FSPersister);

const CASSETTE_DIR = fileURLToPath(new URL("../tests/fixtures/cassettes/", import.meta.url));

/** One realistic, shared filter set — exercises the dislikes/accessibility/currency/trip-window
 *  paths the same way a real turn would, not empty defaults. */
const FILTERS = {
  dislikes: ["museums"],
  accessibilityNeeds: [] as string[],
  interests: ["food", "architecture"],
  likes: [] as string[],
  currency: "USD",
  tripStart: "2027-05-10",
  tripEnd: "2027-05-14",
  travelers: 2,
};

const PLANS: Record<string, ToolCall[]> = {
  search_places: [{ tool: "search_places", query: "coffee shops", location: "Lisbon, Portugal" }],
  research_web: [{ tool: "research_web", query: "best neighborhoods to stay in Lisbon Portugal for first-time visitors" }],
  events: [{ tool: "events", query: "live music", location: "Lisbon, Portugal", artist: null, category: null, dateScoped: false }],
  flights: [{ tool: "flights", origin: "JFK", destination: "LIS", departureDate: null, returnDate: null }],
  stays: [{ tool: "stays", location: "Lisbon, Portugal", checkin: null, checkout: null, hotelName: null }],
  weather: [{ tool: "weather", location: "Lisbon, Portugal" }],
  directions: [{ tool: "directions", from: "Lisbon Airport", to: "Belem Tower, Lisbon", mode: "transit" }],
  multi_tool: [
    { tool: "search_places", query: "pastel de nata bakery", location: "Lisbon, Portugal" },
    { tool: "weather", location: "Lisbon, Portugal" },
    { tool: "directions", from: "Lisbon Airport", to: "Alfama, Lisbon", mode: "transit" },
  ],
};

function normalize(output: unknown): unknown {
  return JSON.parse(JSON.stringify(output, (key, value) => (key === "retrievedAt" ? "<normalized>" : value)));
}

/** Request headers that carry credentials. Recorded traffic is committed, so these must never be persisted as-is:
 *  the Duffel bearer token and LiteAPI key had been left in clear text in two cassettes. */
const SECRET_HEADERS = new Set(["authorization", "x-api-key", "x-goog-api-key", "api-key", "x-api-token", "cookie", "set-cookie"]);
function scrubSecrets(polly: Polly): void {
  polly.server.any().on("beforePersist", (_request: unknown, recording: { request?: { headers?: Array<{ name: string; value: string }> } }) => {
    for (const header of recording.request?.headers ?? []) {
      if (SECRET_HEADERS.has(String(header.name).toLowerCase())) header.value = "REDACTED";
    }
  });
}

const pollyConfig = {
  adapters: ["fetch"],
  persister: "fs" as const,
  persisterOptions: { fs: { recordingsDir: CASSETTE_DIR } },
  matchRequestsBy: { headers: false },
  recordFailedRequests: true,
  logLevel: "silent" as const,
};

async function recordAndValidate(name: string, plan: ToolCall[]): Promise<boolean> {
  // --- Record: real network, force a fresh recording (overwrite any prior cassette). ---
  clearMemoryCache();
  const recorder = new Polly(name, { ...pollyConfig, mode: "record", recordIfMissing: true });
  scrubSecrets(recorder);
  const liveOutput = await retrieveEvidence(plan, FILTERS);
  await recorder.stop();

  // --- Replay-fidelity gate: fresh state, network disabled except for exactly what was just
  // recorded (recordIfMissing: false — a miss throws instead of silently calling live, unlike
  // nock's define()+disableNetConnect, which silently fell through). Confirm the output matches
  // the live call byte-for-byte. ---
  clearMemoryCache();
  const player = new Polly(name, { ...pollyConfig, mode: "replay", recordIfMissing: false });
  let replayedOutput: unknown;
  let threw: unknown;
  try {
    replayedOutput = await retrieveEvidence(plan, FILTERS);
  } catch (error) {
    threw = error;
  } finally {
    await player.stop();
  }

  if (threw) {
    console.log(`[${name}] replay-fidelity: FAIL (threw: ${String(threw).slice(0, 300)})`);
    return false;
  }

  const liveJson = JSON.stringify(normalize(liveOutput));
  const replayJson = JSON.stringify(normalize(replayedOutput));
  const ok = liveJson === replayJson;
  console.log(`[${name}] cassette -> ${CASSETTE_DIR}${name}/`);
  console.log(`[${name}] replay-fidelity: ${ok ? "PASS" : "FAIL"}`);
  if (!ok) {
    console.error(`[${name}] LIVE:   ${liveJson}`);
    console.error(`[${name}] REPLAY: ${replayJson}`);
  }
  return ok;
}

const results: Record<string, boolean> = {};
for (const [name, plan] of Object.entries(PLANS)) {
  results[name] = await recordAndValidate(name, plan);
}

console.log("\n=== Summary ===");
for (const [name, ok] of Object.entries(results)) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (Object.values(results).some((ok) => !ok)) process.exit(1);
