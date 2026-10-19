"use client";

// TEMPORARY (phone redesign): opens a detail sheet from fixtures. `?open=weather|checklist|flight|day|budget|route|area&theme=dark`.
import React, { useEffect } from "react";
import { TripDataProvider } from "@/components/TripDataProvider";
import { TripPanel } from "@/components/TripPanel";
import { TripPanelProvider, useTripPanel, type PanelState } from "@/components/TripPanelProvider";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { scenes } from "../fixtures";

const TRIP = "00000000-0000-0000-0000-000000000000";
const block = <T extends AssistantBlock["type"]>(type: T, nth = 0) => scenes.flatMap((s) => s.blocks ?? []).filter((b) => b.type === type)[nth] as Extract<AssistantBlock, { type: T }>;

function panelFor(name: string): PanelState | null {
  switch (name) {
    case "weather": return { kind: "weather", block: block("weather", 1) };
    case "weather-seasonal": return { kind: "weather", block: block("weather", 0) };
    case "checklist": return { kind: "checklist", block: block("checklist") };
    case "budget": return { kind: "budget", block: block("budget") };
    case "day": return { kind: "day", block: block("itinerary"), dayIndex: 0 };
    case "flight": { const f = block("flights"); return { kind: "flight", flight: f.items[0], route: { origin: f.origin, destination: f.destination, dateNote: f.dateNote, retrievedAt: f.retrievedAt } }; }
    case "route": return { kind: "route", routes: [block("route_summary", 0)], active: 0 };
    default: return null;
  }
}

function Opener({ name }: { name: string }) {
  const { openPanel } = useTripPanel();
  useEffect(() => {
    const p = panelFor(name);
    if (p) openPanel(p);
  }, [name, openPanel]);
  return <p className="p-4 font-mono text-xs text-muted-foreground">sheet: {name}</p>;
}

export function PanelsClient({ open, theme }: { open: string; theme: "light" | "dark" }) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    return () => document.documentElement.classList.remove("dark");
  }, [theme]);
  return (
    <TripDataProvider tripId={TRIP} data={null}>
      <TripPanelProvider tripId={TRIP}>
        <div className="icons-fine min-h-screen bg-background text-foreground">
          <Opener name={open} />
        </div>
        <TripPanel layout="drawer" />
      </TripPanelProvider>
    </TripDataProvider>
  );
}
