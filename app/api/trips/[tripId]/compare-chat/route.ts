import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { loadTripContext, serializeTripContext } from "@/lib/application/trip-context";
import { createAiGateway } from "@/packages/ai/gateway";
import { createSseParser, parseSseJson } from "@/packages/ai/sse";

/**
 * A throwaway comparison conversation. It has the full trip context (so it can reason
 * about budget, pace, and how far each option is from where you're staying) but it
 * writes nothing — the messages live only in the client until the page reloads.
 */

const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  detail: z.string().max(200).optional(),
  price: z.string().max(60).optional(),
  rating: z.string().max(40).optional(),
  when: z.string().max(80).optional(),
  address: z.string().max(200).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
const bodySchema = z.object({
  items: z.array(itemSchema).min(1).max(6),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) })).min(1).max(20),
});

const R = 6371;
const toRad = (n: number) => (n * Math.PI) / 180;
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const { items, messages } = bodySchema.parse(await request.json());

    const context = await loadTripContext(supabase, tripId);
    const stay = context.lockedStay;
    const anchor = stay && stay.latitude != null && stay.longitude != null ? { name: stay.hotelName, lat: stay.latitude, lng: stay.longitude } : null;

    const itemLines = items.map((it, i) => {
      const bits = [it.detail, it.price && `price ${it.price}`, it.rating && `rating ${it.rating}`, it.when, it.address].filter(Boolean);
      const dist = anchor && it.lat != null && it.lng != null ? ` (~${haversineKm(anchor, { lat: it.lat, lng: it.lng }).toFixed(1)} km straight-line from ${anchor.name})` : "";
      return `${i + 1}. ${it.name}${bits.length ? ` — ${bits.join("; ")}` : ""}${dist}`;
    });

    const system = [
      "You are the traveller's trip assistant, helping them compare a short list of options they picked on screen.",
      "Be concise and decisive: in 2–4 sentences say which you'd choose and why, judging fit against their budget, pace, what's already planned, and how convenient each is from where they're staying.",
      anchor ? `They're staying at ${anchor.name}; the straight-line distances below are rough — if asked about real travel time, give a sensible range and say it depends on transit, never invent exact minutes.` : "No accommodation is locked yet, so you can't judge distance from a base.",
      "",
      `Trip context (JSON): ${serializeTripContext(context)}`,
      "",
      "Options being compared:",
      ...itemLines,
    ].join("\n");

    // Pinned, not routed through the resolve/compose role chain: this only needs a quick
    // 2-4 sentence take, and Cerebras's reasoning model (the role chain's default) answers
    // this exact kind of prompt anywhere from 9-30s with zero visible output the whole time
    // (its reasoning phase isn't streamed). gemma-4-31b answers the same prompt in ~0.3s.
    const upstream = await createAiGateway({ provider: "cerebras", model: "gemma-4-31b" }).stream(
      [{ role: "system", content: system }, ...messages],
      request.signal,
    );

    // Re-emit the upstream OpenAI SSE as a plain UTF-8 text stream of content deltas.
    const reader = upstream.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const parser = createSseParser();
    /** Enqueue the content deltas in `payloads`; returns true once `[DONE]` closed the stream. */
    const drain = (controller: ReadableStreamDefaultController<Uint8Array>, payloads: string[]): boolean => {
      for (const payload of payloads) {
        if (payload === "[DONE]") {
          controller.close();
          return true;
        }
        const delta = parseSseJson<{ choices?: Array<{ delta?: { content?: string } }> }>(payload)?.choices?.[0]?.delta?.content;
        if (delta) controller.enqueue(encoder.encode(delta));
      }
      return false;
    };
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          if (!drain(controller, [...parser.push(decoder.decode()), ...parser.flush()])) controller.close();
          return;
        }
        drain(controller, parser.push(decoder.decode(value, { stream: true })));
      },
      cancel() {
        reader.cancel().catch(() => {});
      },
    });

    return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return new Response(JSON.stringify({ error: "Invalid compare request" }), { status: 400, headers: { "content-type": "application/json" } });
    return tripAuthResponse(error) ?? new Response(JSON.stringify({ error: "The comparison assistant is unavailable right now" }), { status: 503, headers: { "content-type": "application/json" } });
  }
}
