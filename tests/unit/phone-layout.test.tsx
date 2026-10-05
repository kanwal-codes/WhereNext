import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/use-document-title", () => ({ useDocumentTitle: () => null }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/components/motion-primitives", () => ({ Reveal: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import { PageHeader } from "@/components/PageHeader";
import { EntityCard } from "@/features/conversation/ui/blocks/ui";

describe("page header on a phone", () => {
  const rail = (html: string) => /<div class="([^"]*min-h-10[^"]*)"/.exec(html)?.[1] ?? "";

  it("drops its empty top row when there is no way back and no switch, so the title sits under the top bar", () => {
    const html = renderToStaticMarkup(<PageHeader eyebrow="Itinerary" title="The plan" />);
    expect(rail(html)).toContain("max-sm:hidden");
    expect(html).toContain("max-sm:mt-0");
  });

  it("keeps the row for a switch or a way back", () => {
    expect(rail(renderToStaticMarkup(<PageHeader eyebrow="Discover" title="T" switcher={<span>pill</span>} />))).not.toContain("max-sm:hidden");
    expect(rail(renderToStaticMarkup(<PageHeader eyebrow="Group" title="T" back={{ href: "/x", label: "Back" }} />))).not.toContain("max-sm:hidden");
  });
});

describe("EntityCard as a phone row", () => {
  const card = (phoneRow: boolean | "actions") => renderToStaticMarkup(<EntityCard label="Open" title="Hotel" media={<i />} actions={<button>Go</button>} phoneRow={phoneRow} />);

  it("lays out horizontally and hides the buttons when the whole card opens", () => {
    const html = card(true);
    expect(html).toContain("max-sm:flex-row");
    expect(html).toMatch(/entity-actions[^"]*max-sm:hidden/);
  });

  it("can keep the actions under the details", () => {
    const html = card("actions");
    expect(html).toContain("max-sm:flex-row");
    expect(html).not.toMatch(/entity-actions[^"]*max-sm:hidden/);
  });

  it("is an ordinary card when not a row", () => {
    expect(card(false)).not.toContain("max-sm:flex-row");
  });
});
