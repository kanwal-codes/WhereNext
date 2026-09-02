"use client";

import { useEffect, useState } from "react";
import { ConversationSurface } from "@/features/conversation/ui/ConversationSurface";
import { ItinerarySurface } from "@/features/itinerary/ui/ItinerarySurface";
import { DiscoverySurface } from "@/features/places/ui/DiscoverySurface";
import { MapSurface } from "@/features/maps/ui/MapSurface";
import { TransportSurface } from "@/features/transport/ui/TransportSurface";
import { StaySurface } from "@/features/stays/ui/StaySurface";
import { BudgetSurface } from "@/features/budget/ui/BudgetSurface";
import { EssentialsSurface } from "@/features/essentials/ui/EssentialsSurface";
import type { Trip } from "@/features/trip/domain/trip";
import { TripContextSurface } from "@/features/workspace/ui/TripContextSurface";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import type { TripWorkspaceData } from "@/features/workspace/application/loadTripWorkspace";

type Surface = "conversation" | "discovery" | "itinerary" | "map" | "transport" | "stay" | "budget" | "essentials" | "context";
const surfaces: Array<{ id: Surface; label: string }> = [
  { id: "conversation", label: "Conversation" }, { id: "discovery", label: "Discover" }, { id: "itinerary", label: "Itinerary" },
  { id: "map", label: "Map" }, { id: "transport", label: "Transport" }, { id: "stay", label: "Stay" }, { id: "budget", label: "Budget" }, { id: "essentials", label: "Essentials" }, { id: "context", label: "Trip context" },
];

export function TripWorkspace({ tripId, trip }: { tripId: string; trip: Trip | null }) {
  const [active, setActive] = useState<Surface>("conversation"); const [refreshVersion, setRefreshVersion] = useState(0); const [snapshot, setSnapshot] = useState<TripWorkspaceData | null>(null);
  function selectSurface(surface: string) { const mapped: Record<string, Surface> = { chat: "conversation", destinations: "discovery", explore: "discovery", transport: "transport", stay: "stay", map: "map", days: "itinerary", budget: "budget", essentials: "essentials" }; setActive(mapped[surface] ?? "conversation"); }
  useEffect(() => subscribeWorkspaceChanges(() => setRefreshVersion((version) => version + 1)), []);
  useEffect(() => { if (tripId === "rebuild-preview") return; const controller = new AbortController(); void fetch(`/api/trips/${tripId}/workspace`, { signal: controller.signal }).then((response) => response.ok ? response.json() as Promise<TripWorkspaceData> : null).then((data) => { if (data && !controller.signal.aborted) setSnapshot(data); }).catch(() => undefined); return () => controller.abort(); }, [tripId, refreshVersion]);
  const destination = trip?.destination ?? "your destination";
  return <>
    <nav aria-label="Trip workspace surfaces" className="card">
      {surfaces.map((surface) => <button key={surface.id} type="button" aria-pressed={active === surface.id} onClick={() => setActive(surface.id)}>{surface.label}</button>)}
    </nav>
    {active === "conversation" && <ConversationSurface key={`conversation-${refreshVersion}`} tripId={tripId} initialMessages={snapshot?.conversation} onSurfaceSelect={selectSurface} />}
    {active === "discovery" && <DiscoverySurface key={`discovery-${refreshVersion}`} tripId={tripId} initialSaved={snapshot?.savedPlaces} />}
    {active === "itinerary" && <ItinerarySurface key={`itinerary-${refreshVersion}`} tripId={tripId} initialItems={snapshot?.itinerary} />}
    {active === "map" && <MapSurface tripId={tripId} />}
    {active === "transport" && <TransportSurface tripId={tripId} origin={trip?.origin} destination={destination} />}
    {active === "stay" && <StaySurface tripId={tripId} destination={destination} />}
    {active === "budget" && <BudgetSurface tripId={tripId} durationDays={trip?.duration_days} travelers={trip?.travelers} />}
    {active === "essentials" && <EssentialsSurface key={`essentials-${refreshVersion}`} tripId={tripId} initialCompleted={snapshot?.essentials} />}
    {active === "context" && <TripContextSurface key={`context-${refreshVersion}`} tripId={tripId} trip={trip} initialMemory={snapshot?.preferences} initialDecisions={snapshot?.decisions} />}
  </>;
}
