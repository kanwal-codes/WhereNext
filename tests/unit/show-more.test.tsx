import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShowMoreButton } from "@/components/ShowMoreButton";

describe("ShowMoreButton", () => {
  it("offers the next batch and says where the reader is in the list", () => {
    const html = renderToStaticMarkup(<ShowMoreButton next={6} visible={15} total={21} onClick={() => undefined} />).replace(/<!-- -->/g, "");
    expect(html).toMatch(/>More </);
    expect(html).not.toMatch(/Show \d+ more/); // no count on the button: the rule, not the label, says how many
    expect(html).toContain("Showing 15 of 21 stays"); // for screen readers only
    expect(html).toContain("sr-only");
  });

  it("stays when the provider has another page even with no rows in hand", () => {
    expect(renderToStaticMarkup(<ShowMoreButton force next={0} visible={21} total={21} onClick={() => undefined} />)).toMatch(/>More </);
  });

  it("disappears when everything is showing", () => {
    expect(renderToStaticMarkup(<ShowMoreButton next={0} visible={21} total={21} onClick={() => undefined} />)).toBe("");
  });
});
