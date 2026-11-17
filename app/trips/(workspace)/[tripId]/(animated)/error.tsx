"use client";

import { useEffect } from "react";
import { SectionError } from "@/components/SectionError";

/** Keeps a crash inside one trip section (itinerary, stays, discover, ...) from taking
 *  down the trip shell around it — TripShell's sidebar/nav lives in the layout above this. */
export default function AnimatedSectionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <SectionError what="this page" digest={error.digest} reset={reset} />;
}
