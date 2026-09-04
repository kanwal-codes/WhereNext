import type { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

/** The padded column + header every trip sub-route shares. `wide` for grid-heavy screens. */
export function RouteScaffold({
  eyebrow,
  title,
  description,
  action,
  wide = false,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full min-w-0 px-5 py-10 sm:px-8", wide ? "max-w-6xl" : "max-w-5xl")}>
      <PageHeader eyebrow={eyebrow} title={title} description={description} action={action} />
      <Reveal delay={0.08}>
        <div className="mt-8">{children}</div>
      </Reveal>
    </div>
  );
}
