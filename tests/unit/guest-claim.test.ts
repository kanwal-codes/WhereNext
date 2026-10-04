import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const GUEST = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";

const admin = {
  auth: { admin: { getUserById: vi.fn(), deleteUser: vi.fn() } },
  rpc: vi.fn(),
};
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => admin }));
vi.mock("@/lib/server/rate-limit", () => ({ clearRateLimits: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
  admin.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: GUEST, is_anonymous: true } } });
  admin.auth.admin.deleteUser.mockResolvedValue({ error: null });
  admin.rpc.mockResolvedValue({ data: ["trip-1"], error: null });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("claim ticket", () => {
  it("round-trips a genuine ticket", async () => {
    const { makeClaimTicket, readClaimTicket } = await import("@/lib/server/guest-claim");
    expect(readClaimTicket(makeClaimTicket(GUEST))).toBe(GUEST);
  });

  it("rejects an expired ticket", async () => {
    const { makeClaimTicket, readClaimTicket, CLAIM_TTL_S } = await import("@/lib/server/guest-claim");
    const issued = Date.now();
    expect(readClaimTicket(makeClaimTicket(GUEST, issued), issued + CLAIM_TTL_S * 1000 + 1000)).toBeNull();
  });

  it("rejects a tampered ticket, another guest's id, and junk", async () => {
    const { makeClaimTicket, readClaimTicket } = await import("@/lib/server/guest-claim");
    const [, exp, mac] = makeClaimTicket(GUEST).split(".");
    expect(readClaimTicket(`${ACCOUNT}.${exp}.${mac}`)).toBeNull();
    expect(readClaimTicket(`${GUEST}.${Number(exp) + 99999}.${mac}`)).toBeNull();
    expect(readClaimTicket(undefined)).toBeNull();
    expect(readClaimTicket("not-a-ticket")).toBeNull();
    expect(readClaimTicket(`${makeClaimTicket(GUEST)}.extra`)).toBeNull();
  });

  it("is not valid under a different server secret", async () => {
    const { makeClaimTicket } = await import("@/lib/server/guest-claim");
    const ticket = makeClaimTicket(GUEST);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "another-key");
    const { readClaimTicket } = await import("@/lib/server/guest-claim");
    expect(readClaimTicket(ticket)).toBeNull();
  });
});

describe("claimGuestTrips", () => {
  it("moves the guest's trips to the account and deletes the guest", async () => {
    const { claimGuestTrips, makeClaimTicket } = await import("@/lib/server/guest-claim");
    const moved = await claimGuestTrips({ id: ACCOUNT, is_anonymous: false }, makeClaimTicket(GUEST));
    expect(moved).toEqual(["trip-1"]);
    expect(admin.rpc).toHaveBeenCalledWith("claim_guest_trips", { p_guest: GUEST, p_account: ACCOUNT });
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(GUEST);
  });

  it("does nothing without a valid ticket", async () => {
    const { claimGuestTrips } = await import("@/lib/server/guest-claim");
    expect(await claimGuestTrips({ id: ACCOUNT, is_anonymous: false }, undefined)).toEqual([]);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("does nothing when the account is itself a guest, or is the ticket's own user", async () => {
    const { claimGuestTrips, makeClaimTicket } = await import("@/lib/server/guest-claim");
    expect(await claimGuestTrips({ id: ACCOUNT, is_anonymous: true }, makeClaimTicket(GUEST))).toEqual([]);
    expect(await claimGuestTrips({ id: GUEST, is_anonymous: false }, makeClaimTicket(GUEST))).toEqual([]);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("never touches a registered user named by a ticket", async () => {
    admin.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: GUEST, is_anonymous: false } } });
    const { claimGuestTrips, makeClaimTicket } = await import("@/lib/server/guest-claim");
    expect(await claimGuestTrips({ id: ACCOUNT, is_anonymous: false }, makeClaimTicket(GUEST))).toEqual([]);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("keeps the guest when the move fails", async () => {
    admin.rpc.mockResolvedValue({ data: null, error: new Error("db down") });
    const { claimGuestTrips, makeClaimTicket } = await import("@/lib/server/guest-claim");
    await expect(claimGuestTrips({ id: ACCOUNT, is_anonymous: false }, makeClaimTicket(GUEST))).rejects.toThrow("db down");
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });
});
