import type { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/motion-primitives";

/** The padded column + header every trip sub-route shares. One width, so every page's left edge lines up with the next. */
export function RouteScaffold({
  eyebrow,
  title,
  description,
  action,
  tabs,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-5 pt-5 pb-10 sm:px-8">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={action}
        switcher={tabs}
      />
      <Reveal delay={0.08}>
        <div className="mt-6 sm:mt-8">{children}</div>
      </Reveal>
    </div>
  );
}
