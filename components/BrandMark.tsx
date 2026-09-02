import { cn } from "@/lib/utils";

/**
 * Typography-only brand mark for "Where next?". No illustration, so it stays
 * crisp on every surface and follows the colour tokens.
 *   compact — the "WN" square, for tight/collapsed spots
 *   text    — the wordmark
 */
export function BrandMark({
  variant = "text",
  className,
  textClassName,
}: {
  variant?: "compact" | "text";
  className?: string;
  textClassName?: string;
}) {
  if (variant === "compact") {
    return (
      <span
        aria-label="Where next?"
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary font-display text-sm font-bold tracking-tight text-primary-foreground",
          className,
        )}
      >
        WN
      </span>
    );
  }

  return (
    <span className={cn("font-display text-base font-semibold tracking-tight text-foreground", textClassName, className)}>
      Where next?
    </span>
  );
}
