import { BrandMark } from "@/components/BrandMark";
import { Skeleton } from "@/components/Skeleton";

// Shown the moment a trip is opened from anywhere outside it (the trips home, a shared link, the
// browser's back button) while the workspace loads. `[tripId]/layout.tsx` awaits the trip before it
// can draw the sidebar, so without this boundary the nearest fallback was the trips-home skeleton
// (a photo hero and a prompt box): the wrong screen. This one is the trip's own: the sidebar with its
// nine rows and the overview's hero, so the real page settles into the same places. Moving between
// pages inside a trip uses `[tripId]/loading.tsx`, which only fills the column beside the sidebar.
export default function OpeningTripLoading() {
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]" aria-busy="true">
      <aside aria-hidden className="sticky top-0 hidden h-[100dvh] flex-col border-r border-sidebar-border bg-sidebar px-3 py-6 lg:flex">
        <div className="mb-6 space-y-2 px-3">
          <Skeleton className="h-5 w-40 rounded-md" />
          <Skeleton className="h-3 w-32 rounded-md" />
        </div>
        <div className="space-y-1">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex h-9 items-center gap-3 rounded-xl px-3">
              <Skeleton className="size-4 rounded-md" />
              <Skeleton className="h-3.5 rounded-md" style={{ width: `${46 + ((i * 17) % 34)}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-auto space-y-3">
          <Skeleton className="mx-3 h-3.5 w-20 rounded-md" />
          <Skeleton className="h-11 rounded-full" />
        </div>
      </aside>

      <div className="min-w-0">
        <div className="sticky top-0 z-30 flex h-[var(--topbar)] items-center gap-3 border-b border-border bg-background/95 px-4 lg:hidden">
          <BrandMark variant="compact" className="h-7 w-7 shrink-0 text-2xs" />
          <Skeleton className="h-4 w-32 rounded-md" />
          <Skeleton className="ml-auto size-10 rounded-full" />
        </div>
        <div aria-hidden>
          <Skeleton className="h-[26rem] rounded-none rounded-b-[1.75rem] sm:h-[30rem] lg:rounded-none" />
          <div className="mx-auto max-w-6xl px-5 pt-8 sm:px-8">
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-11 w-44 rounded-full" />
              <Skeleton className="h-11 w-28 rounded-full" />
              <Skeleton className="hidden h-11 w-28 rounded-full sm:block" />
            </div>
            <Skeleton className="mt-12 h-40 rounded-3xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
