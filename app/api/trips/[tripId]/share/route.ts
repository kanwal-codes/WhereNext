import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

/** Enable a public link for the trip. Owner only. Idempotent — keeps an existing slug. */
export async function POST(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "owner" });
    const existing = await supabase.from("trips").select("share_slug").eq("id", tripId).single();
    if (existing.error) throw existing.error;
    // 12 bytes → 96 bits of entropy. A public link is the only thing guarding the trip, so it
    // must not be brute-forceable (4 bytes / 32 bits was).
    const slug = (existing.data.share_slug as string | null) ?? randomBytes(12).toString("hex");
    const updated = await supabase.from("trips").update({ share_slug: slug, share_visibility: "link" }).eq("id", tripId).select("share_slug").single();
    if (updated.error) throw updated.error;
    invalidateWorkspace(tripId);
    return NextResponse.json({ slug: updated.data.share_slug, visibility: "link" });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "The share link couldn’t be updated.");
  }
}

/** Turn the public link off. Owner only. The slug is cleared so a new one is minted next time. */
export async function DELETE(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "owner" });
    const updated = await supabase.from("trips").update({ share_slug: null, share_visibility: "private" }).eq("id", tripId);
    if (updated.error) throw updated.error;
    invalidateWorkspace(tripId);
    return NextResponse.json({ visibility: "private" });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "The share link couldn’t be updated.");
  }
}
