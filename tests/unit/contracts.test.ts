import { describe, expect, it } from "vitest";
import { formatTripMemory } from "../../lib/application/trip-context";
import { assistantBlockSchema, assistantTurnSchema, placeCardSchema, proposedCommandSchema } from "../../packages/contracts/assistant";
import { mergePreferences, preferencesSchema } from "../../packages/contracts/preferences";
import { canChangeLockedItem } from "../../features/itinerary/domain/item";
import { aiRequestSchema, compactAiMessages } from "../../packages/contracts/ai-request";
import { userMessageInput } from "../../features/conversation/domain/message";
import { scopedMessageIdempotencyKey } from "../../features/conversation/infrastructure/conversationRepository";
import { sanitizeAssistantContent } from "../../lib/application/sanitize-assistant";

describe("rebuild contracts", () => {
  it("formats durable trip memory with profile, likes, dislikes and locked items", () => {
    const result = formatTripMemory({
      preferences: { groupType: "friends", budget: 120, dislikes: ["bungee jumping"], interests: ["nightlife"] },
      itinerary: [{ title: "Confirmed first-day placeholder", day_index: 0, locked: true }],
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
    const hotel = { name: "Torel Palace", nightlyPrice: "230", totalPrice: "690", currency: "EUR", rating: 9.4, reviews: 1200, refundable: true, mapUrl: "https://maps.google.com/?q=torel" };
    expect(assistantBlockSchema.safeParse({ type: "stays", retrievedAt: "t", location: "Lisbon", checkin: "2026-10-15", checkout: "2026-10-18", nights: 3, dateNote: "Example dates", items: [hotel] }).success).toBe(true);
    expect(assistantBlockSchema.safeParse({ type: "stays", retrievedAt: "t", location: "Lisbon", checkin: "2026-10-15", checkout: "2026-10-18", nights: 3, items: [hotel], rooms: [{ name: "Deluxe", nightlyPrice: "230", totalPrice: "690", currency: "EUR" }] }).success).toBe(true);
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
