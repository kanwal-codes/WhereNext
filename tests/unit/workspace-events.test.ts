import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ECHO_WINDOW_MS, announceWorkspaceChanges, subscribeWorkspaceChanges, type WorkspaceChange } from "../../lib/application/workspace-events";

describe("realtime echo suppression", () => {
  let seen: WorkspaceChange[][];
  let off: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", new EventTarget());
    seen = [];
    off = subscribeWorkspaceChanges((c) => seen.push(c));
  });
  afterEach(() => {
    off();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("drops the realtime echo of a change this tab just announced, but not other types", () => {
    announceWorkspaceChanges(["itinerary"]);
    announceWorkspaceChanges(["itinerary", "places"], "realtime");
    expect(seen).toEqual([["itinerary"], ["places"]]);
  });

  it("lets a realtime change through once the window has passed", () => {
    announceWorkspaceChanges(["decision"]);
    vi.advanceTimersByTime(ECHO_WINDOW_MS + 1);
    announceWorkspaceChanges(["decision"], "realtime");
    expect(seen).toHaveLength(2);
  });

  it("passes a collaborator's change when this tab announced nothing", () => {
    announceWorkspaceChanges(["groupChat"], "realtime");
    expect(seen).toEqual([["groupChat"]]);
  });
});
