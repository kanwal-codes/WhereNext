import type { ReactNode } from "react";
import { Reveal } from "@/components/motion-primitives";
import { RoamMark, type RoamMarkState } from "@/features/roam/ui/RoamMark";

/**
 * A full-screen status: not found, offline, a crash. It is a frame from the same film as the rest of
 * the product: Roam's mark doing the thing the message says (a route that breaks and reconnects, or
 * one that rests), a dawn glow behind it, a title sequence beneath it, and one clear way out.
 */
export function StatusScreen({
  mark = "error",
  eyebrow,
  title,
  children,
  actions,
}: {
  mark?: RoamMarkState;
  eyebrow: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <main className="relative isolate grid min-h-screen place-items-center overflow-hidden bg-background px-6 py-16 text-center text-foreground">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(110% 60% at 50% 0%, color-mix(in oklab, var(--coral) 15%, transparent), transparent 75%), radial-gradient(100% 55% at 50% 100%, color-mix(in oklab, var(--cat-see) 11%, transparent), transparent 75%)",
        }}
      />
      <div className="mx-auto w-full max-w-md">
        <Reveal y={8}>
          <RoamMark state={mark} size={120} className="mx-auto block text-foreground" />
        </Reveal>
        <Reveal delay={0.1} y={8}>
          <p className="eyebrow mt-8 flex items-center justify-center gap-2">
            <span aria-hidden className="size-1 rounded-full bg-coral" />
            {eyebrow}
          </p>
        </Reveal>
        <Reveal delay={0.16} y={12}>
          <h1 className="mt-3 font-display text-4xl leading-[1.04] font-medium tracking-[-0.03em] text-balance sm:text-5xl">{title}</h1>
        </Reveal>
        <Reveal delay={0.24} y={10}>
          <p className="mx-auto mt-4 max-w-sm text-base leading-relaxed text-ink-soft text-pretty">{children}</p>
        </Reveal>
        <Reveal delay={0.32} y={10}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{actions}</div>
        </Reveal>
      </div>
    </main>
  );
}
