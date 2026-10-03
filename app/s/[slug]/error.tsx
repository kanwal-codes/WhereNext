"use client";

import { useEffect } from "react";
import { StatusScreen } from "@/components/StatusScreen";

/** A DB error now throws instead of being swallowed into `notFound()` (see public-trip.ts) —
 *  this keeps a transient outage from reading as "this trip doesn't exist" to a public visitor
 *  who likely has no account, so the root app/error.tsx's "Go to your trips" doesn't fit. */
export default function SharedTripError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      mark="error"
      eyebrow="Shared trip"
      title="This trip is temporarily unavailable."
      actions={<button onClick={reset} className="btn-primary">Try again</button>}
    >
      Something went wrong loading it. Try again in a moment.
    </StatusScreen>
  );
}
