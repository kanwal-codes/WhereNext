"use client";

import { useEffect } from "react";

/** A DB error now throws instead of being swallowed into `notFound()` (see public-trip.ts) —
 *  this keeps a transient outage from reading as "this trip doesn't exist" to a public visitor
 *  who likely has no account, so the root app/error.tsx's "Go to your trips" doesn't fit. */
export default function SharedTripError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-sm px-5 py-20 text-center">
      <h1 className="font-display text-2xl">This trip is temporarily unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">Something went wrong loading it. Try again in a moment.</p>
      <button onClick={reset} className="btn-primary mt-6">Try again</button>
    </main>
  );
}
