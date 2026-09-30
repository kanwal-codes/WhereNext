import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createExpenseInput, type TripExpense, type SplitwiseBalance } from "@/packages/contracts/expense";
import { liveSplitwiseAccessToken } from "@/lib/server/splitwise-account";
import { createGroup, createExpense as createSplitwiseExpense, getGroupBalances } from "@/packages/providers/splitwise/client";
import { tripMemberIdentities } from "@/lib/server/trip-member-identities";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { logger } from "@/lib/server/logger";
import { roundMoney } from "@/lib/currency";

const SELECT = "id,description,amount,currency,paid_by,created_by,created_at";

type ExpenseRow = { id: string; description: string; amount: number | string; currency: string; paid_by: string | null; created_by: string | null; created_at: string };

function toTripExpense(row: ExpenseRow): TripExpense {
  return { id: row.id, description: row.description, amount: Number(row.amount), currency: row.currency, paidBy: row.paid_by, createdBy: row.created_by, createdAt: row.created_at };
}

/** Expenses logged on the trip, backed by Splitwise. Needs the viewer's own connected
 *  account to show live balances — someone who hasn't connected still sees the local log. */
export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);

    const [expensesRes, tripRes] = await Promise.all([
      supabase.from("trip_expenses").select(SELECT).eq("trip_id", tripId).order("created_at", { ascending: false }),
      supabase.from("trips").select("splitwise_group_id").eq("id", tripId).maybeSingle(),
    ]);
    if (expensesRes.error) throw expensesRes.error;
    if (tripRes.error) throw tripRes.error;

    const groupId = tripRes.data?.splitwise_group_id ? Number(tripRes.data.splitwise_group_id) : null;
    const accessToken = await liveSplitwiseAccessToken(supabase, user.id);

    let balances: SplitwiseBalance[] | null = null;
    if (groupId && accessToken) {
      const debts = await getGroupBalances(accessToken, groupId).catch((error: unknown) => {
        logger.warn({ err: error, tripId }, "failed to load live splitwise balances");
        return null;
      });
      if (debts) {
        // getGroupBalances only ever returns Splitwise's OWN numeric user ids ("from": 123,
        // "to": 456) — live-caught: the panel rendered these as a bare "$42.00 owed" with no
        // name attached, because nothing resolved them back to a trip member. splitwise_accounts
        // is RLS-locked to each user's own row, so a security-definer RPC (mirroring
        // trip_splitwise_connection_status) is the only way to read every connected member's
        // mapping from here.
        const [idRows, identities] = await Promise.all([
          supabase.rpc("trip_splitwise_user_ids", { target_trip_id: tripId }),
          tripMemberIdentities(tripId),
        ]);
        if (idRows.error) throw idRows.error;
        const nameFor = new Map(
          ((idRows.data ?? []) as Array<{ user_id: string; splitwise_user_id: string }>).map(
            ({ user_id, splitwise_user_id }) => [splitwise_user_id, user_id === user.id ? "You" : (identities.get(user_id)?.name ?? "Someone")],
          ),
        );
        balances = debts.map((d) => ({ ...d, fromName: nameFor.get(String(d.fromUserId)) ?? "Someone", toName: nameFor.get(String(d.toUserId)) ?? "Someone" }));
      }
    }

    return NextResponse.json({ expenses: (expensesRes.data ?? []).map(toTripExpense), connected: Boolean(accessToken), groupId, balances });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Expenses are unavailable right now");
  }
}

