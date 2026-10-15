import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";
const CREDITOR = "22222222-2222-4222-8222-222222222222"; // paid; is owed
const DEBTOR = "33333333-3333-4333-8333-333333333333"; // owes
const OWNER = "44444444-4444-4444-8444-444444444444"; // trip owner, not party to the debt
const OUTSIDER = "55555555-5555-4555-8555-555555555555"; // a trip member, not owed anything

class TripAuthError extends Error {
  constructor(readonly status: 401 | 403 | 404 | 429, message: string) { super(message); this.name = "TripAuthError"; }
}

const requireTripMemberMock = vi.fn();
const withinRateLimitMock = vi.fn().mockResolvedValue(true);
const tripMemberIdentitiesMock = vi.fn();
const sendEmailMock = vi.fn().mockResolvedValue(true);
const profilesSelectMock = vi.fn();

vi.mock("@/lib/server/trip-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireTripMember: requireTripMemberMock,
    tripAuthResponse: (e: unknown) => (e instanceof TripAuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : null),
  };
});
vi.mock("@/lib/server/rate-limit", () => ({ withinRateLimit: withinRateLimitMock }));
vi.mock("@/lib/server/trip-member-identities", () => ({ tripMemberIdentities: tripMemberIdentitiesMock }));
vi.mock("@/lib/server/email", () => ({ sendEmail: sendEmailMock, escapeHtml: (v: unknown) => String(v ?? "") }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return { select: () => ({ eq: () => ({ maybeSingle: profilesSelectMock }) }) };
    },
  }),
}));

// One expense: DEBTOR and CREDITOR split 40/currency each way such that DEBTOR owes CREDITOR 20 USD.
const EXPENSES = [{ amount: 40, currency: "USD", paid_by: CREDITOR, split: { among: [CREDITOR, DEBTOR] }, splitwise_expense_id: null }];
const MEMBERS = [{ user_id: CREDITOR }, { user_id: DEBTOR }, { user_id: OWNER }, { user_id: OUTSIDER }];

function fakeSupabase() {
  return {
    from(table: string) {
      if (table === "trip_expenses") return { select: () => ({ eq: async () => ({ data: EXPENSES, error: null }) }) };
      if (table === "trip_members") return { select: () => ({ eq: async () => ({ data: MEMBERS, error: null }) }) };
      if (table === "trips") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "Lisbon Trip" }, error: null }) }) }) };
      throw new Error(`unexpected table ${table}`);
    },
  };
}

async function post(userId: string, role: string, body: unknown) {
  requireTripMemberMock.mockResolvedValue({ supabase: fakeSupabase(), user: { id: userId, email: `${userId}@example.com` }, role });
  const mod = await import("@/app/api/trips/[tripId]/expenses/nudge/route");
  return mod.POST(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ tripId: TRIP }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  withinRateLimitMock.mockResolvedValue(true);
  sendEmailMock.mockResolvedValue(true);
  tripMemberIdentitiesMock.mockResolvedValue(new Map([[DEBTOR, { email: "debtor@example.com", name: "Dana" }], [CREDITOR, { email: "creditor@example.com", name: "Cory" }]]));
  profilesSelectMock.mockResolvedValue({ data: { data: {} }, error: null }); // no opt-out by default
});
afterEach(() => {
  vi.resetModules();
});

describe("POST /api/trips/[tripId]/expenses/nudge", () => {
  it("lets the creditor remind their own debtor, and emails them", async () => {
    const res = await post(CREDITOR, "editor", { debtorUserId: DEBTOR, currency: "USD" });
    expect(res.status).toBe(200);
    expect((await res.json())).toEqual({ sent: true });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0]![0]).toMatchObject({ to: "debtor@example.com" });
  });

  it("refuses a trip member who is neither the creditor nor the owner", async () => {
    const res = await post(OUTSIDER, "editor", { debtorUserId: DEBTOR, currency: "USD" });
    expect(res.status).toBe(404);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("lets the trip owner remind on behalf of the actual creditor", async () => {
    const res = await post(OWNER, "owner", { debtorUserId: DEBTOR, currency: "USD" });
    expect(res.status).toBe(200);
    expect((await res.json())).toEqual({ sent: true });
  });

  it("404s a balance that doesn't exist (wrong currency, or already settled)", async () => {
    const res = await post(CREDITOR, "editor", { debtorUserId: DEBTOR, currency: "EUR" });
    expect(res.status).toBe(404);
  });

  it("won't let the debtor nudge themselves even if they try", async () => {
    const res = await post(DEBTOR, "editor", { debtorUserId: DEBTOR, currency: "USD" });
    expect(res.status).toBe(404);
  });

  it("refuses when the debtor has no email on file (a guest, or a failed lookup)", async () => {
    tripMemberIdentitiesMock.mockResolvedValue(new Map([[DEBTOR, { email: null, name: "Guest" }]]));
    const res = await post(CREDITOR, "editor", { debtorUserId: DEBTOR, currency: "USD" });
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("honours the debtor's 'Collaborator activity' opt-out silently — success response, no email sent", async () => {
    profilesSelectMock.mockResolvedValue({ data: { data: { notifications: { collab: false } } }, error: null });
    const res = await post(CREDITOR, "editor", { debtorUserId: DEBTOR, currency: "USD" });
    expect(res.status).toBe(200);
    expect((await res.json())).toEqual({ sent: false });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("enforces the once-a-day cooldown per debt pair, independent of the per-sender limit", async () => {
    withinRateLimitMock.mockImplementation(async (key: string) => !key.startsWith("nudge-pair:"));
    const res = await post(CREDITOR, "editor", { debtorUserId: DEBTOR, currency: "USD" });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/already sent today/i);
  });

  it("enforces the broader per-sender rate limit", async () => {
    withinRateLimitMock.mockImplementation(async (key: string) => !key.startsWith("nudge:"));
    const res = await post(CREDITOR, "editor", { debtorUserId: DEBTOR, currency: "USD" });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/too many reminders/i);
  });

  it("rejects a malformed body", async () => {
    const res = await post(CREDITOR, "editor", { debtorUserId: "not-a-uuid", currency: "US" });
    expect(res.status).toBe(400);
  });
});
