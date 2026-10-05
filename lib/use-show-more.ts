"use client";

import { useEffect, useState } from "react";

/**
 * The one paging rule for result lists: open with 15 rows, then "Show 9 more" when the reader asks. It windows a list that is already in
 * memory, so asking for more costs no request. `resetKey` snaps it back to the first
 * page when the list underneath changes (new search, new filter). Nothing loads on its own: the reader chooses.
 */
export function useShowMore(total: number, resetKey: unknown = null, { first = 15, step = 9 }: { first?: number; step?: number } = {}) {
  const [shown, setShown] = useState(first);
  useEffect(() => setShown(first), [resetKey, first]);
  const visible = Math.min(shown, total);
  const remaining = total - visible;
  return { visible, remaining, next: Math.min(step, remaining), showMore: () => setShown((n) => n + step), first };
}
