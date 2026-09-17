/**
 * Phase 0.1.3 (docs/overhaul/roadmap/phase-0-prerequisites.md) — runs today's (pre-refactor)
 * retrieveEvidence against each Polly.js cassette recorded by
 * scripts/record-retrieve-cassettes.ts and saves its output to tests/fixtures/golden/<name>.json.
 * This is what Phase 1.1–1.2's registry split diffs against after every single extraction step.
 *
 *   bun run scripts/capture-golden-retrieve.ts
 *
 * Determinism gate (part of 0.1.3, not optional): run this script twice in a row and diff the
 * output directory — the two runs must be byte-identical, or retrieveEvidence has some
 * non-determinism that would poison the safety net, and that must be found and fixed before
 * Phase 1 starts, not worked around here.
 */

delete process.env.REDIS_URL;

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
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
const GOLDEN_DIR = fileURLToPath(new URL("../tests/fixtures/golden/", import.meta.url));
mkdirSync(GOLDEN_DIR, { recursive: true });

// Must exactly match record-retrieve-cassettes.ts — replaying the wrong plan against a
// cassette would recreate the same non-determinism this gate exists to catch.
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

// `retrievedAt` is `new Date().toISOString()` by design — never comparable across two runs of
// this script. Every other field must be stable; this is the one deliberate exclusion.
function normalize(output: unknown): unknown {
  return JSON.parse(JSON.stringify(output, (key, value) => (key === "retrievedAt" ? "<normalized>" : value)));
}

if (!existsSync(CASSETTE_DIR) || readdirSync(CASSETTE_DIR).length === 0) {
  console.error(`No cassettes found in ${CASSETTE_DIR} — run scripts/record-retrieve-cassettes.ts first.`);
  process.exit(1);
}

const pollyConfig = {
  adapters: ["fetch"],
  persister: "fs" as const,
  persisterOptions: { fs: { recordingsDir: CASSETTE_DIR } },
  matchRequestsBy: { headers: false },
  mode: "replay" as const,
  recordIfMissing: false,
  logLevel: "silent" as const,
};

let failed = false;
for (const [name, plan] of Object.entries(PLANS)) {
  clearMemoryCache();
  const player = new Polly(name, pollyConfig);
  let output: unknown;
  let threw: unknown;
  try {
    output = await retrieveEvidence(plan, FILTERS);
  } catch (error) {
    threw = error;
  } finally {
    await player.stop();
  }

  if (threw) {
    console.error(`[${name}] FAILED — retrieveEvidence threw against its own cassette: ${String(threw).slice(0, 300)}`);
    failed = true;
    continue;
  }

  const goldenPath = `${GOLDEN_DIR}${name}.json`;
  writeFileSync(goldenPath, JSON.stringify(normalize(output), null, 2) + "\n");
  console.log(`[${name}] golden output -> ${goldenPath}`);
}

if (failed) process.exit(1);
