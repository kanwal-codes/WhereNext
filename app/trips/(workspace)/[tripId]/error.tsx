"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/EmptyState";

/**
 * Catches anything the finer-grained `(animated)/error.tsx` doesn't reach — notably a crash
 * in RoamShell (chat/group), which `(roam)/layout.tsx` renders directly as a sibling of
 * `children`, not nested inside it, so a boundary scoped to that route group can't catch it.
 * Either way TripShell's sidebar/nav (rendered one level up) stays alive.
 */
export default function TripSectionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl px-5 py-10 sm:px-8">
      <EmptyState action={<button onClick={reset} className="btn-primary-sm">Try again</button>}>
        This trip view hit an unexpected error.
      </EmptyState>
    </div>
  );
}
