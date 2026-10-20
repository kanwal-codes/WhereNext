import { describe, expect, it } from "vitest";
import { layoutModeOf, shellColumns } from "../../features/roam/domain/shell-layout";

describe("shellColumns", () => {
  it("is one column on a narrow screen", () => {
    expect(shellColumns({ desktop: false, hasPanel: true, showContext: true })).toBe("minmax(0, 1fr) 0px");
  });
  it("gives the context 340px, its slim rail 48px", () => {
    expect(shellColumns({ desktop: true, hasPanel: false, showContext: true })).toBe("calc(100% - 340px) 340px");
    expect(shellColumns({ desktop: true, hasPanel: false, showContext: false })).toBe("calc(100% - 48px) 48px");
  });
  it("gives a detail panel what the screen leaves beside a 512px chat and the trip sidebar, up to 720px", () => {
    const track = "min(720px, max(0px, calc(100vw - 776px)))";
    expect(shellColumns({ desktop: true, hasPanel: true, showContext: false })).toBe(`calc(100% - ${track}) ${track}`);
    expect(shellColumns({ desktop: true, hasPanel: true, showContext: true })).toBe(`calc(100% - ${track}) ${track}`);
  });
});

describe("layoutModeOf", () => {
  it("names what the side pane shows, a panel first", () => {
    expect(layoutModeOf({ hasPanel: true, showContext: true })).toBe("panel");
    expect(layoutModeOf({ hasPanel: false, showContext: true })).toBe("context");
    expect(layoutModeOf({ hasPanel: false, showContext: false })).toBe("rail");
  });
});
