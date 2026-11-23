"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useOpenNewTrip } from "@/components/trips/useOpenNewTrip";

/**
 * A link to a new trip that does not go to the new-trip page: a plain press makes the trip and opens Roam on it from here, the button showing a spinner where its
 * icon was while it works. The address is still there for a new tab, a copied link or a modified click, which open the new-trip page as before.
 */
export function NewTripLink({ className, children }: { className?: string; /** What the link says; `opening` swaps its icon for the spinner. */ children: (opening: ReactNode | null) => ReactNode }) {
  const { open, opening } = useOpenNewTrip();
  return (
    <Link
      href="/trips/new"
      prefetch={false}
      className={className}
      aria-busy={opening}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        void open();
      }}
    >
      {children(opening ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null)}
    </Link>
  );
}
