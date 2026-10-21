"use client";

import { Loader2 } from "lucide-react";
import { CompareGrid } from "@/components/CompareGrid";
import { useTripPanelMaybe, type CompareEntry, type PanelState } from "@/components/TripPanelProvider";
import type { Anchor } from "@/components/tripPanelLogic";
import type { useCompareChat } from "@/components/useCompareChat";
import { cn } from "@/lib/utils";
import { PlaceDetailView } from "@/features/places/ui/PlaceDetailView";
import { StayDetailView } from "@/features/stays/ui/StayDetailView";
import { EventDetailView } from "@/features/events/ui/EventDetailView";
import { FlightDetail } from "@/features/conversation/ui/panels/FlightDetail";
import { DayDetail } from "@/features/conversation/ui/panels/DayDetail";
import { BudgetDetail } from "@/features/conversation/ui/panels/BudgetDetail";
import { RouteDetail } from "@/features/conversation/ui/panels/RouteDetail";
import { AreaDetail } from "@/features/conversation/ui/panels/AreaDetail";
import { MapDetail } from "@/features/conversation/ui/panels/MapDetail";
import { WeatherDetail } from "@/features/conversation/ui/panels/WeatherDetail";
import { ChecklistDetail } from "@/features/conversation/ui/panels/ChecklistDetail";
import { MessageBlocks } from "@/features/conversation/ui/blocks/MessageBlocks";
import { AssistantMessage } from "@/features/conversation/ui/AssistantMessage";
import { textAction } from "@/features/conversation/ui/blocks/ui";

/** What the panel shows for one subject: a detail view, a "See all" list, or the comparison with Roam's take on it. */
export function TripPanelBody({ shown, tripId, openPanel, compareList, compareRemove, anchor, chat }: {
  shown: PanelState;
  tripId: string;
  openPanel: NonNullable<ReturnType<typeof useTripPanelMaybe>>["openPanel"];
  compareList: CompareEntry[];
  compareRemove: (id: string) => void;
  anchor: Anchor;
  chat: ReturnType<typeof useCompareChat>;
}) {
  switch (shown.kind) {
    case "place":
      return <PlaceDetailView tripId={tripId} placeId={shown.placeId} variant="panel" />;
    case "stay":
      return <StayDetailView tripId={tripId} hotelId={shown.hotelId} checkin={shown.checkin} checkout={shown.checkout} adults={shown.adults} seedName={shown.name} variant="panel" onAsk={shown.onAsk} />;
    case "event":
      return <EventDetailView tripId={tripId} seed={shown.seed} variant="panel" />;
    case "flight":
      return <FlightDetail flight={shown.flight} route={shown.route} />;
    case "day":
      return <DayDetail block={shown.block} dayIndex={shown.dayIndex} tripId={tripId} />;
    case "budget":
      return <BudgetDetail block={shown.block} />;
    case "route":
      return <RouteDetail tripId={tripId} routes={shown.routes} active={shown.active} onAsk={shown.onAsk} />;
    case "area":
      return <AreaDetail tripId={tripId} panel={shown} />;
    case "weather":
      return <WeatherDetail block={shown.block} />;
    case "checklist":
      return <ChecklistDetail block={shown.block} tripId={tripId} />;
    case "map":
      return <MapDetail tripId={tripId} panel={shown} />;
    case "collection":
      return (
        <div className="p-4">
          <MessageBlocks
            blocks={[shown.block]}
            tripId={tripId}
            preview={false}
            onFollowup={() => undefined}
            onOpenPlace={(place) => openPanel({ kind: "place", placeId: place.providerId, name: place.name })}
            onOpenStay={(stay, dates) => openPanel({ kind: "stay", hotelId: stay.hotelId, name: stay.name, ...dates })}
            onOpenEvent={(seed) => openPanel({ kind: "event", seed })}
            onOpenPanel={openPanel}
          />
        </div>
      );
    default: {
      const { verdictMsg, verdictFailed, retryVerdict } = chat;
      return (
        <div className="space-y-4 p-4">
          {verdictMsg && (
            <section aria-label="Roam’s take" className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <h3 className="font-display text-base font-semibold">Roam’s take</h3>
              {verdictMsg.content ? (
                <AssistantMessage content={verdictMsg.content} />
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Comparing your options…</span>
              )}
              {verdictFailed && (
                <button type="button" className={cn(textAction, "underline")} onClick={retryVerdict}>Try again</button>
              )}
            </section>
          )}
          <CompareGrid list={compareList} anchor={anchor} onRemove={compareRemove} />
        </div>
      );
    }
  }
}
