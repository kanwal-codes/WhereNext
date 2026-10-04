import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { TripArt, hashString } from "@/components/trips/TripArt";

/**
 * The one "nothing here yet" card for the Overview (where to sleep, the plan, saved places): a warm wash that
 * differs a little for every trip, a lit icon tile, one sentence and one action. It reads as an invitation, not
 * as an empty box.
 */
export function InviteCard({ seed, icon: Icon, title, children, href, cta }: { seed: string; icon: LucideIcon; title: string; children: string; href: string; cta: string }) {
  return (
    <Link href={href} className="group block rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
      <TripArt seed={hashString(seed)} className="rounded-3xl border border-border/70 p-6 shadow-soft transition-[border-color,box-shadow,transform] duration-300 group-hover:border-foreground/20 group-hover:shadow-lift group-active:scale-[0.995] sm:p-9">
        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-border/60 bg-background/85 shadow-hairline">
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-2xl tracking-tight sm:text-3xl">{title}</h3>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-soft">{children}</p>
            </div>
          </div>
          <span className="btn-primary w-fit shrink-0">
            {cta} <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
          </span>
        </div>
      </TripArt>
    </Link>
  );
}
