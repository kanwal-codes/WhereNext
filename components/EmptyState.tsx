import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The one "nothing here yet" recipe — a dashed card, centered text, an optional icon and CTA.
 *  Reach for this instead of a bare paragraph or a one-off dashed box. */
export function EmptyState({
  icon: Icon,
  children,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-border px-5 py-10 text-center", className)}>
      {Icon && <Icon className="mx-auto h-5 w-5 text-muted-foreground" />}
      <p className={cn("text-sm text-muted-foreground", Icon && "mt-2.5")}>{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
