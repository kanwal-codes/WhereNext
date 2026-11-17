"use client";

import Link, { useLinkStatus } from "next/link";
import { ArrowLeft, BedDouble, CalendarDays, CalendarRange, Eraser, LayoutGrid, Loader2, Map as MapIcon, MapPin, Route as RouteIcon, Maximize2, Plane, Scale, Wallet, X, CloudSun, ListChecks } from "lucide-react";
import { panelTitle, type PanelState } from "@/components/TripPanelProvider";
import { fullPageHref } from "@/components/tripPanelLogic";
import { cn } from "@/lib/utils";
import { controlGhost } from "@/features/conversation/ui/blocks/ui";

const KIND_ICON = { area: MapPin, place: MapPin, stay: BedDouble, event: CalendarDays, collection: LayoutGrid, flight: Plane, day: CalendarRange, budget: Wallet, map: MapIcon, route: RouteIcon, compare: Scale, weather: CloudSun, checklist: ListChecks } as const;

/** Icon inside the expand Link: becomes a spinner the moment it is pressed, until the full page arrives. */
function ExpandIcon() {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />;
}

export function TripPanelHeader({ shown, layout, tripId, compareIds, canGoBack, goBack, hasChat, clearChat, closePanel }: {
  shown: PanelState;
  layout: "drawer" | "inline";
  tripId: string;
  compareIds: string[];
  canGoBack: boolean;
  goBack: () => void;
  hasChat: boolean;
  clearChat: () => void;
  closePanel: (() => void) | undefined;
}) {
  const KindIcon = KIND_ICON[shown.kind];
  return (
    <header className={cn("flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5", // On a phone: three equal-weight cells, so the title sits in the middle of the sheet whatever is at either edge (back on the left, close on the right).
        "icons-fine max-lg:grid max-lg:grid-cols-[minmax(2.5rem,1fr)_minmax(0,auto)_minmax(2.5rem,1fr)] max-lg:border-b-0 max-lg:px-4 max-lg:pt-1.5 max-lg:pb-2")}>
      {layout === "inline" && <div aria-hidden className="hidden basis-full justify-center py-1 max-lg:col-span-3 max-lg:flex"><i className="block h-1 w-9 rounded-full bg-input" /></div>}
      <div className="flex min-w-0 items-center gap-1.5 max-lg:contents">
        {canGoBack ? (
          <button type="button" onClick={goBack} aria-label="Back to previous item" className={cn(controlGhost, "max-lg:justify-self-start")}>
            <ArrowLeft className="size-4" aria-hidden />
          </button>
        ) : (
          <span aria-hidden className="hidden max-lg:block" />
        )}
        {/* The kind of thing it is (a grid for a list, a pin for a place) helps beside the title on a wide screen; centred on a phone it is only clutter. */}
        {KindIcon && <KindIcon className="size-4 shrink-0 text-muted-foreground max-lg:hidden" aria-hidden />}
        <span className={cn("min-w-0 truncate font-display text-base font-semibold tracking-[-0.01em]", "max-lg:text-center max-lg:text-xl max-lg:tracking-[-0.025em]")}>{panelTitle(shown)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 max-lg:justify-self-end">
        {hasChat && (
          <button type="button" onClick={clearChat} aria-label="Clear this chat" title="Clear this chat" className={controlGhost}>
            <Eraser className="size-4" aria-hidden />
          </button>
        )}
        <Link
          href={fullPageHref(shown, tripId, compareIds)}
          // Do NOT close the panel here: closing pops the panel's browser-history entry with history.back(),
          // which raced the link's own navigation and cancelled it ("expand does nothing"). The provider closes
          // the panel by itself when the route changes; only a link to the page we are already on needs this.
          onClick={(event) => {
            const here = window.location.pathname;
            if (new URL(event.currentTarget.href).pathname === here) closePanel?.();
          }}
          aria-label="Open as full page"
          title="Open as full page"
          className={cn(controlGhost, "max-lg:hidden")}
        >
          <ExpandIcon />
        </Link>
        <button type="button" onClick={closePanel} aria-label="Close panel" title="Close (Esc)" className={cn(controlGhost, "max-lg:size-10 max-lg:bg-muted")}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </header>
  );
}