/** Log an expense — split equally among every trip member who has connected Splitwise.
 *  Editor role: same as every other trip-mutating action, not owner-restricted. */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { role: "editor", registered: true });
    if (!(await withinRateLimit(`expense:${user.id}`, 30, 60 * 60_000))) {
      return NextResponse.json({ error: "Too many expenses logged. Try again in a while." }, { status: 429 });
    }
    const input = createExpenseInput.parse(await request.json());
    const currency = input.currency.toUpperCase();
    // Round once, here, to the exact value both Splitwise and this trip's own log will use —
    // rounding independently at each destination let a 3+-decimal amount (a typo, or a currency-
    // converted figure) permanently diverge between the two records. See roundMoney's doc comment.
    const amount = roundMoney(input.amount);

    const accessToken = await liveSplitwiseAccessToken(supabase, user.id);
    if (!accessToken) return NextResponse.json({ error: "Connect your Splitwise account before logging an expense." }, { status: 409 });

    // Idempotency check before anything provider-side — a retry (double-click, dropped
    // response) must never log a real expense with Splitwise twice.
    if (input.idempotencyKey) {
      const existing = await supabase.from("trip_expenses").select(SELECT).eq("trip_id", tripId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return NextResponse.json({ expense: toTripExpense(existing.data) }, { status: 200 });
    }

    const tripRow = await supabase.from("trips").select("name,splitwise_group_id").eq("id", tripId).single();
    if (tripRow.error) throw tripRow.error;
    let groupId = tripRow.data.splitwise_group_id ? Number(tripRow.data.splitwise_group_id) : null;

    if (!groupId) {
      // Lazily created on the trip's first expense — only members who've already connected
      // their own Splitwise account can be added; Splitwise groups are invite-based, so anyone
      // connecting later isn't retroactively added here (a real limitation, not a bug).
      // ponytail: if the trips.update below fails after this succeeds, the next attempt makes
      // a second orphaned group rather than reusing this one — acceptable for a rare failure
      // that costs an unused Splitwise group, not a lost expense.
      const [identities, connectedRows] = await Promise.all([
        tripMemberIdentities(tripId),
        supabase.rpc("trip_splitwise_connection_status", { target_trip_id: tripId }),
      ]);
      if (connectedRows.error) throw connectedRows.error;
      const connectedEmails = ((connectedRows.data as Array<{ user_id: string; connected: boolean }>) ?? [])
        .filter((r) => r.connected)
        .map((r) => identities.get(r.user_id)?.email)
        .filter((email): email is string => Boolean(email));

      groupId = await createGroup(accessToken, tripRow.data.name || "Trip", connectedEmails);
      const savedGroup = await supabase.from("trips").update({ splitwise_group_id: String(groupId) }).eq("id", tripId);
      if (savedGroup.error) throw savedGroup.error;
    }

    const swExpense = await createSplitwiseExpense(accessToken, groupId, input.description, amount, currency);

    // Splitwise now has a real expense record — log before the write below so a failed write
    // is detectable for manual reconciliation instead of silently vanishing from this trip's log
    // while still existing (and still owed) on Splitwise's side.
    logger.info({ tripId, splitwiseExpenseId: swExpense.id, groupId }, "expense logged with splitwise, persisting");

    let result;
    try {
      result = input.idempotencyKey
        ? await supabase
            .from("trip_expenses")
            .upsert(
              { trip_id: tripId, splitwise_expense_id: String(swExpense.id), created_by: user.id, paid_by: user.id, description: input.description, amount, currency, idempotency_key: input.idempotencyKey },
              { onConflict: "trip_id,idempotency_key" },
            )
            .select(SELECT)
            .single()
        : await supabase
            .from("trip_expenses")
            .insert({ trip_id: tripId, splitwise_expense_id: String(swExpense.id), created_by: user.id, paid_by: user.id, description: input.description, amount, currency })
            .select(SELECT)
            .single();
      if (result.error) throw result.error;
    } catch (writeError) {
      logger.error({ err: writeError, tripId, splitwiseExpenseId: swExpense.id }, "expense logged with splitwise but failed to persist locally — needs manual reconciliation");
      return NextResponse.json({ error: "This was logged on Splitwise, but we couldn't save it here — refresh in a moment before trying again." }, { status: 500 });
    }

    invalidateWorkspace(tripId);
    return NextResponse.json({ expense: toTripExpense(result.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid expense" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "The expense couldn’t be logged.");
  }
}
