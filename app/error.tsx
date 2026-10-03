"use client";

import { useEffect } from "react";
import Link from "next/link";
import { StatusScreen } from "@/components/StatusScreen";

/** Root-level catch-all for anything a page-level error.tsx doesn't cover. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      mark="error"
      eyebrow="Something went wrong"
      title="The route hit a snag."
      actions={
        <>
          <button onClick={reset} className="btn-primary">Try again</button>
          <Link href="/trips" className="btn-secondary">Go to your trips</Link>
        </>
      }
    >
      This page hit an unexpected error. Try again, or head back to your trips.
    </StatusScreen>
  );
}
