// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CineRating } from "../../features/conversation/ui/blocks/CineCard";

afterEach(cleanup);

describe("CineRating", () => {
  it("shows only the score when it is given no count (place cards)", () => {
    const { container } = render(<CineRating rating={4.13} />);
    expect(container.textContent?.trim()).toBe("4.1");
  });
  it("still shows a count and an out-of when a card asks for them (hotels)", () => {
    const { container } = render(<CineRating rating={8.6} outOf="/10" count="1.2k" />);
    expect(container.textContent).toContain("8.6");
    expect(container.textContent).toContain("/10");
    expect(container.textContent).toContain("1.2k");
  });
});
