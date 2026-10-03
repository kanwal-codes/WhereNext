import { BrandMark } from "@/components/BrandMark";
import { Skeleton } from "@/components/Skeleton";

// `TripsIndexPage` awaits an auth check + the trips list query before rendering anything, so this is
// the immediate Suspense fallback for the navigation. It mirrors the real page (the dark photo hero
// with its header, headline, prompt pill and chips, then the featured card and the grid) so the
// screen settles into place instead of swapping layouts when the data arrives.
export default function TripsIndexLoading() {
  return (
    <div className="min-h-svh" aria-busy="true">
      <div className="relative h-[480px] overflow-hidden rounded-b-3xl bg-[oklch(0.2_0.012_65)] sm:h-[420px]">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(90%_75%_at_50%_100%,oklch(0.38_0.06_45/0.55),transparent)]" />
        <div className="relative mx-auto flex max-w-6xl items-center justify-between px-5 pt-6 sm:px-8">
          <div className="flex items-center gap-2">
            <BrandMark variant="compact" className="ring-1 ring-white/50" />
            <BrandMark variant="text" textClassName="text-white" className="hidden text-white sm:inline" />
          </div>
          <div className="skeleton size-9 rounded-full !bg-white/15 [--skeleton-hi:oklch(1_0_0/0.16)]" />
        </div>
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-5 pb-14 sm:px-8 sm:pb-8">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-3">
            <div className="skeleton h-10 w-3/4 rounded-xl !bg-white/15 [--skeleton-hi:oklch(1_0_0/0.16)] sm:h-12" />
            <div className="skeleton h-4 w-1/2 rounded-md !bg-white/10 [--skeleton-hi:oklch(1_0_0/0.12)]" />
          </div>
          <div className="skeleton mx-auto mt-5 h-14 max-w-xl rounded-full !bg-white/90 [--skeleton-hi:oklch(0.9_0_0/0.9)]" />
          <div className="mt-3 flex justify-center gap-2">
            <div className="skeleton h-9 w-36 rounded-full !bg-white/15 [--skeleton-hi:oklch(1_0_0/0.16)]" />
            <div className="skeleton h-9 w-28 rounded-full !bg-white/15 [--skeleton-hi:oklch(1_0_0/0.16)]" />
            <div className="skeleton hidden h-9 w-36 rounded-full !bg-white/15 [--skeleton-hi:oklch(1_0_0/0.16)] sm:block" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 pt-12 pb-20 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-9 w-44 rounded-xl" />
          <Skeleton className="h-11 w-44 rounded-full" />
        </div>
        <Skeleton className="mt-8 h-72 rounded-3xl sm:h-96" />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-3xl" />
          <Skeleton className="hidden h-64 rounded-3xl sm:block" />
          <Skeleton className="hidden h-64 rounded-3xl lg:block" />
        </div>
      </div>
    </div>
  );
}
