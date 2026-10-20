import { cn } from "@/lib/utils";
import type { Certainty } from "@/lib/design";

const map: Record<Certainty, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "status-ok" },
  suggested: { label: "Suggested", className: "status-info" },
  undecided: { label: "Not decided", className: "" },
};

export function CertaintyBadge({ certainty, className }: { certainty: Certainty; className?: string }) {
  const s = map[certainty];
  return (
    <span className={cn("status-chip shrink-0", s.className, className)}>{s.label}</span>
  );
}
