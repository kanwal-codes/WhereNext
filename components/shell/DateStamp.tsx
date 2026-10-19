import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

/** "JUN 5" in a dashed coral box: the stamp trip cards carry. Not a ticket (that stays on the landing page); just the date. */
export function DateStamp({ start, className }: { start?: string | null; className?: string }) {
  const d = start ? new Date(`${start}T00:00:00`) : null;
  const valid = d && !Number.isNaN(d.getTime());
  return (
    <span aria-hidden className={cn("grid h-[3.25rem] w-[3.1rem] shrink-0 place-items-center rounded-2xl border-[1.5px] border-dashed border-coral text-coral-ink", className)}>
      {valid ? (
        <span suppressHydrationWarning className="flex flex-col items-center leading-none">
          <span className="text-2xs font-semibold tracking-[0.14em] uppercase">{d.toLocaleDateString("en", { month: "short" })}</span>
          <span className="mt-1 font-display text-xl font-medium">{d.getDate()}</span>
        </span>
      ) : (
        <CalendarDays className="size-5" />
      )}
    </span>
  );
}
