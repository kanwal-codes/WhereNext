"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/EmptyState";

/** Keeps a crash inside one trip section (itinerary, stays, discover, ...) from taking
 *  down the trip shell around it — TripShell's sidebar/nav lives in the layout above this. */
export default function AnimatedSectionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl px-5 py-10 sm:px-8">
      <EmptyState action={<button onClick={reset} className="btn-primary-sm">Try again</button>}>
        This section hit an unexpected error.
      </EmptyState>
    </div>
  );
}
