import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The shared heading is written for the app's automatic JSX runtime; this suite uses the classic one.
vi.mock("@/components/DetailSectionHeading", () => ({ DetailSectionHeading: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2> }));

import { WhereToBook } from "../../features/stays/ui/GoogleStayParts";

const src = (over: Record<string, unknown>) => ({ source: "Site", logo: null, link: "https://x.test/", nightly: 100, total: 300, nightlyBeforeTaxes: null, totalBeforeTaxes: null, freeCancellation: false, cancelUntil: null, official: false, ...over });
const details = (sources: unknown[], more: Record<string, unknown> = {}) => ({
  sources, checkin: "2026-11-15", checkout: "2026-11-18", nights: 3, currency: "CAD", assumedDates: false, busy: false, lockedStay: null, priceRead: null, lockSource: () => undefined, ...more,
}) as unknown as Parameters<typeof WhereToBook>[0]["s"];
const render = (s: Parameters<typeof WhereToBook>[0]["s"]) => renderToStaticMarkup(<WhereToBook s={s} hotelId="g:x" />);

describe("WhereToBook", () => {
  it("sets the lowest price large with its booking link, the rest below with how much more each costs", () => {
    const html = render(details([
      src({ source: "Agoda", nightly: 94, total: 282, freeCancellation: true, cancelUntil: "Oct 31" }),
      src({ source: "Hotel Blue", nightly: 102, official: true }),
      src({ source: "dealbase.com", nightly: 108 }),
    ], { priceRead: { level: "low", typicalLow: 117, typicalHigh: 132, currency: "CAD" } }));
    expect(html).toContain("Book on Agoda");
    expect(html).toContain("Lowest price");
    expect(html).toContain("Free cancellation until Oct 31");
    expect(html).toContain("Also available");
    expect(html).toContain("+CA$8"); // Hotel Blue is CA$8 more a night than Agoda
    expect(html).toContain("+CA$14");
    expect(html).toContain("Official site");
    expect(html).toContain("A low price for this hotel");
    expect(html).toContain("Usually CA$117 to CA$132 a night");
  });

  it("with one site, shows it as the best price without a 'lowest' claim or an empty list", () => {
    const html = render(details([src({ source: "Booking.com", nightly: 141, total: 424 })]));
    expect(html).toContain("Book on Booking.com");
    expect(html).not.toContain("Lowest price");
    expect(html).not.toContain("Also available");
  });

  it("folds a long list of other sites behind a toggle that names the first few, and keeps a short one open", () => {
    const many = render(details([1, 2, 3, 4, 5, 6].map((n) => src({ source: `Site${n}`, nightly: 90 + n * 10 }))));
    expect(many).toContain('aria-expanded="false"');
    expect(many).toContain("Site2, Site3, Site4 +2");
    const few = render(details([src({ source: "A", nightly: 90 }), src({ source: "B", nightly: 95 })]));
    expect(few).toContain('aria-expanded="true"');
  });

  it("says plainly when no prices came back", () => {
    expect(render(details([]))).toContain("No prices came back for these dates");
  });
});
