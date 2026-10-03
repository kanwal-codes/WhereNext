import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The one "nothing here yet" recipe: a calm card with a coral-lit icon tile, a line of text and an
 *  optional CTA. It should read as an invitation, not as an error. Reach for this instead of a bare
 *  paragraph or a one-off dashed box. */
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
    <div
      className={cn(
        "rise relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-10 text-center shadow-soft",
        // A faint dawn glow behind the icon, so an empty card still has a light source.
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-28 before:bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--coral)_13%,transparent),transparent)]",
        className,
      )}
    >
      {Icon && (
        <span className="relative mx-auto grid size-11 place-items-center rounded-2xl bg-coral-soft text-coral-ink shadow-hairline">
          <Icon className="size-5" />
        </span>
      )}
      <p className={cn("relative mx-auto max-w-sm text-sm leading-relaxed text-ink-soft text-pretty", Icon && "mt-3.5")}>{children}</p>
      {action && <div className="relative mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
