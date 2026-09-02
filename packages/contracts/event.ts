import { z } from "zod";

/** A single event's full detail — from Ticketmaster's event endpoint and/or web research. */
export const eventDetailSchema = z.object({
  title: z.string(),
  source: z.string(),
  url: z.string().nullable(),
  imageUrl: z.string().nullable(),
  date: z.string().nullable(),
  status: z.string().nullable(),
  venueName: z.string().nullable(),
  venueAddress: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  performers: z.array(z.string()).default([]),
  genre: z.string().nullable(),
  priceRange: z.string().nullable(),
  onSale: z.string().nullable(),
  promoter: z.string().nullable(),
  /** Provider blurb + anything worth surfacing from the web (lineup, what to expect). */
  about: z.string().nullable(),
  pleaseNote: z.string().nullable(),
  seatmapUrl: z.string().nullable(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).default([]),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;
