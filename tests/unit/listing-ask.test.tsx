// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let guestState = { guest: false };
const openGate = vi.fn();
vi.mock("@/features/identity/ui/GuestProvider", () => ({ useGuest: () => ({ guest: guestState.guest, openGate }) }));
vi.mock("@/features/conversation/ui/AssistantMessage", () => ({ AssistantMessage: ({ content }: { content: string }) => <div data-testid="assistant">{content}</div> }));
vi.mock("@/lib/use-scroll-compact", () => ({ useScrollCompact: () => [false, vi.fn()] }));

import { ListingAsk } from "@/components/ListingAsk";

const fetchMock = vi.fn();
beforeEach(() => {
  guestState = { guest: false };
  openGate.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("**Yes.** Worth it.", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  Element.prototype.scrollTo = vi.fn();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const stay = { kind: "stay" as const, hotelId: "h1", name: "Hotel Avenida" };

describe("the ask box on a listing opened with no trip", () => {
  it("shows the listing and a box to ask about it", () => {
    render(<ListingAsk panel={stay} subjectKey="stay:h1" items={() => [{ name: "Hotel Avenida" }]}><p>LISTING BODY</p></ListingAsk>);
    expect(screen.getByText("LISTING BODY")).toBeTruthy();
    expect(screen.getByLabelText("Ask about this item")).toBeTruthy();
  });
  it("sends the question and the listing's facts to the listing chat, not a trip's, and shows the answer", async () => {
    const user = userEvent.setup();
    render(<ListingAsk panel={stay} subjectKey="stay:h1" items={() => [{ name: "Hotel Avenida", price: "from $140 per night" }]}><p>body</p></ListingAsk>);
    await user.type(screen.getByLabelText("Ask about this item"), "Is it worth it?{enter}");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/listing-chat");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.items).toEqual([{ name: "Hotel Avenida", price: "from $140 per night" }]);
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "Is it worth it?" });
    await waitFor(() => expect(screen.getByTestId("assistant").textContent).toContain("Worth it"));
  });
  it("asks a guest to sign in instead of spending a model call", async () => {
    guestState = { guest: true };
    const user = userEvent.setup();
    render(<ListingAsk panel={stay} subjectKey="stay:h1" items={() => [{ name: "Hotel Avenida" }]}><p>body</p></ListingAsk>);
    await user.type(screen.getByLabelText("Ask about this item"), "Worth it?{enter}");
    expect(openGate).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses the hint it is given instead of the trip's", () => {
    render(<ListingAsk panel={stay} subjectKey="stay:h1" placeholder="Ask about this hotel — is it worth it?"><p>body</p></ListingAsk>);
    expect((screen.getByLabelText("Ask about this item") as HTMLInputElement).placeholder).toBe("Ask about this hotel — is it worth it?");
  });
});
