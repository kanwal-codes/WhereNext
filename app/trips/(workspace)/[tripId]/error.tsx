"use client";

import { useEffect } from "react";
import { SectionError } from "@/components/SectionError";

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

  return <SectionError what="this page" digest={error.digest} reset={reset} />;
}
