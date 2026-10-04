import { searchStays } from "@/packages/providers/liteapi/client";
import { searchGoogleHotels } from "@/packages/providers/serpapi/hotels";
import { stayProvider } from "@/lib/server/stay-provider";
import { cached } from "@/lib/server/ttl-cache";
import { resolveStayDates, staysCacheKey, DEFAULT_STAY_FILTERS } from "../../stay-dates";
import type { StaySearch } from "../../retrieve";
import type { ToolCall } from "../../turn-resolver";
import type { RetrieveContext } from "../context";

type StaysCall = Extract<ToolCall, { tool: "stays" }>;

export async function handleStays(call: StaysCall, ctx: RetrieveContext): Promise<void> {
  const provider = stayProvider();
  if (!provider) return;
  const { checkin, checkout, assumed: assumedDates } = resolveStayDates(call.checkin, call.checkout);
  const adults = ctx.filters.travelers ?? undefined;
  // Same 5-minute, party/date-aware cache the Stays tab route uses — a chat ask for a hotel
  // right after (or before) browsing the tab shouldn't re-hit the provider for the same
  // search. Built with the exact same key shape the route uses (DEFAULT_STAY_FILTERS
  // matches its filters object when no filter control has been touched) so the two can
  // actually collide instead of silently keying differently forever.
  const cacheKey = (provider === "serpapi" ? "serp:" : "") + staysCacheKey({ location: call.location, checkin, checkout, adults: adults ?? "", rooms: 1, currency: ctx.filters.currency ?? "", filters: DEFAULT_STAY_FILTERS });
  const result = await cached(cacheKey, 5 * 60_000, async () => {
    // Real hotels and prices from Google Hotels when it is set up; LiteAPI otherwise.
    if (provider === "serpapi") return searchGoogleHotels({ location: call.location, checkin, checkout, adults, currency: ctx.filters.currency ?? "CAD", limit: 12 }, ctx.signal);
    const point = await ctx.geocode(call.location);
    return searchStays(
      point
        ? { latitude: point[1], longitude: point[0], checkin, checkout, currency: ctx.filters.currency, adults }
        : { city: call.location, checkin, checkout, currency: ctx.filters.currency, adults },
      ctx.signal,
    );
  }).catch(ctx.fail(provider === "serpapi" ? "google-hotels" : "liteapi"));
  if (!result || result.options.length === 0) return;
  // Room rates were already in the search response — no second provider call.
  let detail: StaySearch["detail"];
  if (call.hotelName) {
    const wanted = call.hotelName.trim().toLowerCase();
    const exact = result.options.filter((option) => option.name.trim().toLowerCase() === wanted);
    // Fall back to substring matching only when there's no exact hit, and only trust it
    // when it's unique — a city with several same-brand properties ("Hilton Garden Inn
    // Downtown" vs "...Airport") must not have one arbitrarily picked and its room rates
    // presented as if they were the specific hotel asked about.
    const candidates = exact.length
      ? exact
      : result.options.filter((option) => option.name.toLowerCase().includes(wanted) || wanted.includes(option.name.toLowerCase()));
    const match = candidates.length === 1 ? candidates[0] : undefined;
    if (match && match.rooms.length) detail = { hotelName: match.name, rooms: match.rooms };
  }
  ctx.stays.push({ location: call.location, checkin, checkout, nights: result.nights, assumedDates, options: result.options, detail, adults, provider });
}
