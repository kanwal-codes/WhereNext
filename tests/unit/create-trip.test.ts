import { afterEach, describe, expect, it, vi } from "vitest";

const appendMock = vi.fn(async () => ({ id: "opener" }));
vi.mock("@/features/conversation/infrastructure/conversationRepository", () => ({
  createConversationRepository: () => ({ append: appendMock }),
}));

const { createTripRepository } = await import("../../features/trip/infrastructure/tripRepository");

/** A minimal, purpose-built Supabase stub for tripRepository.create()'s exact call shape —
 *  `existingTrip` seeds what the idempotency-check `maybeSingle()` finds. */
function makeSupabase(existingTrip: Record<string, unknown> | null) {
  const inserted: Record<string, unknown[]> = {};
  const from = (table: string) => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: existingTrip, error: null }) }), // trips idempotency check
        maybeSingle: async () => ({ data: null, error: null }), // profiles lookup
        single: async () => ({ data: existingTrip ?? { id: "new-trip-id", name: "New trip", destination: null }, error: null }), // final re-fetch
      }),
    }),
    insert: (row: unknown) => {
      (inserted[table] ??= []).push(row);
      return Promise.resolve({ error: null });
    },
  });
  return { supabase: { from } as never, inserted };
}

afterEach(() => vi.clearAllMocks());

describe("tripRepository.create — idempotency", () => {
  it("returns the existing trip and creates nothing else when the idempotency key already exists", async () => {
    const existing = { id: "trip-1", name: "Rome trip", destination: "Rome" };
    const { supabase, inserted } = makeSupabase(existing);
    const trip = await createTripRepository(supabase).create("user-1", { name: "Untitled trip", preferences: { interests: [] }, idempotencyKey: "retry-key" });
    expect(trip).toEqual(existing);
    expect(inserted.trips).toBeUndefined();
    expect(inserted.trip_members).toBeUndefined();
    expect(inserted.trip_preferences).toBeUndefined();
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("creates the trip (with the idempotency key attached) when nothing matches yet", async () => {
    const { supabase, inserted } = makeSupabase(null);
    await createTripRepository(supabase).create("user-1", { name: "Untitled trip", preferences: { interests: [] }, idempotencyKey: "fresh-key" });
    expect(inserted.trips).toHaveLength(1);
    expect(inserted.trips[0]).toMatchObject({ owner_id: "user-1", idempotency_key: "fresh-key" });
    expect(inserted.trip_members).toHaveLength(1);
    expect(inserted.trip_preferences).toHaveLength(1);
    expect(appendMock).toHaveBeenCalledOnce();
  });

  it("skips the idempotency check entirely and stores a null key when none is given", async () => {
    // Seeded as if a same-owner row already exists — irrelevant here, since with no
    // idempotencyKey the pre-check must never even run.
    const { supabase, inserted } = makeSupabase({ id: "unrelated-existing-row" });
    await createTripRepository(supabase).create("user-1", { name: "Untitled trip", preferences: { interests: [] } });
    // Proceeded straight to a normal insert (the short-circuit-return path never inserts).
    expect(inserted.trips).toHaveLength(1);
    expect(inserted.trips[0]).toMatchObject({ idempotency_key: null });
  });
});
