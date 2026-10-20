import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatEmptyState, PollCard, TypingBubble } from "../../features/group-chat/ui/GroupChatParts";

vi.mock("../../features/group-chat/ui/GroupInviteCard", () => ({ GroupInviteCard: () => <div>INVITE</div> }));

const poll = {
  id: "poll-1",
  options: [
    { key: "a", label: "Alfama", count: 3, mine: true },
    { key: "b", label: "Baixa", count: 1, mine: false },
  ],
  totalVotes: 4,
} as never;

describe("group chat parts", () => {
  it("shows each poll option with its share of the votes, and disables them while a vote is in flight", () => {
    const html = (pending: string | null) => renderToStaticMarkup(<PollCard content="Where to stay?" name="Sam" poll={poll} pendingVoteFor={pending} onVote={() => {}} />);
    expect(html(null)).toContain("3 · 75%");
    expect(html(null)).toContain("1 · 25%");
    expect(html(null)).toContain("4 votes");
    expect(html(null)).not.toContain(`disabled=""`);
    expect(html("poll-1")).toContain(`disabled=""`);
  });

  it("offers the invite link on an empty chat only when nobody else has joined", () => {
    const render = (showInvite: boolean) => renderToStaticMarkup(<ChatEmptyState tripId="t" showInvite={showInvite} onStarter={() => {}} />);
    expect(render(true)).toContain("INVITE");
    expect(render(false)).not.toContain("INVITE");
    expect(render(false)).toContain("@Roam what should we do first?");
  });

  it("announces Roam typing to screen readers", () => {
    expect(renderToStaticMarkup(<TypingBubble />)).toContain("Roam is typing");
  });
});
