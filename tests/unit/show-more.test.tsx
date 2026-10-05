import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShowMoreButton } from "@/components/ShowMoreButton";

describe("ShowMoreButton", () => {
  it("offers the next batch and says where the reader is in the list", () => {
    const html = renderToStaticMarkup(<ShowMoreButton next={6} visible={15} total={21} onClick={() => undefined} />).replace(/<!-- -->/g, "");
    expect(html).toContain("Show 6 more");
    expect(html).toContain("Showing 15 of 21 stays");
  });

  it("disappears when everything is showing", () => {
    expect(renderToStaticMarkup(<ShowMoreButton next={0} visible={21} total={21} onClick={() => undefined} />)).toBe("");
  });
});
