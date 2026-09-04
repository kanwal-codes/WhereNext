import { z } from "zod";

/** A single event's full detail — Ticketmaster's event endpoint enriched with web research. */
export const eventDetailSchema = z.object({
  title: z.string(),
  source: z.string(),
  /** The primary "get tickets" URL. */
  url: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** "YYYY-MM-DD HH:MM" or a looser human string. */
  date: z.string().nullable(),
  /** Doors / entry time when it differs from the start time. */
  doorsTime: z.string().max(40).nullable().default(null),
  status: z.string().nullable(),
  venueName: z.string().nullable(),
  venueAddress: z.string().nullable(),
  city: z.string().max(120).nullable().default(null),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  /** Acts on the bill, headliner first. */
  performers: z.array(z.string()).default([]),
  /** One sentence on support acts / who else is on, when the bill isn't obvious from `performers`. */
  lineupNote: z.string().max(400).nullable().default(null),
  genre: z.string().nullable(),
  priceRange: z.string().nullable(),
  onSale: z.string().nullable(),
  promoter: z.string().nullable(),
  /** Age policy, e.g. "18+" or "Under 16s must be with an adult". */
  ageInfo: z.string().max(200).nullable().default(null),
  /** What the event IS and who's involved. Plain prose. */
  about: z.string().nullable(),
  /** The practical picture of the night — format, running time, set times, what it feels like. */
  whatToExpect: z.string().max(800).nullable().default(null),
  pleaseNote: z.string().nullable(),
  seatmapUrl: z.string().nullable(),
  /** Every way to get in — primary vendor plus any alternates / a search fallback. */
  ticketOptions: z.array(z.object({ label: z.string().max(60), url: z.string() })).max(4).default([]),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).default([]),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;
