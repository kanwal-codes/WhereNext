"use client";

import { useRef, type ReactNode } from "react";
import { TripPanelComposer } from "@/components/TripPanelComposer";
import { useBoxHeight } from "@/components/useBoxHeight";
import { useCompareChat } from "@/components/useCompareChat";
import type { ListingItem } from "@/lib/application/listing-chat";
import type { PanelState } from "@/components/TripPanelProvider";
import { cn } from "@/lib/utils";

/**
 * The ask box for one listing open on the home page's Eat, Stays or Flights (no trip): the same floating box a trip's listing panel has, with the
 * listing's own facts behind it. It holds the scrolling body too, so the body gets bottom padding as tall as the box and its answers, and the last
 * of the listing can always be scrolled clear. Mount it only while a listing is open and key it by the listing: the chat starts empty for each.
 */
export function ListingAsk({ panel, items, subjectKey, placeholder = "Ask about this — is it worth it?", className, children }: {
  panel: PanelState;
  /** What the listing says about itself, when there is more than its name (the place's own details are fetched). */
  items?: () => ListingItem[];
  subjectKey: string;
  placeholder?: string;
  /** The scrolling body's own classes. */
  className?: string;
  children: ReactNode;
}) {
  const chat = useCompareChat({ panel, shown: panel, compareList: [], tripId: null, subjectKey, items });
  const scrollRef = useRef<HTMLDivElement>(null);
  const { height, ref } = useBoxHeight();
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} style={{ paddingBottom: height }} className={cn("scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain", className)}>{children}</div>
      <TripPanelComposer boxRef={ref} chat={chat} isCompare={false} scrollRef={scrollRef} placeholder={placeholder} fade />
    </div>
  );
}
