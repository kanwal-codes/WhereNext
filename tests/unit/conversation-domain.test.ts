import { describe, expect, it } from "vitest";
import { changeKindFor, describeProposal, proposalQuestion } from "../../features/conversation/domain/proposal";
import { replyNotes } from "../../features/conversation/domain/replyNotes";
import { sendFailureToast, unansweredMessage } from "../../features/conversation/domain/sendOutcome";
import type { Message } from "../../features/conversation/domain/message";
import type { ProposedCommand } from "../../packages/contracts/assistant";

const TRIP = "11111111-1111-4111-8111-111111111111";
const cmd = (c: unknown) => c as ProposedCommand;

describe("proposalQuestion", () => {
  const ask = (c: unknown) => proposalQuestion(cmd(c), describeProposal(cmd(c)));

  it("asks about the daily budget when that is the only change", () => {
    expect(ask({ type: "update_preferences", tripId: TRIP, preferences: { budget: 120 } })).toBe("Set the daily budget to 120 per person?");
  });
  it("lists the preferences otherwise, singular or plural", () => {
    expect(ask({ type: "update_preferences", tripId: TRIP, preferences: { pace: "slow" } })).toBe("Save this preference: pace?");
    expect(ask({ type: "update_preferences", tripId: TRIP, preferences: { pace: "slow", budget: 90 } })).toBe("Save these preferences: pace, budget?");
  });
  it("words the other commands by what they do", () => {
    expect(ask({ type: "record_decision", tripId: TRIP, kind: "stay_choice", value: {} })).toBe("Record this stay choice decision?");
    expect(ask({ type: "add_itinerary_item", tripId: TRIP, title: "Louvre", dayIndex: 2 })).toBe("Add “Louvre” to day 2?");
    expect(ask({ type: "save_place", tripId: TRIP, place: { name: "Café Luna" } })).toBe("Save “Café Luna” to the trip?");
    expect(ask({ type: "something_new", tripId: TRIP })).toBe("Apply this proposed trip change?");
  });
});

describe("changeKindFor", () => {
  it("names the part of the workspace to re-read", () => {
    expect(changeKindFor(cmd({ type: "update_preferences" }))).toBe("preferences");
    expect(changeKindFor(cmd({ type: "record_decision" }))).toBe("decision");
    expect(changeKindFor(cmd({ type: "save_place" }))).toBe("places");
    expect(changeKindFor(cmd({ type: "add_itinerary_item" }))).toBe("itinerary");
  });
});

describe("sendFailureToast", () => {
  it("says the message didn't send when it never reached the server", () => {
    expect(sendFailureToast({ userSaved: false, aiError: true, status: 503 })).toBe("Your message didn’t send.");
  });
  it("says it is saved when only the reply failed, and calls out a busy Roam", () => {
    expect(sendFailureToast({ userSaved: true, aiError: true, status: 500 })).toBe("Roam couldn’t reply — your message is saved.");
    expect(sendFailureToast({ userSaved: true, aiError: true, status: 429 })).toBe("Roam is busy right now — your message is saved.");
    expect(sendFailureToast({ userSaved: true, aiError: false, status: 429 })).toBe("Roam couldn’t reply — your message is saved.");
  });
});

describe("unansweredMessage", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  const saved: Message = { id: "srv", role: "user", content: "hi", created_at: "2026-10-10T11:58:00Z", idempotency_key: "user:abc" };
  const state = (over: Partial<Parameters<typeof unansweredMessage>[0]> = {}) => ({ messages: [saved], loaded: true, sending: false, queued: false, now, ...over });

  it("is the traveller's last saved message once it has waited over 45 seconds", () => {
    expect(unansweredMessage(state())).toBe(saved);
  });
  it("is nothing while it is fresh, answered, local, keyless, sending, queued, or not loaded", () => {
    expect(unansweredMessage(state({ now: Date.parse("2026-10-10T11:58:30Z") }))).toBeNull();
    expect(unansweredMessage(state({ messages: [saved, { id: "r", role: "assistant", content: "yo", created_at: "2026-10-10T11:59:00Z" }] }))).toBeNull();
    expect(unansweredMessage(state({ messages: [{ ...saved, id: "local-1" }] }))).toBeNull();
    expect(unansweredMessage(state({ messages: [{ ...saved, idempotency_key: undefined }] }))).toBeNull();
    expect(unansweredMessage(state({ sending: true }))).toBeNull();
    expect(unansweredMessage(state({ queued: true }))).toBeNull();
    expect(unansweredMessage(state({ loaded: false }))).toBeNull();
    expect(unansweredMessage(state({ messages: [] }))).toBeNull();
  });
});

describe("replyNotes", () => {
  it("says nothing while a reply is still streaming, or when there is nothing to note", () => {
    expect(replyNotes({ degraded: true }, true)).toEqual([]);
    expect(replyNotes(undefined, false)).toEqual([]);
  });
  it("lists degraded, unsaved, cut-off and unavailable-source notes with the right tone", () => {
    const notes = replyNotes({ degraded: true, persistFailed: true, truncated: true, unavailableProviders: ["liteapi", "ticketmaster", "eventbrite"] }, false);
    expect(notes.map((n) => n.tone)).toEqual(["neutral", "destructive", "neutral", "neutral"]);
    expect(notes[3].text).toBe("Couldn’t check hotel rates, events just now — this is from your trip so far.");
  });
});
