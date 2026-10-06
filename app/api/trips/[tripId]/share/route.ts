import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";
import { invalidate } from "@/lib/server/ttl-cache";

/** Current share state — lets the UI show an existing link instead of defaulting to "off". */
export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const result = await supabase.from("trips").select("share_slug").eq("id", tripId).single();
    if (result.error) throw result.error;
    return NextResponse.json({ slug: (result.data.share_slug as string | null) ?? null });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Share status unavailable");
  }
}

/** Enable a public link for the trip. Owner only. Idempotent — keeps an existing slug. */
export async function POST(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "owner", registered: true });
    // 12 bytes → 96 bits of entropy. A public link is the only thing guarding the trip, so it
    // must not be brute-forceable (4 bytes / 32 bits was).
    const slug = randomBytes(12).toString("hex");
    // Atomic compare-and-set: only applies if no slug exists yet, so two concurrent "enable"
    // calls can't both read "no slug" and each write a different one — only the row that
    // actually still has share_slug IS NULL when this UPDATE runs gets it, the other affects
    // zero rows and falls through to read back whichever slug actually won.
    // Goes through set_trip_share (migration 0047): share_slug/share_visibility are no longer
    // writable by the general member UPDATE policy, and the function re-checks the owner role.
    const won = await supabase.rpc("set_trip_share", { p_trip_id: tripId, p_slug: slug, p_visibility: "link", p_only_if_unset: true });
    if (won.error) throw won.error;
    if (won.data) {
      invalidateWorkspace(tripId);
      return NextResponse.json({ slug: won.data as string, visibility: "link" });
    }
    const current = await supabase.from("trips").select("share_slug").eq("id", tripId).single();
    if (current.error) throw current.error;
    return NextResponse.json({ slug: current.data.share_slug, visibility: "link" });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "The share link couldn’t be updated.");
  }
}

/** Turn the public link off. Owner only. The slug is cleared so a new one is minted next time. */
export async function DELETE(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "owner", registered: true });
    // Read the outgoing slug first — without it the public /s/[slug] page keeps serving the
    // now-revoked trip out of loadPublicTrip's cache for up to its TTL after this returns.
    const existing = await supabase.from("trips").select("share_slug").eq("id", tripId).single();
    if (existing.error) throw existing.error;
    const updated = await supabase.rpc("set_trip_share", { p_trip_id: tripId, p_slug: null, p_visibility: "private", p_only_if_unset: false });
    if (updated.error) throw updated.error;
    invalidateWorkspace(tripId);
    if (existing.data.share_slug) await invalidate(`public-trip:${existing.data.share_slug}`);
    return NextResponse.json({ visibility: "private" });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "The share link couldn’t be updated.");
  }
}
