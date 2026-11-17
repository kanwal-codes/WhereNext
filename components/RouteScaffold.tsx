import type { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

/** The padded column + header every trip sub-route shares. One width, so every page's left edge lines up with the next. */
export function RouteScaffold({
  eyebrow,
  title,
  description,
  action,
  tabs,
  railAction,
  phoneQuietTitle,
  phoneTitle,
  phoneHideSwitcher,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  tabs?: ReactNode;
  /** A button at the top right of the header rail (desktop). */
  railAction?: ReactNode;
  phoneQuietTitle?: boolean;
  phoneTitle?: string;
  phoneHideSwitcher?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 pt-5 pb-10 sm:px-8">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={action}
        switcher={tabs}
        railAction={railAction}
        phoneQuietTitle={phoneQuietTitle}
        phoneTitle={phoneTitle}
        phoneHideSwitcher={phoneHideSwitcher}
      />
      <Reveal delay={0.08}>
        <div className={cn("mt-6 sm:mt-8", phoneHideSwitcher && "max-lg:mt-0")}>{children}</div>
      </Reveal>
    </div>
  );
}
