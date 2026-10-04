/** Hourly ceilings per signed-in person for routes that cost money: `llm` for anything that calls a language model,
 *  `provider` for paid data (places, flights, stays, events, directions). Generous for a person, a wall for a script.
 *  Kept in its own module so routes can name a bucket without pulling in the auth module. */
export const LIMITS = {
  llm: { bucket: "llm", max: 60 },
  provider: { bucket: "provider", max: 600 },
} as const;
