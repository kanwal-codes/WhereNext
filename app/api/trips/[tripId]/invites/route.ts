import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { sendEmail } from "@/lib/server/email";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";

const bodySchema = z.object({ role: z.enum(["editor", "viewer"]).default("editor"), email: z.string().email().optional() });

/**
 * Mint a shareable invite link. Owner only. If `email` is given and email is
 * configured, also sends the link; either way the link is returned so the owner
 * can share it by hand.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { role: "owner" });
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const token = randomBytes(16).toString("hex");
    const inserted = await supabase
      .from("trip_invites")
      .insert({ trip_id: tripId, token, role: body.role, email: body.email ?? null, created_by: user.id })
      .select("token,role,expires_at")
      .single();
    if (inserted.error) throw inserted.error;

    const url = `${new URL(request.url).origin}/join/${inserted.data.token}`;
    let emailed = false;
    if (body.email) {
      const trip = await createTripRepository(supabase).get(tripId).catch(() => null);
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
