"use client";

import { useEffect } from "react";
import Link from "next/link";

/** Root-level catch-all for anything a page-level error.tsx doesn't cover. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-sm px-5 py-20 text-center">
      <h1 className="font-display text-2xl">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">This page hit an unexpected error. Try again, or head back to your trips.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="btn-primary">Try again</button>
        <Link href="/trips" className="link-underline text-sm font-medium">Go to your trips</Link>
      </div>
    </main>
  );
}
