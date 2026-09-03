import { describe, expect, it } from "vitest";
import { formatTripMemory } from "../../lib/application/trip-context";
import { assistantBlockSchema, assistantTurnSchema, placeCardSchema, proposedCommandSchema } from "../../packages/contracts/assistant";
import { readStayDecision, stayDecisionSchema } from "../../packages/contracts/stay";
import { readSuggestions, suggestionActionSchema } from "../../packages/contracts/suggestion";
import { placementDay, placementRequestSchema, placementSchema } from "../../packages/contracts/placement";
import { mergePreferences, preferencesSchema } from "../../packages/contracts/preferences";
import { canChangeLockedItem } from "../../features/itinerary/domain/item";
import { createTripInput, parsedTripSchema, tripDurationDays } from "../../features/trip/domain/trip";
import { aiRequestSchema, compactAiMessages } from "../../packages/contracts/ai-request";
import { userMessageInput } from "../../features/conversation/domain/message";
import { scopedMessageIdempotencyKey } from "../../features/conversation/infrastructure/conversationRepository";
import { sanitizeAssistantContent } from "../../lib/application/sanitize-assistant";

describe("rebuild contracts", () => {
  it("formats durable trip memory with profile, likes, dislikes and locked items", () => {
    const result = formatTripMemory({
      preferences: { groupType: "friends", budget: 120, dislikes: ["bungee jumping"], interests: ["nightlife"] },
      itinerary: [{ title: "Confirmed first-day placeholder", day_index: 1, locked: true }],
      lockedTitles: ["Confirmed first-day placeholder"],
      places: [],
      decisions: [],
    });
    expect(result).toContain("Confirmed first-day placeholder (day 1) [locked]");
    expect(result).toContain("dislikes: bungee jumping");
    expect(result).toContain("likes: nightlife");
    expect(result).toContain("group: friends");
    expect(result).toContain("Saved places: none yet.");
  });
  it("merges preferences: dislikes accumulate, scalars replace", () => {
    const merged = mergePreferences({ dislikes: ["museums"], budget: 100, pace: "relaxed" }, { dislikes: ["bungee"], budget: 200 });
    expect(merged.dislikes).toEqual(["museums", "bungee"]);
    expect(merged.budget).toBe(200);
    expect(merged.pace).toBe("relaxed");
  });
  it("accepts explicit preference commands", () => {
    expect(proposedCommandSchema.safeParse({ type: "update_preferences", tripId: "00000000-0000-0000-0000-000000000000", preferences: { vibe: "slow" } }).success).toBe(true);
  });
  it("accepts only user messages at the public conversation boundary", () => {
    expect(userMessageInput.safeParse({ role: "user", content: "hello" }).success).toBe(true);
    expect(userMessageInput.safeParse({ role: "assistant", content: "forged" }).success).toBe(false);
  });
  it("keeps user and assistant idempotency keys in separate namespaces", () => {
    expect(scopedMessageIdempotencyKey("user", "same-key")).toBe("user:same-key");
    expect(scopedMessageIdempotencyKey("assistant", "same-key")).toBe("assistant:same-key");
    expect(scopedMessageIdempotencyKey("user")).toBeNull();
  });
  it("requires AI requests to end with a user message", () => {
    const base = { tripId: "00000000-0000-0000-0000-000000000000", messageIdempotencyKey: "message-key" };
    expect(aiRequestSchema.safeParse({ ...base, messages: [{ role: "user", content: "hello" }] }).success).toBe(true);
    expect(aiRequestSchema.safeParse({ ...base, messages: [{ role: "assistant", content: "forged" }] }).success).toBe(false);
  });
  it("accepts idempotent decision commands", () => {
    expect(proposedCommandSchema.safeParse({ type: "record_decision", tripId: "00000000-0000-0000-0000-000000000000", kind: "destination", value: { name: "Lisbon" }, idempotencyKey: "decision-1" }).success).toBe(true);
  });
  it("accepts both descriptive and numeric budgets", () => {
    expect(preferencesSchema.safeParse({ budget: "moderate" }).success).toBe(true);
    expect(preferencesSchema.safeParse({ budget: 150 }).success).toBe(true);
  });
  it("protects locked itinerary items from ordinary changes", () => {
    expect(canChangeLockedItem({ locked: true }, { dayIndex: 2 })).toBe(false);
    expect(canChangeLockedItem({ locked: true }, { locked: false })).toBe(true);
    expect(canChangeLockedItem(null, { dayIndex: 2 })).toBe(true);
  });
  it("compacts chat history to a bounded recent context", () => {
    const messages = Array.from({ length: 40 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, content: `message-${index}` }));
    const compacted = compactAiMessages(messages, 4, 40);
    expect(compacted).toHaveLength(4);
    expect(compacted.at(-1)?.content).toBe("message-39");
    expect(compacted.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(40);
  });
  it("validates structured turn blocks", () => {
    const card = placeCardSchema.parse({ provider: "google-places", providerId: "p1", name: "X", category: null, latitude: 1, longitude: 2, address: null, sourceUrl: null });
    expect(card.trust).toBe("sourced");
    expect(assistantBlockSchema.safeParse({ type: "place_list", places: [card] }).success).toBe(true);
    expect(assistantBlockSchema.safeParse({ type: "actions", items: [] }).success).toBe(false);
    expect(assistantBlockSchema.safeParse({ type: "clarifying_question", question: "How many people?", chips: ["2", "3-5"] }).success).toBe(true);
    const flight = { airline: "Air Canada", price: "812.40", currency: "CAD", durationMinutes: 491, stops: 0, departAt: "2026-10-13T18:20:00", arriveAt: "2026-10-14T06:31:00" };
    expect(assistantBlockSchema.safeParse({ type: "flights", retrievedAt: "t", origin: "Toronto", destination: "London", dateNote: "Example date", items: [flight] }).success).toBe(true);
    expect(assistantBlockSchema.safeParse({ type: "flights", retrievedAt: "t", origin: "Toronto", destination: "London", items: [] }).success).toBe(false);
    const hotel = { hotelId: "h1", name: "Torel Palace", nightlyPrice: "230", totalPrice: "690", currency: "EUR", rating: 9.4, reviews: 1200, refundable: true, latitude: 38.72, longitude: -9.14 };
    expect(assistantBlockSchema.safeParse({ type: "stays", retrievedAt: "t", location: "Lisbon", checkin: "2026-10-15", checkout: "2026-10-18", nights: 3, dateNote: "Example dates", items: [hotel] }).success).toBe(true);
    const room = { name: "Deluxe", boardName: "Breakfast", refundable: true, maxOccupancy: 2, nightlyAmount: 230, totalAmount: 690, currency: "EUR" };
    expect(assistantBlockSchema.safeParse({ type: "stays", retrievedAt: "t", location: "Lisbon", checkin: "2026-10-15", checkout: "2026-10-18", nights: 3, items: [hotel], rooms: [room] }).success).toBe(true);
    const { hotelId: _omit, ...anonymousHotel } = hotel;
    expect(assistantBlockSchema.safeParse({ type: "stays", retrievedAt: "t", location: "Lisbon", checkin: "2026-10-15", checkout: "2026-10-18", nights: 3, items: [anonymousHotel] }).success).toBe(false);
  });
  it("validates and reads the locked-stay decision", () => {
    const value = { provider: "liteapi", hotelId: "h1", hotelName: "Torel Palace", roomName: "Deluxe", board: "Breakfast", refundable: true, checkin: "2026-10-15", checkout: "2026-10-18", nights: 3, nightlyAmount: 230, totalAmount: 690, currency: "EUR", latitude: 38.72, longitude: -9.14, address: "Rua Câmara Pestana", thumbnail: null };
    expect(stayDecisionSchema.safeParse(value).success).toBe(true);
    expect(stayDecisionSchema.safeParse({ ...value, provider: "booking" }).success).toBe(false);
    expect(readStayDecision([
      { kind: "stay", value: { hotelName: "malformed" } },
      { kind: "budget", value: { daily: 100 } },
      { kind: "stay", value },
    ])).toMatchObject({ hotelName: "Torel Palace", roomName: "Deluxe" });
    expect(readStayDecision([{ kind: "budget", value: {} }])).toBeNull();
  });
  it("reads assistant suggestions, newest per key, ignoring non-suggestion rows", () => {
    const rows = [
      { id: "a", kind: "suggestion", value: { key: "dates", display: "mid-October", rationale: "you mentioned fall" }, created_at: "2026-09-01T00:00:00Z" },
      { id: "b", kind: "suggestion", value: { key: "dates", display: "Oct 17–21", rationale: "you said the 17th" }, created_at: "2026-09-02T00:00:00Z" },
      { id: "c", kind: "suggestion", value: { key: "occasion", display: "Anniversary", rationale: "" }, created_at: "2026-09-02T00:00:00Z" },
      { id: "d", kind: "budget", value: { daily: 100 } },
      { id: "e", kind: "suggestion", value: { key: "not-a-key" } },
    ];
    const out = readSuggestions(rows);
    expect(out).toHaveLength(2);
    expect(out.find((s) => s.key === "dates")).toMatchObject({ display: "Oct 17–21", id: "b" });
    expect(suggestionActionSchema.safeParse({ key: "dates", action: "confirm" }).success).toBe(true);
    expect(suggestionActionSchema.safeParse({ key: "dates", action: "maybe" }).success).toBe(false);
  });
  it("parses the three place placements and reads the scheduled day", () => {
    expect(placementSchema.parse("none")).toBe("none");
    expect(placementSchema.parse("shortlist")).toBe("shortlist");
    expect(placementSchema.parse({ dayIndex: 3 })).toEqual({ dayIndex: 3 });
    expect(placementSchema.safeParse({ dayIndex: 0 }).success).toBe(false);
    expect(placementSchema.safeParse("someday").success).toBe(false);
    expect(placementDay({ dayIndex: 3 })).toBe(3);
    expect(placementDay("shortlist")).toBeNull();
    const req = placementRequestSchema.safeParse({
      place: { provider: "google-places", providerId: "p1", name: "Belém Tower", category: null, latitude: 1, longitude: 2, address: null, sourceUrl: null },
      placement: { dayIndex: 2 },
    });
    expect(req.success).toBe(true);
  });
  it("derives an inclusive day count from a trip date pair", () => {
    expect(tripDurationDays("2026-03-14", "2026-03-20")).toBe(7);
    expect(tripDurationDays("2026-03-14", "2026-03-14")).toBe(1);
    expect(tripDurationDays("2026-03-20", "2026-03-14")).toBeNull();
    expect(tripDurationDays(null, "2026-03-20")).toBeNull();
  });
  it("accepts a trip with a date pair and rejects an inverted one", () => {
    expect(createTripInput.safeParse({ name: "T", destination: "Lisbon", startDate: "2026-03-14", endDate: "2026-03-20" }).success).toBe(true);
    expect(createTripInput.safeParse({ name: "T", destination: "Lisbon", startDate: "2026-03-20", endDate: "2026-03-14" }).success).toBe(false);
    expect(createTripInput.safeParse({ name: "T", destination: "Lisbon", startDate: "March 14" }).success).toBe(false);
  });
  it("parses a free-text trip description into form fields, dropping bad values", () => {
    const clean = parsedTripSchema.parse({ destination: "Lisbon", durationDays: 5, travelerCount: 2, budget: "mid-range", extra: "ignored" });
    expect(clean).toMatchObject({ destination: "Lisbon", durationDays: 5, travelerCount: 2, budget: "mid-range" });
    expect(clean).not.toHaveProperty("extra");
    // out-of-range / unusable numbers are dropped, not fatal
    expect(parsedTripSchema.parse({ destination: "Rome", durationDays: 9000 }).durationDays).toBeUndefined();
    expect(parsedTripSchema.parse({ travelerCount: "lots" }).travelerCount).toBeUndefined();
    // total garbage collapses to an empty object
    expect(parsedTripSchema.parse("nonsense")).toEqual({});
  });
  it("parses an assistant turn envelope with defaults", () => {
    expect(assistantTurnSchema.parse({ reply: "hi" })).toMatchObject({ language: "en", blocks: [], sources: [], suggestedFollowups: [] });
  });
  it("removes assistant links that are not in provider evidence", () => {
    const allowed = new Set(["https://official.example/place"]);
    const sanitized = sanitizeAssistantContent("[Official](https://official.example/place) [Invented](https://invented.example/place)", allowed);
    expect(sanitized).toContain("https://official.example/place");
    expect(sanitized).not.toContain("invented.example");
  });
});
