import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import type { ToolCall } from "../../turn-resolver";
import type { RetrieveContext } from "../context";

type SearchPlacesCall = Extract<ToolCall, { tool: "search_places" }>;

export async function handleSearchPlaces(call: SearchPlacesCall, ctx: RetrieveContext, index: number): Promise<void> {
  // Live-testing finding (2026-09-16, docs/overhaul/roadmap/phase-4-recommendation-ranking.md):
  // Google's Text Search has no structured location of its own — it was trusting the query text
  // ("<query> in <location>") alone to keep results in the right city, and a real Montreal query
  // came back Toronto-dominated. `ctx.geocode` is already cached per-turn and 24h across turns,
  // so this costs nothing extra on a repeat location and directly closes the same bug in the
  // chatbot's own search tool, not just the "around here" recommendation panel it was first found in.
  const point = await ctx.geocode(call.location);
  const locationBias = point ? { lat: point[1], lng: point[0] } : undefined;
  const results = await new GooglePlacesProvider().search(`${call.query} in ${call.location}`, ctx.signal, undefined, locationBias).catch(ctx.fail("google-places"));
  if (!results) return;
  const provider = new GooglePlacesProvider();
  const enriched = await Promise.all(results.slice(0, 6).map(async (place) => {
    try {
      // "light": this enrichment only ever reads phone/website/hours/accessibility/editorial
      // summary below — never reviews or photos, which "full" would also fetch and parse
      // for nothing here. Billing tier is the SAME either way (Enterprise + Atmosphere) —
      // accessibility/editorial-summary alone already put both masks in that tier; see the
      // full explanation on GooglePlacesProvider.details() in packages/providers/google-places/client.ts.
      const detail = await provider.details(place.providerId, ctx.signal, "light") as { nationalPhoneNumber?: string; websiteUri?: string; regularOpeningHours?: { weekdayDescriptions?: string[]; openNow?: boolean }; accessibilityOptions?: { wheelchairAccessibleEntrance?: boolean }; editorialSummary?: { text?: string } };
      return { ...place, phone: detail.nationalPhoneNumber, websiteUri: detail.websiteUri, openingHours: detail.regularOpeningHours?.weekdayDescriptions, openNow: detail.regularOpeningHours?.openNow, wheelchairAccessible: detail.accessibilityOptions?.wheelchairAccessibleEntrance, reviewSummary: detail.editorialSummary?.text };
    } catch (error) {
      if (ctx.signal?.aborted) throw error;
      return place;
    }
  }));
  ctx.places.push(...enriched, ...results.slice(6));
  ctx.rawPlaceGroups.push({ index, label: call.query, places: enriched });
}
