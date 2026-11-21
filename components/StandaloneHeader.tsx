import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/** The one row at the top of a tool used with no trip (Stays, Eat): back to the trips, the place pill centred, and an empty circle's width to balance it. */
export function StandaloneHeader({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="mb-5 grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-3">
      <Link href="/trips" prefetch={false} aria-label="Back to your trips" className="grid size-11 place-items-center rounded-full bg-muted text-foreground transition-[background-color,transform] duration-200 ease-out hover:bg-muted/70 active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <ArrowLeft className="size-5" aria-hidden />
      </Link>
      <div className="flex min-w-0 justify-center">{children}</div>
      {trailing ?? <span aria-hidden />}
    </div>
  );
}
