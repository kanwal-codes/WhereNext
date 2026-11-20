import type { ComponentType, ReactNode } from "react";

/** The two buttons a state offers: the one thing to do, and a quieter way out. */
export const stateButton = {
  primary: "btn-primary h-11 rounded-full px-6",
  secondary: "inline-flex h-11 items-center justify-center rounded-full border border-border bg-background px-5 text-sm font-medium transition-[background-color,transform] hover:bg-muted active:scale-[0.97]",
};

/** The card every "nothing to show" and "could not load" state shares: a lit icon, a short title, a sentence, and what to do about it. */
export function StateMessage({ icon: Icon, title, children, actions }: { icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="rise relative overflow-hidden rounded-3xl border border-border bg-card px-6 py-11 text-center shadow-soft before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-32 before:bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--coral)_13%,transparent),transparent)]">
      <span className="relative mx-auto grid size-12 place-items-center rounded-2xl bg-coral-soft text-coral-ink shadow-hairline">
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="relative mt-4 font-display text-xl font-medium tracking-[-0.02em] text-balance">{title}</h3>
      <p className="relative mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-ink-soft text-pretty">{children}</p>
      <div className="relative mt-6 flex flex-wrap justify-center gap-2">{actions}</div>
    </div>
  );
}

