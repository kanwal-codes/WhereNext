"use client";

import { useEffect, useState } from "react";

/**
 * A list that opens with `first` rows and grows by `step` when the reader asks. `resetKey` snaps it back to the first
 * page when the list underneath changes (new search, new filter). Nothing loads on its own: the reader chooses.
 */
export function useShowMore(total: number, resetKey: unknown = null, { first = 15, step = 6 }: { first?: number; step?: number } = {}) {
  const [shown, setShown] = useState(first);
  useEffect(() => setShown(first), [resetKey, first]);
  const visible = Math.min(shown, total);
  const remaining = total - visible;
  return { visible, remaining, next: Math.min(step, remaining), showMore: () => setShown((n) => n + step), first };
}
