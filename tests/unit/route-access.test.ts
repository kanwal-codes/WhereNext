import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Who may call each API route, read straight from the source: for every exported handler, the guards it
 * (or a same-file helper it calls) applies. Adding a route without a guard, or weakening the role a write
 * needs, fails here — and the full table is snapshotted so a reviewer sees any change to it.
 */
const API_DIR = path.resolve(__dirname, "../../app/api");
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

type Row = { key: string; method: string; route: string; guards: string[] };

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? routeFiles(path.join(dir, e.name)) : e.name === "route.ts" ? [path.join(dir, e.name)] : []));
}

function guardsOf(node: ts.Node, locals: Map<string, ts.Node>, seen = new Set<ts.Node>()): string[] {
  if (seen.has(node)) return [];
  seen.add(node);
  const found: string[] = [];
  const visit = (n: ts.Node) => {
    // `withRoute(run)` / `export const GET = run`: follow a same-file handler passed by name.
    if (ts.isIdentifier(n) && locals.has(n.text) && !(n.parent && ts.isVariableDeclaration(n.parent) && n.parent.name === n)) found.push(...guardsOf(locals.get(n.text)!, locals, seen));
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee)) {
        if (callee.text === "requireTripMember") {
          let role = "viewer", registered = false;
          const opts = n.arguments[1];
          if (opts && ts.isObjectLiteralExpression(opts)) {
            for (const p of opts.properties) {
              if (!ts.isPropertyAssignment(p)) continue;
              if (p.name.getText() === "role") role = p.initializer.getText().replace(/"/g, "");
              if (p.name.getText() === "registered" && p.initializer.getText() === "true") registered = true;
            }
          }
          found.push(`member:${role}${registered ? "+registered" : ""}`);
        } else if (callee.text === "hasBearer") found.push("cron-secret");
        else if (/^(requireUser|requireSession|requireAccount|requireRegistered)$/.test(callee.text)) found.push("user");
        else if (locals.has(callee.text)) found.push(...guardsOf(locals.get(callee.text)!, locals, seen));
      } else if (ts.isPropertyAccessExpression(callee) && callee.name.text === "getUser") found.push("user");
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function scan(): Row[] {
  const rows: Row[] = [];
  for (const file of routeFiles(API_DIR).sort()) {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const route = "/api/" + path.relative(API_DIR, path.dirname(file)).split(path.sep).join("/");
    const locals = new Map<string, ts.Node>();
    for (const st of sf.statements) {
      if (ts.isFunctionDeclaration(st) && st.name) locals.set(st.name.text, st);
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) locals.set(d.name.text, d.initializer);
    }
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !METHODS.has(d.name.text) || !d.initializer) continue;
        const guards = [...new Set(guardsOf(d.initializer, locals))].sort();
        rows.push({ key: `${d.name.text} ${route}`, method: d.name.text, route, guards });
      }
    }
  }
  return rows;
}

const rows = scan();

/** Open by design: probes, public proxies with their own allow-list, and rate-limited anonymous compute. */
const PUBLIC = new Set([
  "GET /api/health",
  "GET /api/hotel-photo",
  "POST /api/route-map",
]);

/** Writes under /api/trips/[tripId] that any member (even a viewer) may make, and why. */
const MEMBER_LEVEL_WRITES: Record<string, string> = {
  "POST /api/trips/[tripId]/ai-search": "search, writes nothing",
  "POST /api/trips/[tripId]/compare-chat": "a chat turn about options, writes nothing shared",
  "POST /api/trips/[tripId]/conversation": "a member's own Roam conversation",
  "POST /api/trips/[tripId]/directions": "route lookup",
  "POST /api/trips/[tripId]/flights": "flight search",
  "POST /api/trips/[tripId]/flights/return": "flight search",
  "POST /api/trips/[tripId]/reco": "recommendations lookup",
  "POST /api/trips/[tripId]/route-plan/hops": "route lookup",
  "POST /api/trips/[tripId]/transit": "route lookup",
  "PUT /api/trips/[tripId]/availability": "a member's own availability",
  "POST /api/trips/[tripId]/group-chat": "chatting",
  "POST /api/trips/[tripId]/group-chat/[messageId]/reactions": "chatting",
  "POST /api/trips/[tripId]/group-chat/roam": "chatting (registered members)",
  "POST /api/trips/[tripId]/group-chat/unread": "a member's own read marker",
  "POST /api/trips/[tripId]/polls": "group participation",
  "POST /api/trips/[tripId]/polls/[pollId]/vote": "group participation",
  "POST /api/trips/[tripId]/expenses/nudge": "settle-up reminder between members (registered)",
  "DELETE /api/trips/[tripId]/invites/[inviteId]": "any member may revoke an invite link (documented in the route)",
  "DELETE /api/trips/[tripId]/members/[userId]": "a member may leave; removing someone else is owner-only inside the handler",
};

describe("API route access", () => {
  it("finds the routes", () => {
    expect(rows.length).toBeGreaterThan(80);
  });

  it("guards every handler, except the listed public ones", () => {
    const unguarded = rows.filter((r) => r.guards.length === 0 && !PUBLIC.has(r.key)).map((r) => r.key);
    expect(unguarded).toEqual([]);
  });

  it("keeps the public list honest: each entry exists and really has no guard", () => {
    for (const key of PUBLIC) {
      const row = rows.find((r) => r.key === key);
      expect(row, `${key} is listed as public but no such handler exists`).toBeDefined();
      expect(row!.guards, `${key} now has a guard: drop it from PUBLIC`).toEqual([]);
    }
  });

  it("requires an editor (or owner) for every write under a trip, except the member-level ones", () => {
    const tripWrites = rows.filter((r) => r.route.startsWith("/api/trips/[tripId]") && r.method !== "GET");
    const weak = tripWrites.filter((r) => !r.guards.some((g) => /^member:(editor|owner)/.test(g)) && !(r.key in MEMBER_LEVEL_WRITES)).map((r) => `${r.key} [${r.guards.join(",")}]`);
    expect(weak).toEqual([]);
  });

  it("keeps the member-level write list honest: each entry exists and is actually member-level", () => {
    for (const key of Object.keys(MEMBER_LEVEL_WRITES)) {
      const row = rows.find((r) => r.key === key);
      expect(row, `${key} is listed as member-level but no such handler exists`).toBeDefined();
      expect(row!.guards.some((g) => /^member:(editor|owner)/.test(g)), `${key} now needs an editor: drop it from MEMBER_LEVEL_WRITES`).toBe(false);
    }
  });

  it("protects the dangerous writes with the right role", () => {
    const role = (key: string) => rows.find((r) => r.key === key)?.guards.join(",");
    expect(role("DELETE /api/trips/[tripId]")).toMatch(/member:owner/);
    expect(role("PATCH /api/trips/[tripId]/members/[userId]")).toMatch(/member:owner/);
    expect(role("POST /api/trips/[tripId]/expenses")).toMatch(/member:(editor|owner)/);
    expect(role("DELETE /api/trips/[tripId]/expenses/[expenseId]")).toMatch(/member:(editor|owner)/);
    expect(role("DELETE /api/account")).toBe("user");
  });

  it("matches the recorded access table (update the snapshot only for an intended change)", async () => {
    const table = rows.map((r) => `${r.method.padEnd(6)} ${r.route.padEnd(60)} ${r.guards.join(", ") || "public"}`).join("\n") + "\n";
    await expect(table).toMatchFileSnapshot("./__snapshots__/route-access.txt");
  });
});
