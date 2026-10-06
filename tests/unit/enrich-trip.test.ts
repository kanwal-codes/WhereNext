import { beforeEach, describe, expect, it, vi } from "vitest";

const { parse, cover } = vi.hoisted(() => ({ parse: vi.fn(), cover: vi.fn() }));
vi.mock("@/lib/application/parse-trip", () => ({ parseTripPrompt: parse }));
vi.mock("@/packages/providers/google-places/client", () => ({ GooglePlacesProvider: class { coverPhoto = cover; } }));
vi.mock("@/lib/server/workspace-cache", () => ({ invalidateWorkspace: vi.fn() }));

import { enrichTripFromPrompt } from "@/lib/application/enrich-trip";

/** A supabase stand-in: the one select returns `row`; the update is recorded. */
function fake(row: Record<string, unknown>) {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      update: (value: Record<string, unknown>) => ({ eq: async () => { updates.push(value); return { error: null }; } }),
    }),
  };
  return { client: client as never, updates };
}
const blank = { name: "Untitled trip", destination: null, origin: null, travelers: null, duration_days: null, start_date: null, end_date: null, hero_photo_name: null };

describe("enrichTripFromPrompt", () => {
  beforeEach(() => { parse.mockReset(); cover.mockReset(); });

  it("fills the blanks and saves the destination's cover photo in the same write", async () => {
    parse.mockResolvedValue({ name: "Italy", destination: "Italy" });
    cover.mockResolvedValue("places/abc/photos/xyz");
    const { client, updates } = fake(blank);
    await enrichTripFromPrompt(client, "t1", "trip to italy");
    expect(cover).toHaveBeenCalledWith("Italy");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ destination: "Italy" });
    expect(String(updates[0].hero_photo_name)).toContain("places/abc/photos/xyz");
  });

  it("still saves the destination when the cover lookup fails or finds nothing", async () => {
    parse.mockResolvedValue({ destination: "Chandigarh" });
    cover.mockRejectedValue(new Error("no key"));
    const { client, updates } = fake(blank);
    await enrichTripFromPrompt(client, "t1", "trip to chandigarh");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ destination: "Chandigarh" });
  });

  it("does not look for a cover when the trip already has one", async () => {
    parse.mockResolvedValue({ destination: "Rome" });
    const { client, updates } = fake({ ...blank, destination: "Rome", hero_photo_name: "stored" });
    await enrichTripFromPrompt(client, "t1", "rome");
    expect(cover).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
});
