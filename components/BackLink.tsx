"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Goes back to wherever the user came from inside the app; falls back to a
 * known route when they landed here directly or from outside.
 */
export function BackLink({ fallback, label, className }: { fallback: string; label: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        const cameFromApp = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin) && window.history.length > 1;
        if (cameFromApp) router.back();
        else router.push(fallback);
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-background/85 px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-background",
        className,
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
