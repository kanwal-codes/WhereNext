import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/utils";

/**
 * The bar across the top of every page that sits outside a trip (account, new trip): the mark and name
 * on the left, the way back on the right: the same two places as on the trips home, where the avatar
 * takes the right. `photo` is for a bar laid over a picture.
 */
export function StandaloneTopBar({ photo = false, className }: { photo?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      {/* A phone: just the way back, as a round arrow at the top left (the mark and the wide "All trips" pill are for bigger screens). */}
      <Link
        href="/trips"
        aria-label="Back to your trips"
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full transition-[background-color,transform] duration-200 active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden",
          photo ? "bg-white text-ink" : "bg-muted text-foreground hover:bg-muted/70",
        )}
      >
        <ArrowLeft className="size-5" aria-hidden />
      </Link>
      <Link href="/" prefetch={false} className="inline-flex items-center gap-2 max-lg:hidden transition-[opacity,transform] duration-200 hover:opacity-85 active:scale-[0.97]">
        <BrandMark variant="compact" className={photo ? "bg-white text-black ring-1 ring-white/60" : undefined} />
        <BrandMark variant="text" className={cn("hidden sm:inline", photo && "text-white")} />
      </Link>
      <Link
        href="/trips"
        className={cn(
          "inline-flex h-9 max-lg:hidden items-center gap-2 rounded-full border px-4 text-sm font-medium transition-[background-color,border-color,transform] duration-200 active:scale-[0.97]",
          photo ? "border-transparent bg-white text-ink hover:bg-white" : "border-border bg-card text-foreground hover:border-foreground/30 hover:bg-accent",
        )}
      >
        <ArrowLeft className="size-4" aria-hidden /> All trips
      </Link>
    </div>
  );
}
