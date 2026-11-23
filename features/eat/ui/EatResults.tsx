"use client";

import type { ReactNode } from "react";
import { AlertCircle, SearchX, WifiOff } from "lucide-react";
import { SkeletonBand } from "@/components/Skeleton";
import { StateMessage, stateButton } from "@/components/StateMessage";

/**
 * The places on an Eat page, laid out the same wherever the page is (a trip's tab or the home page's): the skeleton while they load, a message when
 * there is nothing to show, or one wide tile and the rest in a grid, with whatever follows (Show more). Each page brings its own tiles and its own
 * empty state, because what a tile does (Save and Add to trip, or Reserve) and what an empty list means differ.
 */
export function EatResults({ busy, skeleton, empty, first, rest, footer }: { busy: boolean; skeleton: boolean; empty?: ReactNode; first?: ReactNode; rest?: ReactNode[]; footer?: ReactNode }) {
  return (
    <div className="relative" aria-busy={busy}>
      {skeleton ? (
        <SkeletonBand count={6} />
      ) : empty ? (
        empty
      ) : (
        <div className="space-y-6">
          {first}
          {rest && rest.length > 0 && <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3">{rest}</div>}
        </div>
      )}
      {footer}
    </div>
  );
}

/** The places could not be loaded: offline, or a problem on our end. */
export function EatFailedState({ onRetry }: { onRetry: () => void }) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <StateMessage icon={offline ? WifiOff : AlertCircle} title={offline ? "You’re offline" : "We couldn’t load places"} actions={<button type="button" onClick={onRetry} className={stateButton.primary}>Try again</button>}>
      {offline ? "Reconnect and the places will load." : "The problem is on our end, not with your search."}
    </StateMessage>
  );
}

/** Places were found and the filters leave none. */
export function EatNoMatchState({ onClear }: { onClear: () => void }) {
  return (
    <StateMessage icon={SearchX} title="No places match" actions={<button type="button" onClick={onClear} className={stateButton.primary}>Clear filters</button>}>
      Loosen a filter to see more places.
    </StateMessage>
  );
}
