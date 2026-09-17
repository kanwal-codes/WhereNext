import { BrandMark } from "@/components/BrandMark";
import { Skeleton, SkeletonLines } from "@/components/Skeleton";

// `[tripId]/layout.tsx` awaits a real auth check + workspace load before rendering anything
// below it (TripShell included) — with no `loading.tsx` anywhere in this route tree, that left
// every navigation whose client router cache entry had gone stale (the 30s window in
// next.config's `staleTimes.dynamic` is well short of how long someone actually spends reading
// a page before clicking again) showing nothing at all: the OLD route stayed on screen, frozen,
// until the ENTIRE new one — layout and page both — was fully ready. This is the Suspense
// fallback Next.js shows the instant navigation starts, so the transition itself is immediate;
// only the real content streams in once the workspace load resolves. Deliberately generic
// (brand bar + a content skeleton), not per-route pixel-matched — every route under here shares
// this one boundary, and the point is to stop the dead freeze, not to preview each page exactly.
export default function TripLoading() {
  return (
    <div className="flex min-h-svh flex-col">
      <div className="sticky top-0 z-30 flex h-[var(--topbar)] shrink-0 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
        <BrandMark variant="compact" className="h-6 w-6 shrink-0 text-[10px]" />
        <Skeleton className="h-4 w-40 rounded-md" />
      </div>
      <div className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-5 py-10 sm:px-8">
        <Skeleton className="h-3 w-20 rounded-md" />
        <Skeleton className="mt-3 h-8 w-64 rounded-md" />
        <div className="mt-8 space-y-4">
          <SkeletonLines lines={2} className="max-w-md" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    </div>
  );
}
