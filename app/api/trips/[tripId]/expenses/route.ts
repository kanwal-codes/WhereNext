import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createExpenseInput, type TripExpense, type LocalBalance, type ExpenseMember } from "@/packages/contracts/expense";
import { localDebts, totalsByCurrency } from "@/lib/expense-split";
import { tripMemberIdentities } from "@/lib/server/trip-member-identities";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { roundMoney } from "@/lib/currency";

const SELECT = "id,description,amount,currency,paid_by,created_by,created_at,split,splitwise_expense_id";

type ExpenseRow = { id: string; description: string; amount: number | string; currency: string; paid_by: string | null; created_by: string | null; created_at: string; split?: unknown; splitwise_expense_id?: string | null };

const amongOf = (split: unknown): string[] | null => {
  const among = (split as { among?: unknown } | null)?.among;
  return Array.isArray(among) && among.every((id) => typeof id === "string") && among.length > 0 ? (among as string[]) : null;
};

function toTripExpense(row: ExpenseRow): TripExpense {
  return {
    id: row.id, description: row.description, amount: Number(row.amount), currency: row.currency, paidBy: row.paid_by, createdBy: row.created_by, createdAt: row.created_at,
    splitAmong: amongOf(row.split), source: row.splitwise_expense_id ? "splitwise" : "local",
  };
}

/**
 * Insert an expense. A retry with the same idempotency key finds the row that already exists and returns it: the unique
 * index behind the key is partial (only rows that have a key), which an upsert cannot target, so a duplicate is caught
 * here instead.
 */
async function insertExpense(supabase: SupabaseClient, tripId: string, row: Record<string, unknown>) {
  const inserted = await supabase.from("trip_expenses").insert(row).select(SELECT).single();
  if (inserted.error?.code === "23505" && typeof row.idempotency_key === "string") {
    return supabase.from("trip_expenses").select(SELECT).eq("trip_id", tripId).eq("idempotency_key", row.idempotency_key).single();
  }
  return inserted;
}

/** Expenses logged on the trip: everyone can see what's been spent and who owes whom, no
 *  account needed. A handful of older rows may still carry a `splitwise_expense_id` from
 *  before this app's own ledger was the only path — those stay visible and un-deletable here
 *  (the real debt they describe lives on Splitwise's side now, untouched) but no longer affect
 *  anything this route computes. */
export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user, role } = await requireTripMember(tripId);

    const [expensesRes, memberRows, identities] = await Promise.all([
      supabase.from("trip_expenses").select(SELECT).eq("trip_id", tripId).order("created_at", { ascending: false }),
      supabase.from("trip_members").select("user_id").eq("trip_id", tripId),
      tripMemberIdentities(tripId),
    ]);
    if (expensesRes.error) throw expensesRes.error;
    if (memberRows.error) throw memberRows.error;

    const memberIds = (memberRows.data ?? []).map((m) => m.user_id as string);
    const members: ExpenseMember[] = memberIds.map((id) => ({ id, name: id === user.id ? "You" : (identities.get(id)?.name ?? "Someone"), isYou: id === user.id }));
    const nameOf = new Map(members.map((m) => [m.id, m.name]));
    const expenses = (expensesRes.data ?? []).map(toTripExpense);
    const localBalances: LocalBalance[] = localDebts(
      expenses.filter((e) => e.source === "local").map((e) => ({ amount: e.amount, currency: e.currency, paidBy: e.paidBy, among: e.splitAmong })),
      memberIds,
    ).map((d) => ({ ...d, fromName: nameOf.get(d.fromUserId) ?? "Someone", toName: nameOf.get(d.toUserId) ?? "Someone" }));
    return NextResponse.json({ expenses, members, localBalances, totals: totalsByCurrency(expenses), isOwner: role === "owner" });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Expenses are unavailable right now");
  }
}

/** Log an expense, split equally among everyone on the trip or just the people named. Editor
 *  role, like every other trip-mutating action. */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { role: "editor", registered: true });
    if (!(await withinRateLimit(`expense:${user.id}`, 30, 60 * 60_000))) {
      return NextResponse.json({ error: "Too many expenses logged. Try again in a while." }, { status: 429 });
    }
    const input = createExpenseInput.parse(await request.json());
    const currency = input.currency.toUpperCase();
    const amount = roundMoney(input.amount);

    const memberRows = await supabase.from("trip_members").select("user_id").eq("trip_id", tripId);
    if (memberRows.error) throw memberRows.error;
    const memberIds = new Set((memberRows.data ?? []).map((m) => m.user_id as string));
    const paidBy = input.paidBy ?? user.id;
    if (!memberIds.has(paidBy)) return NextResponse.json({ error: "Whoever paid has to be on the trip." }, { status: 400 });
    const among = input.splitAmong ? [...new Set(input.splitAmong)] : null;
    if (among && among.some((id) => !memberIds.has(id))) return NextResponse.json({ error: "Everyone it is split with has to be on the trip." }, { status: 400 });
    const row = { trip_id: tripId, created_by: user.id, paid_by: paidBy, description: input.description, amount, currency, split: among ? { among } : {} };
    const saved = await insertExpense(supabase, tripId, { ...row, ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}) });
    if (saved.error) throw saved.error;
    invalidateWorkspace(tripId);
    return NextResponse.json({ expense: toTripExpense(saved.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid expense" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "The expense couldn’t be logged.");
  }
}
