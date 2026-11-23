import { liteApiConfigured } from "@/packages/providers/liteapi/client";
import { serpConfigured } from "@/packages/providers/serpapi/client";

/** Where stays come from: Google Hotels through SerpAPI (real hotels and prices) when it is set up, else LiteAPI. */
/** What to tell the search reader about the kinds of stay this source has: Google Hotels sorts everything into two, so a villa, apartment or cottage is a "Vacation Rental". */
export const stayTypesHint = () => (stayProvider() === "serpapi" ? 'Use only "Hotel" or "Vacation Rental": a villa, apartment, house, cottage or guest house is "Vacation Rental".' : undefined);

export const stayProvider = (): "serpapi" | "liteapi" | null => (serpConfigured() ? "serpapi" : liteApiConfigured() ? "liteapi" : null);
