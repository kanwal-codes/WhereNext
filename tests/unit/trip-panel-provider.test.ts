import { describe, expect, it } from "vitest";
import { panelSubjectKey, type PanelState } from "../../components/TripPanelProvider";

describe("panelSubjectKey", () => {
  it("gives the same hotel different dates a different identity", () => {
    const may: PanelState = { kind: "stay", hotelId: "h1", name: "Hotel A", checkin: "2026-05-01", checkout: "2026-05-04" };
    const june: PanelState = { kind: "stay", hotelId: "h1", name: "Hotel A", checkin: "2026-06-01", checkout: "2026-06-04" };
    expect(panelSubjectKey(may)).not.toBe(panelSubjectKey(june));
  });

  it("gives the same hotel and dates the same identity", () => {
    const a: PanelState = { kind: "stay", hotelId: "h1", name: "Hotel A", checkin: "2026-05-01", checkout: "2026-05-04" };
    const b: PanelState = { kind: "stay", hotelId: "h1", name: "Hotel A", checkin: "2026-05-01", checkout: "2026-05-04" };
    expect(panelSubjectKey(a)).toBe(panelSubjectKey(b));
  });
});
