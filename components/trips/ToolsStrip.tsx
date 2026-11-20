import Link from "next/link";
import { BedDouble, Plane, Utensils, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tool = { name: string; line: string; Icon: LucideIcon; href?: string };

/** Things to do with no trip. Only Flights works on its own today; the others are shown so the row is whole, and say they are coming. */
const TOOLS: Tool[] = [
  { name: "Flights", line: "Prices for your dates", Icon: Plane, href: "/flights" },
  { name: "Stays", line: "Coming soon", Icon: BedDouble },
  { name: "Eat", line: "Coming soon", Icon: Utensils },
];

const tile = "flex min-h-28 flex-col justify-between gap-3 rounded-3xl bg-surface p-3.5 ring-1 ring-border";

/** "Just need one thing?": a row of tools to use without starting a trip, between the hero and the trips. */
export function ToolsStrip() {
  return (
    <section aria-labelledby="tools-strip" className="mb-10">
      <h2 id="tools-strip" className="font-display text-xl font-medium tracking-[-0.015em] sm:text-2xl">Just need one thing?</h2>
      <ul className="mt-3.5 grid grid-cols-3 gap-2.5 sm:gap-3 lg:max-w-xl">
        {TOOLS.map(({ name, line, Icon, href }) => {
          const body = (
            <>
              <span className="grid size-9 place-items-center rounded-full bg-coral-soft text-coral-ink"><Icon className="size-[1.125rem]" aria-hidden /></span>
              <span>
                <span className="block font-display text-base font-semibold leading-tight tracking-[-0.01em]">{name}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{line}</span>
              </span>
            </>
          );
          return (
            <li key={name}>
              {href ? (
                <Link href={href} prefetch={false} className={cn(tile, "h-full transition-[box-shadow,transform] duration-200 ease-out hover:shadow-soft active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}>{body}</Link>
              ) : (
                <div aria-disabled="true" className={cn(tile, "h-full opacity-55")}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
