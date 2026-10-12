import { localToUtc } from "@/lib/server/timezone";
import { research } from "@/packages/providers/tavily/client";
import { transit, type TransitRoute } from "@/packages/providers/google-places/transit";
import { route as mapboxRoute } from "@/packages/providers/mapbox/client";
import { transitAppPlan } from "@/packages/providers/transit-app/client";
import { cached } from "@/lib/server/ttl-cache";
import { driveParts, simplifyPath, transitParts } from "../../route-path";
import { congestionRuns } from "../../route-overlay";
import type { ToolCall } from "../../turn-resolver";
import type { RetrieveContext } from "../context";

const MAX_TRANSIT = 3;

type DirectionsCall = Extract<ToolCall, { tool: "directions" }>;

/** 09:00 local at the origin on the trip's first day, as a UTC moment, when that day is still ahead; else undefined. */
async function morningDeparture(ctx: RetrieveContext, origin: string): Promise<string | undefined> {
  const start = ctx.filters.tripStart;
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start) || Date.parse(`${start}T00:00:00Z`) <= Date.now() + 86_400_000) return undefined;
  const at = await ctx.geocode(origin).catch(() => null);
  return (at && (await localToUtc(start, "09:00", at))) || undefined;
}

export async function handleDirections(call: DirectionsCall, ctx: RetrieveContext): Promise<void> {
  // Shared across callers, same reasoning as the other provider caches in this file — "how
  // do we get from the hotel to the airport" is exactly the kind of question multiple trip
  // members ask independently, or one re-asks minutes later. Not tied to this call's
  // signal — the cached load is shared, so one caller's abort must not cancel it out.
  let got = false;
  const dirFrom = call.from.trim().toLowerCase();
  const dirTo = call.to.trim().toLowerCase();
  if (call.mode === "transit") {
    // For a trip that has not started, plan for a morning departure on its first day, not "right now" (which, asked at
    // night, lists the last night bus). Left to "now" when the trip is under way, has no dates, or the lookup fails.
    const departAt = await morningDeparture(ctx, call.from);
    const fetchTransit = (preference?: "LESS_WALKING" | "FEWER_TRANSFERS") =>
      cached(`directions:transit:${departAt ?? "now"}:${preference ? `${preference}:` : ""}${dirFrom}:${dirTo}`, 5 * 60_000, async () => {
        const planned = departAt ? await transit({ origin: call.from, destination: call.to, routingPreference: preference, departureTime: departAt }).catch(() => []) : [];
        // A date too far out for the timetable comes back empty: ask for the next departures instead.
        return planned.length > 0 ? planned : transit({ origin: call.from, destination: call.to, routingPreference: preference });
      }).catch(ctx.fail("google-routes"));
    // Up to three ways that really differ (a different set of lines, not the same train a few minutes later).
    const lineKey = (leg: TransitRoute) => leg.steps.filter((step) => step.mode !== "walk").map((step) => `${step.mode}:${step.line ?? ""}`).join(">");
    const distinct = (list: TransitRoute[]) => {
      const seen = new Set<string>();
      return list.filter((leg) => leg.durationSeconds > 0 && !seen.has(lineKey(leg)) && seen.add(lineKey(leg)));
    };
    const first = (await fetchTransit()) ?? [];
    let options = distinct(first);
    // Google often answers a short trip with one plan. Ask it to plan for fewer changes and for less walking too: those
    // are the other ways a person would choose between, and they come back different. Only asked when needed.
    if (options.length > 0 && options.length < MAX_TRANSIT) {
      const more = await Promise.all([fetchTransit("FEWER_TRANSFERS"), fetchTransit("LESS_WALKING")]);
      options = distinct([...first, ...more.flatMap((legs) => legs ?? [])]);
    }
    for (const leg of options.sort((a, b) => a.durationSeconds - b.durationSeconds).slice(0, MAX_TRANSIT)) {
      got = true;
      ctx.routes.push({
        from: call.from, to: call.to, mode: "transit",
        distanceMeters: leg.distanceMeters, durationSeconds: leg.durationSeconds,
        departureTime: leg.departureTime, arrivalTime: leg.arrivalTime,
        steps: ctx.formatTransitSteps(leg.steps),
        fare: leg.fare,
        path: simplifyPath(leg.polyline),
        legs: transitParts(leg.steps),
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
      const drawn = await cached(`directions:mapbox:v2:${call.mode}:${from.join(",")}:${to.join(",")}`, 5 * 60_000, () =>
        mapboxRoute({ origin: from, destination: to, profile: call.mode === "walking" ? "walking" : "driving", traffic: call.mode !== "walking" }),
      ).catch(ctx.fail("mapbox"));
      if (drawn) {
        got = true;
        const coords = drawn.geometry.coordinates as Array<[number, number]>;
        const legs = call.mode === "walking"
          ? (simplifyPath(coords) ? [{ mode: "walk", minutes: drawn.durationSeconds / 60, path: simplifyPath(coords, 40)! }] : [])
          : driveParts(coords, congestionRuns(coords, drawn.congestion), drawn.durationSeconds / 60);
        ctx.routes.push({ from: call.from, to: call.to, mode: call.mode, distanceMeters: drawn.distanceMeters, durationSeconds: drawn.durationSeconds, steps: [], path: simplifyPath(coords), legs });
      }
    }
  }
  // Routes API doesn't do intercity rail/coach well (e.g. Tokyo→Kyoto Shinkansen).
  // Fall back to web research so the answer isn't a dead end.
  if (!got) {
    const web = await research(`best way to travel from ${call.from} to ${call.to} time cost`, ctx.signal).catch(ctx.fail("tavily"));
    if (web) ctx.sources.push(...web.map(({ title, url, content }) => ({ title, url, content })));
  }
}
