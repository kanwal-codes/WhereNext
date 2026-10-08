import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RouteMap } from "@/features/conversation/ui/blocks/RouteMap";

describe("RouteMap", () => {
  it("renders its fallback while the map loads, even for a very long line", () => {
    const points = Array.from({ length: 950 }, (_, i): [number, number] => [-79 + i * 0.003, 43.6 + i * 0.0009]);
    const html = renderToStaticMarkup(
      <RouteMap request={{ lines: [{ points, color: "#000000", width: 5 }], pins: [], size: { width: 600, height: 300 } }} fallback={<span>sketch</span>} label="map" />,
    );
    expect(html).toContain("sketch");
  });
});
