/** Hourly ceilings per signed-in person for routes that cost money: `llm` for anything that calls a language model,
 *  `provider` for paid data (places, flights, stays, events, directions). Generous for a person, a wall for a script.
 *  Kept in its own module so routes can name a bucket without pulling in the auth module. */
export const LIMITS = {
  llm: { bucket: "llm", max: 60 },
  provider: { bucket: "provider", max: 600 },
  /** Routes that run web search + a model call per cache miss (events detail, seasonal weather, stay
   *  detail): the model bucket's cost, but more generous because opening a page can fan out to several. */
  enrich: { bucket: "enrich", max: 120 },
  /** Billed Google Places Photo / cover Text Search routes: browsers cache the bytes, so a real session
   *  stays far below this; it only bounds a script re-requesting the same photo names. */
  photo: { bucket: "photo", max: 1200 },
  /** Route planning: one request fans out to many paid Google Routes / Mapbox calls (one per leg). */
  routes: { bucket: "routes", max: 90 },
} as const;
