import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { localDebts } from "@/lib/expense-split";
import { tripMemberIdentities } from "@/lib/server/trip-member-identities";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { escapeHtml, sendEmail } from "@/lib/server/email";
import { emailShell, emailStat, EMAIL_MUTED } from "@/lib/server/email-template";
import { formatMoney } from "@/lib/currency";

const bodySchema = z.object({ debtorUserId: z.string().uuid(), currency: z.string().trim().length(3) });

/**
 * A gentle, one-tap reminder for an open balance kept in this app (never Splitwise — that has
 * its own reminders). The amount and the pairing are never trusted from the client: both are
 * recomputed here from the trip's own expenses, the same way the GET route does, so a stale or
 * tampered balance can't trigger an email for money nobody actually owes any more.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user, role } = await requireTripMember(tripId, { registered: true });
    if (!(await withinRateLimit(`nudge:${user.id}`, 20, 60 * 60_000))) {
      return NextResponse.json({ error: "Too many reminders sent. Try again in a while." }, { status: 429 });
    }
    const { debtorUserId, currency } = bodySchema.parse(await request.json());
    const upperCurrency = currency.toUpperCase();

    const [expensesRes, memberRows] = await Promise.all([
      supabase.from("trip_expenses").select("amount,currency,paid_by,split,splitwise_expense_id").eq("trip_id", tripId),
      supabase.from("trip_members").select("user_id").eq("trip_id", tripId),
    ]);
    if (expensesRes.error) throw expensesRes.error;
    if (memberRows.error) throw memberRows.error;
    const memberIds = (memberRows.data ?? []).map((m) => m.user_id as string);
    const among = (split: unknown): string[] | null => {
      const list = (split as { among?: unknown } | null)?.among;
      return Array.isArray(list) && list.every((id) => typeof id === "string") && list.length > 0 ? (list as string[]) : null;
    };
    const localExpenses = (expensesRes.data ?? [])
      .filter((e) => !e.splitwise_expense_id)
      .map((e) => ({ amount: Number(e.amount), currency: e.currency as string, paidBy: e.paid_by as string | null, among: among(e.split) }));
    const debts = localDebts(localExpenses, memberIds);

    // Whoever is actually owed can nudge the debtor directly; the trip owner can also nudge on
    // their behalf (the one role this lightens — the "designated planner" who'd otherwise be the
    // one chasing everyone, friend's own money or not). Either way the match is against the real,
    // just-computed debt — not whatever the client happened to send.
    const onOwnBehalf = debts.find((d) => d.fromUserId === debtorUserId && d.toUserId === user.id && d.currency === upperCurrency);
    const onBehalfOfOwner = role === "owner" ? debts.find((d) => d.fromUserId === debtorUserId && d.currency === upperCurrency) : undefined;
    const debt = onOwnBehalf ?? onBehalfOfOwner;
    if (!debt) return NextResponse.json({ error: "That balance doesn't exist any more." }, { status: 404 });

    // One reminder per open debt per day, regardless of who sends it (the creditor and the owner
    // share this cooldown) — a nudge that can repeat hourly isn't gentle, it's the harassment the
    // feature exists to avoid becoming.
    const cooldownKey = `nudge-pair:${tripId}:${debt.fromUserId}:${debt.toUserId}:${debt.currency}`;
    if (!(await withinRateLimit(cooldownKey, 1, 24 * 60 * 60_000))) {
      return NextResponse.json({ error: "A reminder for this was already sent today." }, { status: 429 });
    }

    const [identities, tripRow] = await Promise.all([
      tripMemberIdentities(tripId),
      supabase.from("trips").select("name").eq("id", tripId).maybeSingle(),
    ]);
    const debtor = identities.get(debtorUserId);
    // No email on file means a guest (anonymous sessions have none) or a lookup failure — either
    // way there is nowhere to send this, and the one in-app surface (the balance row itself) is
    // already visible to them whenever they do open the trip.
    if (!debtor?.email) return NextResponse.json({ error: "This person doesn't have an email on file yet." }, { status: 400 });

    // A global, account-level opt-out ("Collaborator activity" in account settings) — honoured
    // silently: the sender still sees a normal success response, since surfacing "they turned
    // reminders off" would itself be a small friction the feature shouldn't be creating.
    const admin = createSupabaseAdminClient();
    const prefs = await admin.from("profiles").select("data").eq("id", debtorUserId).maybeSingle();
    const optedOut = (prefs.data?.data as { notifications?: { collab?: boolean } } | null)?.notifications?.collab === false;
    if (optedOut) return NextResponse.json({ sent: false });

    const tripName = tripRow.data?.name || "your trip";
    const amount = formatMoney(debt.amount, debt.currency, { exact: true });
    const creditorName = debt.toUserId === user.id ? (user.email?.split("@")[0] ?? "a friend") : "a friend";
    const url = `${new URL(request.url).origin}/trips/${tripId}/bookings`;
    const sent = await sendEmail({
      to: debtor.email,
      subject: `A friendly reminder about ${tripName}`,
      text: `You have an open balance of ${amount} on ${tripName}, owed to ${creditorName}.\n\nSettle up: ${url}`,
      html: emailShell({
        preheader: `${amount} owed on ${tripName}`,
        bodyHtml: `<p style="margin:0">A friendly reminder — you have an open balance on <strong>${escapeHtml(tripName)}</strong>, owed to ${escapeHtml(creditorName)}.</p>
${emailStat("Open balance", amount)}
<p style="margin:0;font-size:13px;color:${EMAIL_MUTED}">The figure above is easy to select and paste straight into Venmo, PayPal, or an e-Transfer.</p>`,
        button: { label: "Settle up", url },
      }),
    }).catch(() => false);

    return NextResponse.json({ sent });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid reminder" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "The reminder couldn’t be sent.");
  }
}
