import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { sendEmail } from "@/lib/server/email";
import { withinRateLimit } from "@/lib/server/rate-limit";

// Every invite grants full (editor) access — a group trip has no read-only tier a person joins
// into; if they're in the group, they can plan alongside everyone else. `trip_members.role` still
// distinguishes "owner" internally (trip deletion, and the DB's own "at least one owner" guard),
// but that's never something an invite itself hands out.
const bodySchema = z.object({ email: z.string().email().optional() });

/** Outstanding (unaccepted, unexpired) invite links. Any member — RLS enforces this too. */
export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const rows = await supabase
      .from("trip_invites")
      .select("id,token,role,email,expires_at,created_at")
      .eq("trip_id", tripId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (rows.error) throw rows.error;
    const invites = (rows.data ?? []).map((r) => ({ id: r.id, token: r.token, role: r.role, email: r.email, expiresAt: r.expires_at, createdAt: r.created_at }));
    return NextResponse.json({ invites });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Pending invites are unavailable right now.");
  }
}

/**
 * Mint a shareable invite link. Any member — a shared trip has no single gatekeeper for who
 * gets to bring people in. If `email` is given and email is configured, also sends the link;
 * either way the link is returned so it can be shared by hand.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    if (!(await withinRateLimit(`invite:${user.id}`, 20, 60 * 60_000))) {
      return NextResponse.json({ error: "Too many invites created. Try again in a while." }, { status: 429 });
    }
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const token = randomBytes(16).toString("hex");
    const inserted = await supabase
      .from("trip_invites")
      .insert({ trip_id: tripId, token, role: "editor", email: body.email ?? null, created_by: user.id })
      .select("token,role,expires_at")
      .single();
    if (inserted.error) throw inserted.error;

    const url = `${new URL(request.url).origin}/join/${inserted.data.token}`;
    let emailed = false;
    if (body.email) {
      // Just the name, not the full trip repository read (destination, dates, preferences, hero
      // photo — none of which this email uses).
      const trip = await supabase.from("trips").select("name").eq("id", tripId).maybeSingle().then((r) => r.data, () => null);
      const inviter = user.email?.split("@")[0] ?? "Someone";
      const tripName = trip?.name ?? "a trip";
      const expires = new Date(inserted.data.expires_at).toDateString();
      emailed = await sendEmail({
        to: body.email,
        subject: `${inviter} invited you to plan ${tripName}`,
        text: `${inviter} invited you to help plan ${tripName} on Where next?\n\nJoin: ${url}\n\nThis link expires ${expires}. You'll need to sign in or create an account.`,
        html: `<p><strong>${inviter}</strong> invited you to help plan <strong>${tripName}</strong> on Where next?</p>
<p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#1b1c20;color:#fff;border-radius:8px;text-decoration:none">Join the trip</a></p>
<p style="color:#888;font-size:12px">Link expires ${expires}. You'll need to sign in or create an account.</p>`,
      }).catch(() => false);
    }

    return NextResponse.json({ url, token: inserted.data.token, role: inserted.data.role, expiresAt: inserted.data.expires_at, emailed }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "The invite couldn’t be created.");
  }
}
