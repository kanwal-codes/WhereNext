import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ROAM_ICONS, RoamIcon, type RoamIconName } from "../../features/roam/ui/RoamIcon";
import { RoamMark } from "../../features/roam/ui/RoamMark";
import { Widget } from "../../features/conversation/ui/blocks/Widget";

vi.mock("@/components/CompareView", () => ({ CompareView: () => <div /> }));
import { MessageBlocks } from "../../features/conversation/ui/blocks/MessageBlocks";

describe("Roam line icons", () => {
  it("are each one continuous stroke on a 64 grid, ending in a dot that sits on the grid", () => {
    for (const [name, icon] of Object.entries(ROAM_ICONS)) {
      expect(icon.d.startsWith("M"), name).toBe(true);
      expect(icon.d.match(/M/g)?.length, `${name} must be a single stroke`).toBe(1);
      expect(icon.dot[0]).toBeGreaterThanOrEqual(0);
      expect(icon.dot[0]).toBeLessThanOrEqual(64);
      expect(icon.dot[1]).toBeGreaterThanOrEqual(0);
      expect(icon.dot[1]).toBeLessThanOrEqual(64);
    }
  });
  it("render their line and their dot, and are hidden from assistive tech unless labelled", () => {
    const html = renderToStaticMarkup(<RoamIcon name="flights" />);
    expect(html).toContain('data-roam-icon="flights"');
    expect(html).toContain(ROAM_ICONS.flights.d);
    expect(html).toContain("<circle");
    expect(html).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<RoamIcon name="star" label="Quick answer" />)).toContain('aria-label="Quick answer"');
  });
  it("is the chip icon of a widget that names a glyph", () => {
    const html = renderToStaticMarkup(<Widget glyph={"budget" satisfies RoamIconName} eyebrow="Daily spend" title="Fits your budget" />);
    expect(html).toContain('data-roam-icon="budget"');
  });
});

describe("Roam's handoff", () => {
  it("is a state of the mark: its planned route erases while the widget icon draws in", () => {
    const html = renderToStaticMarkup(<RoamMark state="handoff" size={32} />);
    expect(html).toContain('data-roam-state="handoff"');
    expect(html).toContain("<path");
  });
  it("draws nothing at rest (reduced motion): the icon is already there", () => {
    const html = renderToStaticMarkup(<RoamMark state="handoff" size={32} animated={false} />);
    expect(html).toContain('data-roam-state="handoff"');
    expect(html).not.toContain("<path");
  });
});

describe("the handoff in a reply", () => {
  const widgets = [
    { type: "budget", currency: "GBP", perPerson: true, summary: "x", lines: [{ category: "Food", low: 30, typical: 55, high: 90 }, { category: "Transit", low: 8, typical: 12, high: 20 }], dailyTotal: { low: 38, typical: 67, high: 110 } },
    { type: "checklist", groups: [{ title: "Packing", items: [{ text: "Rain shell" }] }] },
  ] as never;
  const render = (live: boolean) => renderToStaticMarkup(<MessageBlocks blocks={widgets} tripId="t" onFollowup={() => undefined} live={live} />);
  it("plays on the first widget of a live reply only", () => {
    expect(render(true).match(/data-roam-state="handoff"/g)?.length).toBe(1);
  });
  it("never plays for restored history, but the icons are still there, already drawn", () => {
    const html = render(false);
    expect(html).not.toContain('data-roam-state="handoff"');
    expect(html).toContain('data-roam-icon="budget"');
    expect(html).toContain('data-roam-icon="checklist"');
  });
});
