"use client";

// TEMPORARY (phone redesign): the audit scenes wired like the real chat. Tapping a widget opens the same sheet the app opens
// (TripPanel inside PhoneOverlays), with the phone header above it. `?scene=3`, `?theme=dark`. Used by scripts/phone-widget-renders.mjs.
import React, { useCallback, useEffect, useState } from "react";
import { TripDataProvider } from "@/components/TripDataProvider";
import { TripPanelProvider, useTripPanel } from "@/components/TripPanelProvider";
import { PhoneHeader, PhoneHeaderProvider } from "@/components/shell/PhoneHeader";
import { PhoneOverlays } from "@/features/roam/ui/PhoneOverlays";
import { AssistantMessage } from "@/features/conversation/ui/AssistantMessage";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { FIXTURE_ORIGIN, edgeScenes, scenes } from "../fixtures";

const TRIP = "00000000-0000-0000-0000-000000000000";
const noop = () => undefined;
const localize = (blocks: AssistantBlock[] | undefined, origin: string) => (blocks ? (JSON.parse(JSON.stringify(blocks).replaceAll(FIXTURE_ORIGIN, origin)) as AssistantBlock[]) : undefined);

function Scenes({ theme, scene, edge }: { theme: "light" | "dark"; scene?: string; edge: boolean }) {
  const { panel, openPanel, closePanel } = useTripPanel();
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const handlers = {
    tripId: TRIP, onFollowup: noop,
    onOpenPlace: useCallback((p: { providerId: string; name: string }) => openPanel({ kind: "place", placeId: p.providerId, name: p.name }), [openPanel]),
    onOpenStay: useCallback((s: { hotelId: string; name: string; thumbnailUrl?: string }, d: { checkin: string; checkout: string; adults?: number }, ask: (p: string) => void) => openPanel({ kind: "stay", hotelId: s.hotelId, name: s.name, photo: s.thumbnailUrl, ...d, onAsk: ask }), [openPanel]),
    onOpenEvent: useCallback((seed: Parameters<typeof openPanel>[0] extends infer P ? (P extends { kind: "event"; seed: infer S } ? S : never) : never) => openPanel({ kind: "event", seed }), [openPanel]),
    onOpenCollection: useCallback((title: string, block: AssistantBlock) => openPanel({ kind: "collection", title, block }), [openPanel]),
    onOpenPanel: openPanel,
  };
  if (origin == null) return null;
  const all = edge ? edgeScenes : scenes;
  const shown = scene ? all.filter((s) => s.label.split(" ")[0] === scene) : all;
  return (
    <>
      <div className="icons-fine min-h-screen bg-background text-foreground" data-theme-probe={theme}>
        {/* Fixed and opaque, like the real chat where the log scrolls below the header, never under it. */}
        <div data-live-header className="fixed inset-x-0 top-0 z-30 bg-background">
          <PhoneHeader pathname={`/trips/${TRIP}/chat`} tripId={TRIP} tripName="London in October" onMenu={noop} />
        </div>
        <div className="mx-auto w-full max-w-[430px] space-y-10 px-4 pb-4 pt-[calc(var(--topbar)+1rem)]">
          {shown.map((s) => (
            <section key={s.label} data-scene={s.label.split(" ")[0]} className="space-y-4">
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-lg bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">{s.user}</p>
              </div>
              <AssistantMessage content={s.text} blocks={localize(s.blocks, origin)} handlers={handlers} />
            </section>
          ))}
        </div>
      </div>
      <PhoneOverlays tripId={TRIP} panel={Boolean(panel)} sheetPanel={false} closePanel={closePanel} groupMenuOpen={false} setGroupMenuOpen={noop} mobileContextOpen={false} setMobileContextOpen={noop} contextRail={null} />
    </>
  );
}

export function LiveClient(props: { theme: "light" | "dark"; scene?: string; edge: boolean }) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", props.theme === "dark");
    return () => document.documentElement.classList.remove("dark");
  }, [props.theme]);
  return (
    <TripDataProvider tripId={TRIP} data={null}>
      <TripPanelProvider tripId={TRIP}>
        <PhoneHeaderProvider>
          <Scenes {...props} />
        </PhoneHeaderProvider>
      </TripPanelProvider>
    </TripDataProvider>
  );
}
