import { liteApiConfigured } from "@/packages/providers/liteapi/client";
import { serpConfigured } from "@/packages/providers/serpapi/client";

/** Where stays come from: Google Hotels through SerpAPI (real hotels and prices) when it is set up, else LiteAPI. */
export const stayProvider = (): "serpapi" | "liteapi" | null => (serpConfigured() ? "serpapi" : liteApiConfigured() ? "liteapi" : null);
