"use client";

import type { AssistantBlock, PlaceCard, StayCardItem } from "@/packages/contracts/assistant";
import type { EventSeed } from "@/components/TripPanelProvider";
import type { CardPanel } from "@/components/TripPanelProvider";

export type BlockHandlers = {
  /** The trip these blocks belong to — card actions write against it. */
  tripId: string;
  onFollowup: (prompt: string) => void;
  /** When set, the card head opens this place in the chat side-panel. */
  onOpenPlace?: (place: PlaceCard) => void;
  /** When set, a stay card opens the hotel (rooms + details) in the chat side-panel. */
  onOpenStay?: (stay: StayCardItem, dates: { checkin: string; checkout: string; adults?: number }) => void;
  /** When set, an event card/row opens the full event view in the chat side-panel. */
  onOpenEvent?: (seed: EventSeed) => void;
  /** Opens the complete result set in the shared side panel. */
  onOpenCollection?: (title: string, block: AssistantBlock) => void;
  /** When set, a flight, a day of a plan, or a budget opens in the chat side-panel, with the data the card already has. */
  onOpenPanel?: (panel: CardPanel) => void;
};

export const MAX_CHAT_CARDS = 4;

export const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
