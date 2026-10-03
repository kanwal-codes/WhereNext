"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowUpRight, Ellipsis, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The "..." menu on a trip. It replaces the old hover-only trash icon, which touch screens could
 * only reach by accident: this is always there, and says what it does.
 */
export function TripMenu({
  name,
  href,
  deleting,
  onDelete,
  className,
}: {
  name: string;
  href: string;
  deleting: boolean;
  onDelete: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  // A <details> menu only closes on its own summary. Close it on an outside press or Escape too.
  useEffect(() => {
    const close = (event: Event) => {
      const menu = ref.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      const menu = ref.current;
      if (event.key === "Escape" && menu?.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return (
    <details ref={ref} className={cn("daisy-dropdown daisy-dropdown-end", className)}>
      <summary
        aria-label={`Options for ${name}`}
        className="daisy-btn daisy-btn-circle daisy-btn-sm list-none border border-border/60 bg-background/88 text-foreground shadow-none transition-[background-color,border-color,transform] hover:!bg-background hover:border-foreground/30 active:scale-95 [&::-webkit-details-marker]:hidden"
      >
        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ellipsis className="h-4 w-4" />}
      </summary>
      <ul className="daisy-dropdown-content daisy-menu z-30 mt-2 w-48 gap-0.5 rounded-2xl border border-border bg-popover p-1.5 text-sm shadow-lift [&_a]:rounded-xl [&_button]:rounded-xl">
        <li>
          <Link href={href}>
            <ArrowUpRight className="h-4 w-4" /> Open trip
          </Link>
        </li>
        <li>
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              if (ref.current) ref.current.open = false;
              onDelete();
            }}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete trip
          </button>
        </li>
      </ul>
    </details>
  );
}
