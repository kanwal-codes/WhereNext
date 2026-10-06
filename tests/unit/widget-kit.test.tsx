import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Wallet } from "lucide-react";
import type { AssistantBlock } from "../../packages/contracts/assistant";
import { RowBar, RowValue, Widget, WidgetAction, WidgetRow, WidgetRows } from "../../features/conversation/ui/blocks/Widget";

vi.mock("@/components/CompareView", () => ({ CompareView: () => <div /> }));
import { MessageBlocks } from "../../features/conversation/ui/blocks/MessageBlocks";

const handlers = { tripId: "trip-1", onFollowup: vi.fn() };
const render = (blocks: AssistantBlock[]) => renderToStaticMarkup(<MessageBlocks blocks={blocks} {...handlers} />);

describe("the widget kit", () => {
  it("lays a widget out as header, hero, rows and foot, with the action on the right of the foot", () => {
    const html = renderToStaticMarkup(
      <Widget icon={Wallet} tone="sage" eyebrow="Daily spend" title="Fits your budget" status={<span>Status</span>} hero={<div>HERO</div>} foot="Estimates only" action={<WidgetAction onClick={() => undefined}>Open</WidgetAction>}>
        <WidgetRows>
          <WidgetRow title="Food" detail="casual" mid={<RowBar frac={0.5} />} value={<RowValue sub="£30–£100">£55</RowValue>} />
        </WidgetRows>
      </Widget>,
    );
    const order = ["Daily spend", "Fits your budget", "HERO", "Food", "£55", "Estimates only", "Open"].map((text) => html.indexOf(text));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("draws the route from its own coordinates, and reserves no map space when it has none", () => {
    const route = { type: "route_summary" as const, from: "A", to: "B", mode: "transit", durationSeconds: 1800, distanceMeters: 5000, steps: ["Walk 5 min"], retrievedAt: "t" };
    expect(render([route])).not.toContain("The route from A to B");
    const withPath = { ...route, path: [[-73.58, 45.52], [-73.6, 45.53], [-73.61, 45.54]] as Array<[number, number]> };
    expect(render([withPath])).toContain("The route from A to B");
  });

  it("marks only the cheapest fare on a flights card", () => {
    const offer = (id: string, price: string) => ({ id, airline: "Air", price, currency: "CAD", departAt: "2026-11-15T10:00:00", arriveAt: "2026-11-15T18:00:00", durationMinutes: 480, stops: 0 });
    const html = render([{ type: "flights", retrievedAt: "t", origin: "Toronto", destination: "London", dateNote: "x", items: [offer("a", "900"), offer("b", "800"), offer("c", "1000")] } as unknown as AssistantBlock]);
    // The sort tab also says "Cheapest"; the fare badge is the small pill.
    expect(html.match(/text-\[0\.6875rem\][^>]*><span[^>]*>Cheapest/g)?.length).toBe(1);
  });
});
