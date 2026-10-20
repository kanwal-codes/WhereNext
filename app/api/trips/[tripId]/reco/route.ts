import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { cached } from "@/lib/server/ttl-cache";
import { classifyPlaceVibe } from "@/packages/reco/vibes";
import { classifyByEmbedding } from "@/packages/reco/classify-embed";
import { cosine, embed } from "@/packages/ai/embed";
import { recordRecoEvents } from "@/lib/server/reco-trace";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * The AI touch-points for detail-page recommendations. Every op degrades to a harmless
 * default when embeddings are unavailable, so the caller never has to special-case an outage.
 *
 *   classify — embedding vibe for a place whose Google type carried no signal (sync map
 *              said "default"). Cached 24h by the anchor's stable id.
 *   rank     — cosine of one "more like this" lane's candidates against the anchor, so the
 *              client can blend a semantic term into its existing rank. Cached 1h.
 *   log      — fire-and-forget impression / click rows into `reco_events` for later tuning.
 */

/** Collision-resistant key fragment over EVERY input that determines a cached value. The shared
 *  cache is keyed by this alone, so anything left out of it (the client-supplied text) lets one
 *  member plant the result every other user then receives. */
function digest(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
}

const bodySchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("classify"),
    id: z.string().min(1).max(240),
    name: z.string().max(240).default(""),
    primaryType: z.string().max(120).nullish(),
    types: z.array(z.string().max(120)).max(30).nullish(),
    summary: z.string().max(800).nullish(),
  }),
  z.object({
    op: z.literal("rank"),
    anchor: z.string().min(1).max(400),
    candidates: z.array(z.object({ id: z.string().min(1).max(240), text: z.string().min(1).max(300) })).max(24),
  }),
  z.object({
    op: z.literal("log"),
    anchorKind: z.enum(["place", "event"]),
    anchorId: z.string().min(1).max(400),
    vibe: z.string().min(1).max(40),
    events: z
      .array(
        z.object({
          laneId: z.string().min(1).max(60),
          action: z.enum(["impression", "click"]),
          itemKind: z.enum(["place", "event"]),
          itemId: z.string().min(1).max(400),
          position: z.number().int().nonnegative().max(999).optional(),
        }),
      )
      .max(60),
  }),
]);

export const POST = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { limit: LIMITS.provider });
    const input = bodySchema.parse(await request.json().catch(() => null)); // unparseable body → ZodError → 400

    if (input.op === "log") {
      // reco_events is server-write-only (migration 0047); fall back to the member client where the
      // service role isn't configured (the write is best-effort analytics either way).
      let traceWriter = supabase;
      try { traceWriter = createSupabaseAdminClient(); } catch { /* best-effort */ }
      recordRecoEvents(
        traceWriter,
        tripId,
        input.events.map((e) => ({
          anchor_kind: input.anchorKind,
          anchor_id: input.anchorId,
          vibe: input.vibe,
          lane_id: e.laneId,
          action: e.action,
          item_kind: e.itemKind,
          item_id: e.itemId,
          position: e.position,
        })),
      );
      return NextResponse.json({ ok: true });
    }

    if (input.op === "classify") {
      const sync = classifyPlaceVibe({ primaryType: input.primaryType, types: input.types, name: input.name });
      if (sync.vibe !== "default") return NextResponse.json(sync);
      const text = [input.name, input.primaryType, (input.types ?? []).join(" "), input.summary].filter(Boolean).join(". ");
      // Only a real embedding result is cached — a transient outage throws, `cached()` drops
      // the key, and we return the sync default without poisoning the 24h slot.
      const result = await cached(`reco:vibe:${input.id}:${digest(text)}`, 24 * 60 * 60_000, async () => {
        const embedded = await classifyByEmbedding(text);
        if (!embedded) throw new Error("embeddings unavailable");
        return embedded;
      }).catch(() => sync);
      return NextResponse.json(result);
    }

    // op === "rank"
    if (input.candidates.length === 0) return NextResponse.json({ scores: {} });
    try {
      // Google/TM results behind these candidates are themselves cached minutes-long, so the
      // same anchor + candidate set recurs across views — cache the cosine pass for an hour.
      const key = `reco:rank:${digest([input.anchor, [...input.candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((c) => [c.id, c.text])])}`;
      const scores = await cached(key, 60 * 60_000, async () => {
        const [anchorVec, ...candVecs] = await embed([input.anchor, ...input.candidates.map((c) => c.text)]);
        return Object.fromEntries(input.candidates.map((c, i) => [c.id, cosine(anchorVec, candVecs[i])]));
      });
      return NextResponse.json({ scores });
    } catch {
      return NextResponse.json({ scores: {} }); // embeddings down → client keeps its own order
    }
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Recommendations unavailable");
  }
});
