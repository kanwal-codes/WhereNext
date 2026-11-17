// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { Compass } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @next/next/no-img-element
vi.mock("@/components/motion-primitives", () => ({ BlurImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt="" /> }));
vi.mock("@/features/conversation/ui/blocks/ui", () => ({
  CardOpenOverlay: ({ label }: { label: string }) => <a aria-label={label} data-testid="open" className="absolute inset-0 z-0" />,
  MediaFallback: ({ className }: { className?: string }) => <div data-testid="fallback" className={className} />,
}));

import { DiscoverTile } from "../../features/places/ui/DiscoverTile";

afterEach(cleanup);

describe("DiscoverTile", () => {
  it("the wide feature photo lets taps through to the open link beneath it", () => {
    const { container } = render(<DiscoverTile feature label="Open Harbour" onOpen={() => {}} src="/p.jpg" icon={Compass} title="Harbour" />);
    // Both the stand-in and the photograph sit above the link in the stack: neither may take the tap.
    expect(container.querySelector("img")!.className).toContain("pointer-events-none");
    expect(container.querySelector('[data-testid="fallback"]')!.className).toContain("pointer-events-none");
  });
});
