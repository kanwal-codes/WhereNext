import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guestDecision } from "@/lib/guest-policy";

const TRIP = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});
beforeEach(() => vi.clearAllMocks());

describe("guest policy: Roam only", () => {
  const allowed: Array<[string, string]> = [
    ["GET", "/"],
    ["GET", "/landing-next"],
    ["GET", "/sign-up"],
    ["GET", "/auth-callback"],
    ["GET", `/trips/${TRIP}/chat`],
    ["GET", "/design/discover-pottery.jpg"],
    ["GET", "/_next/static/chunks/app.js"],
    ["POST", "/api/guest/start"],
    ["POST", "/api/guest/reset"],
    ["POST", "/api/guest/claim-ticket"],
    ["POST", "/api/ai"],
    ["GET", "/api/profile"],
    ["GET", `/api/trips/${TRIP}/conversation`],
    ["GET", `/api/trips/${TRIP}/memory`],
    ["GET", `/api/trips/${TRIP}/places/google`],
    ["GET", `/api/trips/${TRIP}/places/google/photo`],
    ["GET", `/api/trips/${TRIP}/stays`],
    ["GET", `/api/trips/${TRIP}/stays/abc123`],
    ["GET", `/api/trips/${TRIP}/events/detail`],
    ["GET", "/api/hotel-photo"],
    ["GET", "/api/config/mapbox"],
    ["GET", `/api/trips/${TRIP}/cover`],
    ["GET", `/api/trips/${TRIP}/places/google/about`],
    ["GET", `/api/trips/${TRIP}/places/google/autocomplete`],
    ["GET", `/api/trips/${TRIP}/flights/places`],
    ["POST", `/api/trips/${TRIP}/flights`],
    ["POST", `/api/trips/${TRIP}/flights/return`],
  ];
  it.each(allowed)("lets a guest %s %s", (method, path) => {
    expect(guestDecision(path, method)).toEqual({ allow: true });
  });

  const closedApi: Array<[string, string]> = [
    ["POST", "/api/trips"],
    ["GET", "/api/trips"],
    ["POST", "/api/trips/import"],
    ["PUT", "/api/profile"],
    ["POST", "/api/commands"],
    ["POST", `/api/trips/${TRIP}/conversation`],
    ["PATCH", `/api/trips/${TRIP}`],
    ["DELETE", `/api/trips/${TRIP}`],
    ["PUT", `/api/trips/${TRIP}/places/placement`],
    ["PUT", `/api/trips/${TRIP}/places/bookmark`],
    ["POST", `/api/trips/${TRIP}/itinerary`],
    ["GET", `/api/trips/${TRIP}/itinerary`],
    ["GET", `/api/trips/${TRIP}/group-chat`],
    ["POST", `/api/trips/${TRIP}/group-chat`],
    ["POST", `/api/trips/${TRIP}/group-chat/roam`],
    ["POST", `/api/trips/${TRIP}/invites`],
    ["POST", `/api/trips/${TRIP}/share`],
    ["POST", `/api/trips/${TRIP}/expenses`],
    ["POST", `/api/trips/${TRIP}/bookings`],
    ["POST", `/api/trips/${TRIP}/stays`],
    ["POST", "/api/hotel-photo"],
    ["POST", "/api/config/mapbox"],
    ["PUT", `/api/trips/${TRIP}/flights`],
    ["GET", `/api/trips/${TRIP}/flights`],
    ["POST", `/api/trips/${TRIP}/flights/return/extra`],
    ["POST", `/api/trips/${TRIP}/cover`],
    ["GET", `/api/trips/${TRIP}/places`],
    ["GET", `/api/trips/${TRIP}/events`],
    ["POST", `/api/trips/${TRIP}/reco`],
    ["POST", `/api/trips/${TRIP}/compare-chat`],
    ["PATCH", `/api/trips/${TRIP}/suggestions`],
    ["PUT", `/api/trips/${TRIP}/memory`],
    ["POST", `/api/trips/${TRIP}/decisions`],
    ["POST", "/api/cron/trip-review"],
    ["POST", "/api/ai/other"],
    ["GET", "/api/anything-new-added-later"],
    // Reads that look allowed but use a write verb.
    ["DELETE", `/api/trips/${TRIP}/conversation`],
  ];
  it.each(closedApi)("refuses a guest %s %s", (method, path) => {
    expect(guestDecision(path, method)).toEqual({ allow: false, kind: "api" });
  });

  it("bounces every other trip page back to the chat, and everything else to the start", () => {
    for (const page of ["", "/itinerary", "/group", "/discover", "/map", "/stay", "/knowledge", "/bookings"]) {
      expect(guestDecision(`/trips/${TRIP}${page}`, "GET")).toEqual({ allow: false, kind: "page", redirectTo: `/trips/${TRIP}/chat` });
    }
    expect(guestDecision("/trips", "GET")).toEqual({ allow: false, kind: "page", redirectTo: "/" });
    expect(guestDecision("/trips/new", "GET")).toEqual({ allow: false, kind: "page", redirectTo: "/" });
    expect(guestDecision("/account", "GET")).toEqual({ allow: false, kind: "page", redirectTo: "/" });
  });
});

