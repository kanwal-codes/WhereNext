import Link from "next/link";
import { ArrowUpRight, BedDouble, Plane, Utensils, type LucideIcon } from "lucide-react";

type Tool = { name: string; Icon: LucideIcon; href: string };

/** Things to do with no trip: each opens a page that works on its own, so someone who only needs a flight, a hotel or a table never has to start a plan. */
const TOOLS: Tool[] = [
  { name: "Flights", Icon: Plane, href: "/flights" },
  { name: "Stays", Icon: BedDouble, href: "/stay" },
  { name: "Eat", Icon: Utensils, href: "/eat" },
];

/**
 * "Just need one thing?": the tools to use without starting a trip, between the hero and the trips (a row of buttons on a phone). On a wider screen each tile is a warm card with a lit icon
 * medallion, its name, and a small arrow that says it goes somewhere; a large pale copy of the icon sits behind, cropped at the corner, for depth.
 */
export function ToolsStrip() {
  return (
    <section aria-labelledby="tools-strip" className="mb-10 max-lg:mb-8">
      <h2 id="tools-strip" className="sr-only">Just need one thing?</h2>
      {/* A phone: one quiet row of three buttons, so the trips are not pushed down the screen. */}
      <ul className="grid grid-cols-3 gap-2.5 lg:hidden">
        {TOOLS.map(({ name, Icon, href }) => (
          <li key={name}>
            <Link
              href={href}
              prefetch={false}
              className="flex h-14 items-center justify-center gap-2 rounded-full bg-card text-body font-medium shadow-soft ring-1 ring-border transition-transform duration-200 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Icon aria-hidden className="size-[1.125rem] text-coral-ink" />
              {name}
            </Link>
          </li>
        ))}
      </ul>
      <ul className="grid grid-cols-3 gap-2.5 max-lg:hidden sm:gap-3 lg:max-w-xl">
        {TOOLS.map(({ name, Icon, href }, i) => (
          <li key={name} className="rise" style={{ animationDelay: `${i * 70}ms` }}>
            <Link
              href={href}
              prefetch={false}
              className="group relative isolate flex h-full min-h-32 flex-col justify-between overflow-hidden rounded-[1.75rem] bg-[linear-gradient(155deg,var(--color-card)_30%,color-mix(in_oklab,var(--color-coral-soft)_70%,var(--color-card)))] p-3.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_12px_26px_-20px_rgb(90_40_20/0.45)] ring-1 ring-border transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_18px_30px_-18px_rgb(90_40_20/0.5)] active:translate-y-0 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Icon aria-hidden strokeWidth={1.25} className="pointer-events-none absolute -right-4 -bottom-4 -z-10 size-24 text-coral-ink/[0.08] transition-transform duration-500 ease-out group-hover:-rotate-6 group-hover:scale-110" />
              <span className="grid size-11 place-items-center rounded-full bg-card text-coral-ink shadow-[0_8px_16px_-10px_rgb(160_60_30/0.55)] ring-1 ring-coral/15 transition-transform duration-300 ease-out group-hover:scale-105">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="flex items-center justify-between gap-1">
                <span className="font-display text-[1.0625rem] leading-none font-semibold tracking-[-0.015em]">{name}</span>
                <ArrowUpRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-[transform,color] duration-300 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-coral-ink" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
