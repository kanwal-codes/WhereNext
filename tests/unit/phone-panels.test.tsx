import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AssistantBlock } from "../../packages/contracts/assistant";
import { panelSubjectKey, panelTitle } from "../../components/TripPanelProvider";

import { WeatherDetail } from "../../features/conversation/ui/panels/WeatherDetail";
import { ChecklistDetail } from "../../features/conversation/ui/panels/ChecklistDetail";

type Weather = Extract<AssistantBlock, { type: "weather" }>;
type Checklist = Extract<AssistantBlock, { type: "checklist" }>;
const forecast = { type: "weather", retrievedAt: "t", location: "Rome", mode: "forecast", headline: "Warm, one wet day", packing: ["Sun hat", "Umbrella"], days: [
  { label: "Sun", min: 18, max: 29, condition: "clear", wet: false }, { label: "Wed", min: 17, max: 24, condition: "rain", wet: true }, { label: "Thu", min: -2, max: 26, condition: "clouds", wet: false },
] } as unknown as Weather;
const seasonal = { type: "weather", retrievedAt: "t", mode: "seasonal", month: "June", headline: "Hot and dry", highC: 30, lowC: 19, rainyDays: 4, packing: [], days: [] } as unknown as Weather;

describe("weather sheet", () => {
  it("lays a forecast out day by day, with a wet-day count and the packing list", () => {
    const html = renderToStaticMarkup(<WeatherDetail block={forecast} />);
    expect(html).toContain("Day by day");
    expect(html).toContain("1 wet day");
    expect(html).toContain("−2°");
    expect(html).toContain("Umbrella");
  });
  it("shows a typical month without a day list", () => {
    const html = renderToStaticMarkup(<WeatherDetail block={seasonal} />);
    expect(html).not.toContain("Day by day");
    expect(html).toContain("About 4 rainy days");
    expect(html).toContain("30°");
  });
  it("is titled and keyed for the panel", () => {
    expect(panelTitle({ kind: "weather", block: forecast })).toBe("Weather · Rome");
    expect(panelSubjectKey({ kind: "weather", block: forecast })).toContain("weather:Rome");
  });
});

describe("checklist sheet", () => {
  const list = { type: "checklist", groups: [{ title: "Packing", items: [{ text: "Rain shell", why: "showers" }, { text: "Adapter" }] }, { title: "Empty", items: [] }] } as unknown as Checklist;
  it("lists every group that has items, with the count and the reason", () => {
    const html = renderToStaticMarkup(<ChecklistDetail block={list} tripId="t1" />);
    expect(html).toContain("Packing");
    expect(html).not.toContain(">Empty<");
    expect(html).toContain("showers");
    expect(html).toContain("2 left");
  });
  it("is titled for the panel", () => {
    expect(panelTitle({ kind: "checklist", block: list })).toBe("Checklist");
  });
});
