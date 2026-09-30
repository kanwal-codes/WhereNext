import { cn } from "@/lib/utils";
import type { Certainty } from "@/lib/design";

const map: Record<Certainty, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "bg-leaf-soft text-leaf border-leaf/30" },
  suggested: { label: "Suggested", className: "bg-water-soft text-water border-water/30" },
  undecided: { label: "Not decided", className: "bg-muted text-muted-foreground border-border" },
};

export function CertaintyBadge({ certainty, className }: { certainty: Certainty; className?: string }) {
  const s = map[certainty];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        s.className,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {s.label}
    </span>
  );
}
