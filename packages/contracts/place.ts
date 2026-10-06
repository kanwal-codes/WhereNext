import { z } from "zod";
/**
 * A real web link. `z.string().url()` alone also accepts `javascript:`, `data:`, `vbscript:`
 * and `file:` — schemes that become an XSS/click vector once rendered as an <a href>. Every
 * URL that reaches the UI as a link must go through this.
 */
export const httpUrl = z.string().url().refine((u) => /^https?:\/\//i.test(u.trim()), { message: "URL must be http(s)" });
export const placeSchema = z.object({ provider: z.string().min(1).max(80), providerId: z.string().min(1).max(240), name: z.string().min(1).max(300), category: z.string().max(120).nullable(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), address: z.string().max(600).nullable(), phone: z.string().max(80).optional(), websiteUri: httpUrl.optional(), openingHours: z.array(z.string().max(120)).max(7).optional(), openNow: z.boolean().optional(), wheelchairAccessible: z.boolean().optional(), reviewSummary: z.string().max(240).optional(), rating: z.number().min(0).max(5).optional(), userRatingCount: z.number().int().nonnegative().optional(), priceLevel: z.string().optional(), sourceUrl: httpUrl.nullable(), photoNames: z.array(z.string().min(1).max(400)).max(20).optional() });
export type Place = z.infer<typeof placeSchema>;
