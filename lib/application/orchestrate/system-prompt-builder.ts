import { assistantSystemPrompt, dislikesInstruction } from "@/packages/contracts/assistant";
import { feasibilityHint } from "@/lib/application/feasibility";
import type { TripContext } from "@/lib/application/trip-context";
import type { RetrievedEvidence } from "@/lib/application/retrieve";
import type { ItineraryAnchor } from "@/lib/application/itinerary-anchor";

/**
 * The COMPOSE system-prompt template string (Phase 1.3.3,
 * docs/overhaul/roadmap/phase-1-structural-refactor.md), extracted verbatim out of
 * `runAssistantTurn` — previously only verifiable by running a whole turn, now a unit-testable
 * pure function ("does the prompt correctly mention dislikes").
 */
export function buildComposeSystemPrompt(params: {
  hasGrounding: boolean;
  locationFocus: string;
  viewContext?: string;
  dislikes: string[];
  accessibilityNeeds: string[];
  surfacedEarlier: Set<string>;
  requestedImages: boolean;
  tripCtx: TripContext;
  intent: string;
  evidence: RetrievedEvidence;
  compactSources: Array<{ title: string; url: string; content: string }>;
  /** Whether the itinerary/budget builders actually produced a block this turn — NOT just
   *  whether RESOLVE requested that capability. A builder can come back null (thin evidence, a
   *  currency mismatch, a timeout) even when the capability was requested; telling COMPOSE a
   *  block "is shown" in that case made it confidently reference a card the client never
   *  rendered. `exploreKind` carries the same distinction: pass it only when `optionsBlock`
   *  actually built, null otherwise — the request-level value (used to decide whether to even
   *  attempt the build) lives in the caller, not here. */
  showsItineraryBlock: boolean;
  /** What this reply carries a Map button on ("the route card", "the place cards"); empty when nothing does. */
  mapCards?: string[];
  showsBudgetBlock: boolean;
  exploreKind: "area" | "daytrip" | null;
  eventsGuidance: string;
  compactFlights: Array<{ exampleDate: boolean }>;
  compactStays: Array<{ nights: number; rooms: unknown; exampleDates: boolean }>;
  tripSummary: string;
  context: string;
  compactPlaces: Array<{ name: string; photoName?: string; phone?: string; websiteUri?: string; openingHours?: string[]; openNow?: boolean }>;
  compactEvents: unknown[];
  photoUrl: (name: string) => string;
  /** A real, timed itinerary stop the traveller will likely be at for this meal — set only when
   *  `itinerary-anchor.ts` found an actual set time, never a guess. The search below is already
   *  biased toward it; this just lets the reply name it as the reason, when a result is
   *  genuinely close, instead of silently recommending "near X" with no explanation. */
  mealAnchor?: ItineraryAnchor | null;
  /** RESOLVE's BCP-47 read of the latest message. */
  language?: string;
  /** What this very turn saved to the trip ("Dates: undecided → …"), so the reply can say so instead of calling it "already on file". */
  savedThisTurn?: string;
  /** Roam asked for the trip dates (or length) in one of its last few replies: it must not ask again in this one. */
  datesAlreadyAsked?: boolean;
  /** A change to the traveller's saved preferences that this turn proposes (JSON); the app shows it with a confirm button. */
  proposedChange?: string;
}): string {
  const {
    hasGrounding, locationFocus, viewContext, dislikes, accessibilityNeeds, surfacedEarlier, requestedImages,
    tripCtx, intent, evidence, compactSources, showsItineraryBlock, mapCards = [], showsBudgetBlock, exploreKind, eventsGuidance, compactFlights, compactStays,
    tripSummary, context, compactPlaces, compactEvents, photoUrl, mealAnchor, language, savedThisTurn, datesAlreadyAsked, proposedChange,
  } = params;

  const groundingInstruction = hasGrounding
    ? "Use only the evidence below for facts. If a detail is not there, say it is unavailable — do not infer it. If the latest user message names a place different from the trip's stored destination, answer for the newly named place."
    : "You have no fresh provider evidence for this. Answer from the trip context only, or say plainly what you cannot confirm. Do not invent places, prices, or hours.";

  return `${assistantSystemPrompt}

${groundingInstruction}
${language ? `Reply language for this message: "${language}" (BCP-47). It comes from the latest message alone — earlier turns in another language do not change it.\n` : ""}You have read-only lookup tools (places, web, weather, events, flights, directions, stays, and the trip's own itinerary/saved places). The evidence below is already retrieved for the plan — only call a tool for something it genuinely does not cover, such as directions between two places you just found, or a second web check. Do not re-fetch what is already below.

You are talking about: ${locationFocus}.${viewContext ? `\nThe user has this open beside the chat: ${viewContext}. Read "there", "this place", "it" as this unless the message names somewhere else.` : ""}${dislikes.length ? `\n${dislikesInstruction(dislikes)}` : ""}${accessibilityNeeds.length ? `\nAccessibility requirement (hard constraint): ${accessibilityNeeds.join(", ")}. Places already known to NOT meet this have been excluded from the evidence below — but a shown place's accessibility is only confirmed when the evidence explicitly says so; for any place without that confirmation, say plainly that its accessibility is not confirmed rather than assuming it fits.` : ""}${mealAnchor ? `\nThe traveller has "${mealAnchor.title}" scheduled at this time on Day ${mealAnchor.dayIndex} — the search below is already biased toward it. If a recommended place is genuinely close to it, you may say it fits well with that plan; do not claim they'll be there if a shown result isn't actually near it, and do not mention this for a result that has nothing to do with it.` : ""}
Previous messages are context only — never repeat their places, prices, or links unless they also appear in the fresh evidence below.${surfacedEarlier.size ? `\nAlready shown as cards earlier in this conversation: ${[...surfacedEarlier].slice(0, 30).join(", ")}. Don't present these again unless one is genuinely the best answer to the current question — and if so, say why it still fits.` : ""}${requestedImages ? "\nThe user asked for photos: include one markdown image per relevant place only if a supplied image URL exists; if none, say verified photos were not returned." : ""}
${feasibilityHint(typeof tripCtx.preferences.pace === "string" ? tripCtx.preferences.pace : undefined, tripCtx.itinerary.map((item) => item.day_index))}
If a recommendation usually sells out or needs timed entry, say so and suggest booking ahead.${(intent === "weather" || intent === "essentials" || evidence.weather) ? `\nWeather question: ${evidence.weather ? `a live reading is in the evidence ("${evidence.weather}") — treat it as a forecast only if the trip is within a week, otherwise as the current picture.` : "there is no live forecast (the trip is too far out for one, or the provider was down)."} ${compactSources.length ? "The web sources describe the destination's typical conditions for that month/season — build the answer from them, call it typical/seasonal (not a forecast), and say plainly whether that time of year is hot, mild, cold, wet or dry there." : "If you have nothing on the season either, say the weather is unavailable rather than guessing."} Finish with one concrete packing takeaway (umbrella, layers, sun, warm coat). Never apologise for a missing forecast when you can still describe the season.` : ""}${mapCards.length ? `\nMAP: this reply has a Map button on: ${mapCards.join(", ")}. It opens a map beside the chat. You cannot open it yourself: if the traveller asks to see it on a map, tell them how to open it, in the words given for that card, without inventing a different button name. Never say a map is "up", "open", "showing" or "beside the chat".` : `\nMAP: nothing in this reply has a Map button. If asked to show something on a map, say in one clause that you'll need to look up the places or route first, and offer to. Never say a map is showing.`}${showsItineraryBlock ? `\nA day-by-day itinerary is shown as a structured timeline block. Do NOT rewrite it as prose or list the stops. Give 1–2 sentences only: the shape of the trip and one thing worth booking ahead.` : ""}${showsBudgetBlock ? `\nA budget breakdown block with per-category figures is shown. Reply with ONE sentence only — the rough daily total and whether it fits their budget. Never restate the category numbers.` : ""}${exploreKind ? `\nA card list of ${exploreKind === "area" ? "neighbourhoods" : "day trips"} is shown. Reply with ONE sentence — your top pick and why. Do not describe every option.` : ""}${eventsGuidance ? `\n${eventsGuidance}` : ""}${compactFlights.length ? `\nFlight fare estimates are shown as cards. Give a one-line read (cheapest vs fastest, nonstop or not). ${compactFlights.some((search) => search.exampleDate) ? "The travel date is an example — ask for their real dates." : ""} Do not quote fares or list airlines; do not invent routes.` : ""}${compactStays.length ? `\nHotel rates for ${compactStays[0].nights} night(s) are shown as cards. Say which one or two fit the budget, group, and locked places and why.${compactStays.some((search) => search.rooms) ? " Room-level rates for the hotel the user asked about are also shown; say which room type fits the group." : ""} ${compactStays.some((search) => search.exampleDates) ? "The check-in/out dates are an example — ask for their real dates." : ""} Do not list hotels or prices; do not invent any.` : ""}${datesAlreadyAsked ? "\nYou already asked about the dates or trip length in a recent reply: do not ask for them again in this one. Carry on with sensible defaults and, if it matters, say what you assumed." : ""}${proposedChange ? `\nThis turn proposes a change to the traveller's saved preferences: ${proposedChange}. The app shows it as a card with a confirm button right under your reply, so say so in one short clause ("I've lined that up for you to confirm below"). Never say you cannot change their preferences.` : ""}

Trip so far: ${tripSummary}

Authorized trip context (JSON):
${context}

${savedThisTurn ? `This turn you saved to the trip: ${savedThisTurn}. Say so plainly (for example "I've set your dates to …"); the context below already shows the new values, so never describe them as already being on file before this message.\n` : ""}If the user just stated or corrected a trip fact (destination, dates, travellers, name), your reply must match what this trip context actually shows — it already reflects any change that was really saved. Never say "I'll update X" or "updated to Y" for a value this context does NOT show as Y: that field either wasn't a direct-enough statement to save automatically (say so, and that you've noted it for them to confirm) or the save failed (say you weren't able to save it and ask them to try again). Live-caught failure: told the user "I'll update travellers to 3" while the context still showed the old count — the words were the only "receipt" the user saw, and nothing had actually changed.

Fresh evidence (retrieved ${evidence.retrievedAt}; unavailable providers: ${evidence.unavailableProviders.join(", ") || "none"}):
${JSON.stringify({
    places: compactPlaces,
    sources: compactSources,
    events: compactEvents,
    flights: compactFlights,
    stays: compactStays,
    weather: evidence.weather,
    routes: evidence.routes.map((route) => ({ from: route.from, to: route.to, mode: route.mode, minutes: Math.round(route.durationSeconds / 60), km: +(route.distanceMeters / 1000).toFixed(1), steps: route.steps })),
    images: requestedImages ? compactPlaces.flatMap((place) => (place.photoName ? [{ place: place.name, url: photoUrl(place.photoName) }] : [])) : [],
  })}`;
}
