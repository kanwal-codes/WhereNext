import { describe, expect, it } from "vitest";
import { updateTripPreferences } from "@/lib/server/trip-preferences";

// Debugging-pass fix: every trip_preferences read-modify-write call site (memory/route.ts,
// commands/route.ts's update_preferences, suggestions/route.ts x2) used to select, merge, then
// upsert with no optimistic concurrency — two writers within the same window could silently
// clobber each other. This exercises the shared CAS helper those routes now go through.

const TRIP = "11111111-1111-4111-8111-111111111111";

type Row = { data: Record<string, unknown>; updated_at: string };

/** A minimal fake mirroring the exact chain shape `updateTripPreferences` calls. */
function makeFakeClient(initial: Row | null, opts: { alwaysLoseUpdateRace?: boolean } = {}) {
  let row: Row | null = initial;
  let version = initial ? 1 : 0;
  /** Runs once right after the NEXT select resolves — simulates a concurrent writer landing
   *  between this call's read and its write. */
  let onNextSelect: (() => void) | null = null;

  const client = {
    from: (table: string) => {
      if (table !== "trip_preferences") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              const snapshot = row;
              const hook = onNextSelect;
              onNextSelect = null;
              hook?.();
              return { data: snapshot, error: null };
            },
          }),
        }),
        update: (patch: { data: Record<string, unknown> }) => ({
          eq: () => ({
            eq: (_col: string, expectedUpdatedAt: string) => ({
              select: () => ({
                maybeSingle: async () => {
                  if (opts.alwaysLoseUpdateRace) return { data: null, error: null };
                  if (!row || row.updated_at !== expectedUpdatedAt) return { data: null, error: null };
                  version += 1;
                  row = { data: patch.data, updated_at: `v${version}` };
                  return { data: row, error: null };
                },
              }),
            }),
          }),
        }),
        insert: (payload: { data: Record<string, unknown> }) => ({
          select: () => ({
            maybeSingle: async () => {
              if (row) return { data: null, error: { code: "23505", message: "duplicate key" } };
              version += 1;
              row = { data: payload.data, updated_at: `v${version}` };
              return { data: row, error: null };
            },
          }),
        }),
      };
    },
  };

  return {
    client: client as never,
    getRow: () => row,
    /** Mutate the stored row as if a concurrent writer committed, right after the next select. */
    simulateConcurrentWriteAfterNextSelect: (next: Row) => { onNextSelect = () => { row = next; }; },
  };
}

describe("updateTripPreferences", () => {
  it("inserts a new row when none exists yet", async () => {
    const { client, getRow } = makeFakeClient(null);
    const result = await updateTripPreferences(client, TRIP, (previous) => ({ ...previous, groupType: "family" }));
    expect(result.data).toEqual({ groupType: "family" });
    expect(getRow()?.data).toEqual({ groupType: "family" });
  });

  it("merges onto the existing row via a matching-updated_at update, not a blind overwrite", async () => {
    const { client } = makeFakeClient({ data: { groupType: "family" }, updated_at: "v1" });
    const result = await updateTripPreferences(client, TRIP, (previous) => ({ ...previous, budget: 200 }));
    expect(result.data).toEqual({ groupType: "family", budget: 200 });
  });

  it("retries with the fresh row when another writer commits between this call's read and write", async () => {
    const { client, getRow, simulateConcurrentWriteAfterNextSelect } = makeFakeClient({ data: { groupType: "family" }, updated_at: "v1" });
    // Someone else's write lands right after we read v1 but before our own update — our update's
    // `.eq("updated_at", "v1")` now matches nothing, so we must reread and remerge onto THEIR change.
    simulateConcurrentWriteAfterNextSelect({ data: { groupType: "family", dates: "June" }, updated_at: "v1-concurrent" });
    const result = await updateTripPreferences(client, TRIP, (previous) => ({ ...previous, budget: 200 }));
    // Our merge must land on the CONCURRENT writer's data (dates: "June"), not the stale v1 we
    // originally read — proving we reread rather than blindly retrying the same stale merge.
    expect(result.data).toEqual({ groupType: "family", dates: "June", budget: 200 });
    expect(getRow()?.data).toEqual(result.data);
  });

  it("throws rather than silently dropping a write after repeatedly losing the race", async () => {
    const { client } = makeFakeClient({ data: {}, updated_at: "v1" }, { alwaysLoseUpdateRace: true });
    await expect(updateTripPreferences(client, TRIP, (previous) => ({ ...previous, budget: 1 }), 3)).rejects.toThrow(/lost the concurrency race/);
  });

  it("retries instead of throwing when two inserts race for a brand-new row", async () => {
    // First insert attempt hits a unique_violation (someone else inserted the row first, between
    // our select seeing no row and our own insert); the retry's select should see their row and
    // merge onto it instead of erroring out.
    let row: Row | null = null;
    let insertAttempts = 0;
    const client = {
      from: (table: string) => {
        if (table !== "trip_preferences") throw new Error(`unexpected table ${table}`);
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
          insert: (payload: { data: Record<string, unknown> }) => ({
            select: () => ({
              maybeSingle: async () => {
                insertAttempts += 1;
                if (insertAttempts === 1) return { data: null, error: { code: "23505", message: "duplicate key" } };
                row = { data: payload.data, updated_at: "v1" };
                return { data: row, error: null };
              },
            }),
          }),
        };
      },
    };
    const result = await updateTripPreferences(client as never, TRIP, (previous) => ({ ...previous, groupType: "solo" }));
    expect(result.data).toEqual({ groupType: "solo" });
    expect(insertAttempts).toBe(2);
  });
});
