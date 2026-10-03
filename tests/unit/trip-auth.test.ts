import { beforeEach, describe, expect, it, vi } from "vitest";

let user: { id: string } | null = { id: "u1" };
let member: { role: string } | null = { role: "owner" };

vi.mock("@/lib/supabase/server", () => ({
  getSessionUser: async (client: { auth: { getUser: () => Promise<{ data: { user: unknown } }> } }) => (await client.auth.getUser()).data.user,
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      q.select = chain; q.eq = chain;
      q.maybeSingle = async () => ({ data: member });
      return q;
    },
  }),
}));

import { TripAuthError, requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";

beforeEach(() => {
  user = { id: "u1" };
  member = { role: "owner" };
});

describe("requireTripMember", () => {
  it("returns the client and role for a member", async () => {
    await expect(requireTripMember("t1")).resolves.toMatchObject({ role: "owner", user: { id: "u1" } });
  });

  it("401 without a session, 404 for a non-member, 403 for an insufficient role", async () => {
    user = null;
    await expect(requireTripMember("t1")).rejects.toMatchObject({ status: 401 });
    user = { id: "u1" };
    member = null;
    await expect(requireTripMember("t1")).rejects.toMatchObject({ status: 404 });
    member = { role: "viewer" };
    await expect(requireTripMember("t1", { role: "editor" })).rejects.toMatchObject({ status: 403 });
    member = { role: "editor" };
    await expect(requireTripMember("t1", { role: "owner" })).rejects.toMatchObject({ status: 403 });
    await expect(requireTripMember("t1", { role: "editor" })).resolves.toMatchObject({ role: "editor" });
  });
});

describe("tripAuthResponse", () => {
  it("maps auth errors to responses and leaves other errors alone", async () => {
    const response = tripAuthResponse(new TripAuthError(404, "Trip not found"));
    expect(response?.status).toBe(404);
    await expect(response!.json()).resolves.toEqual({ error: "Trip not found" });
    expect(tripAuthResponse(new Error("db"))).toBeNull();
  });
});
