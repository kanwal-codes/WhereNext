import { research } from "@/packages/providers/tavily/client";
import { transit } from "@/packages/providers/google-places/transit";
import { route as mapboxRoute } from "@/packages/providers/mapbox/client";
import { transitAppPlan } from "@/packages/providers/transit-app/client";
import { cached } from "@/lib/server/ttl-cache";
import type { ToolCall } from "../../turn-resolver";
import type { RetrieveContext } from "../context";

type DirectionsCall = Extract<ToolCall, { tool: "directions" }>;

export async function handleDirections(call: DirectionsCall, ctx: RetrieveContext): Promise<void> {
  // Shared across callers, same reasoning as the other provider caches in this file — "how
  // do we get from the hotel to the airport" is exactly the kind of question multiple trip
  // members ask independently, or one re-asks minutes later. Not tied to this call's
  // signal — the cached load is shared, so one caller's abort must not cancel it out.
  let got = false;
  const dirFrom = call.from.trim().toLowerCase();
  const dirTo = call.to.trim().toLowerCase();
  if (call.mode === "transit") {
    const legs = await cached(`directions:transit:${dirFrom}:${dirTo}`, 5 * 60_000, () => transit({ origin: call.from, destination: call.to })).catch(ctx.fail("google-routes"));
    const leg = legs?.[0];
    if (leg && leg.durationSeconds > 0) {
      got = true;
      ctx.routes.push({
        from: call.from, to: call.to, mode: "transit",
        distanceMeters: leg.distanceMeters, durationSeconds: leg.durationSeconds,
        departureTime: leg.departureTime, arrivalTime: leg.arrivalTime,
        steps: ctx.formatTransitSteps(leg.steps),
        fare: leg.fare,
      });
    }
    if (!got) {
      // Second local-transit provider (better real-time in its ~300 covered cities).
      const [from, to] = await Promise.all([ctx.geocode(call.from), ctx.geocode(call.to)]);
      const plan = from && to
        ? await cached(`directions:transit-app:${from.join(",")}:${to.join(",")}`, 5 * 60_000, () => transitAppPlan(from, to)).catch(ctx.fail("transit-app"))
        : null;
      if (plan) {
        got = true;
        ctx.routes.push({
          from: call.from, to: call.to, mode: "transit",
          distanceMeters: plan.distanceMeters, durationSeconds: plan.durationSeconds,
          departureTime: plan.departureTime, arrivalTime: plan.arrivalTime,
          steps: ctx.formatTransitSteps(plan.steps),
        });
      }
    }
  } else {
    const [from, to] = await Promise.all([ctx.geocode(call.from), ctx.geocode(call.to)]);
    if (from && to) {
      const drawn = await cached(`directions:mapbox:${call.mode}:${from.join(",")}:${to.join(",")}`, 5 * 60_000, () =>
        mapboxRoute({ origin: from, destination: to, profile: call.mode === "walking" ? "walking" : "driving" }),
      ).catch(ctx.fail("mapbox"));
      if (drawn) { got = true; ctx.routes.push({ from: call.from, to: call.to, mode: call.mode, distanceMeters: drawn.distanceMeters, durationSeconds: drawn.durationSeconds, steps: [] }); }
    }
  }
  // Routes API doesn't do intercity rail/coach well (e.g. Tokyo→Kyoto Shinkansen).
  // Fall back to web research so the answer isn't a dead end.
  if (!got) {
    const web = await research(`best way to travel from ${call.from} to ${call.to} time cost`, ctx.signal).catch(ctx.fail("tavily"));
    if (web) ctx.sources.push(...web.map(({ title, url, content }) => ({ title, url, content })));
  }
}