describe("POST /api/guest/reset", () => {
  function setup(user: { id: string; is_anonymous?: boolean } | null) {
    const signOut = vi.fn(async () => ({ error: null }));
    const deleteUser = vi.fn(async () => ({ error: null as null | Error }));
    vi.doMock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user } }), signOut } }) }));
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ auth: { admin: { deleteUser } } }) }));
    const clearRateLimits = vi.fn(async (_keys: string[]) => undefined);
    vi.doMock("@/lib/server/rate-limit", () => ({ clearRateLimits }));
    return { signOut, deleteUser, clearRateLimits };
  }
  const call = async () => (await import("@/app/api/guest/reset/route")).POST(new Request("http://x/api/guest/reset", { method: "POST" }), { params: Promise.resolve({}) });

  it("deletes a guest's user (its trips cascade) and signs the browser out", async () => {
    const { deleteUser, signOut, clearRateLimits } = setup({ id: "g1", is_anonymous: true });
    const response = await call();
    expect(response.status).toBe(204);
    expect(deleteUser).toHaveBeenCalledWith("g1");
    expect(signOut).toHaveBeenCalled();
    // Their own counters go too, and only those: never the per-IP ones.
    expect(clearRateLimits).toHaveBeenCalledWith(["guest-turns:g1", "guest-trips:g1", "guest-api:g1"]);
  });

  it("never touches a registered account", async () => {
    const { deleteUser, clearRateLimits } = setup({ id: "real", is_anonymous: false });
    const response = await call();
    expect(response.status).toBe(403);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(clearRateLimits).not.toHaveBeenCalled();
  });

  it("does nothing when there is no session", async () => {
    const { deleteUser } = setup(null);
    expect((await call()).status).toBe(204);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("reports a failed delete instead of pretending the session is gone", async () => {
    const { deleteUser, clearRateLimits } = setup({ id: "g1", is_anonymous: true });
    deleteUser.mockResolvedValueOnce({ error: new Error("db down") });
    expect((await call()).status).toBeGreaterThanOrEqual(500);
    expect(clearRateLimits).not.toHaveBeenCalled(); // the guest still exists, so keep their counters
  });
});

describe("GET /api/cron/guest-cleanup", () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  function setup(users: Array<{ id: string; is_anonymous: boolean; created_at: string }>) {
    const deleteUser = vi.fn(async () => ({ error: null }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => ({ auth: { admin: { listUsers: async () => ({ data: { users }, error: null }), deleteUser } } }),
    }));
    const clearRateLimits = vi.fn(async (_keys: string[]) => undefined);
    vi.doMock("@/lib/server/rate-limit", () => ({ clearRateLimits }));
    return Object.assign(deleteUser, { clearRateLimits });
  }
  const call = async (auth?: string) =>
    (await import("@/app/api/cron/guest-cleanup/route")).GET(new Request("http://x/api/cron/guest-cleanup", { headers: auth ? { authorization: auth } : {} }));

  it("refuses without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const deleteUser = setup([{ id: "old", is_anonymous: true, created_at: hoursAgo(48) }]);
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deletes only anonymous users older than the TTL", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const deleteUser = setup([
      { id: "old-guest", is_anonymous: true, created_at: hoursAgo(30) },
      { id: "fresh-guest", is_anonymous: true, created_at: hoursAgo(1) },
      { id: "old-real", is_anonymous: false, created_at: hoursAgo(900) },
    ]);
    const response = await call("Bearer s3cret");
    expect(await response.json()).toEqual({ scanned: 3, deleted: 1 });
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith("old-guest");
    expect(deleteUser.clearRateLimits).toHaveBeenCalledTimes(1);
    expect(deleteUser.clearRateLimits).toHaveBeenCalledWith(["guest-turns:old-guest", "guest-trips:old-guest", "guest-api:old-guest"]);
  });
});
