"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { settleWhenReady } from "@/lib/view-transition";

/** Tells a pending shared-element transition that the new route has arrived. */
export function ViewTransitionGate() {
  const pathname = usePathname();
  useEffect(() => settleWhenReady(), [pathname]);
  return null;
}
