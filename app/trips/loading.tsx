import { BrandMark } from "@/components/BrandMark";
import { Skeleton } from "@/components/Skeleton";

// Same fix as `[tripId]/loading.tsx`: `TripsIndexPage` awaits an auth check + the trips list
// query before rendering anything, and with no loading.tsx here the "home screen" stayed frozen
// on whatever was on screen before until that resolved. This gives the navigation an immediate
// Suspense fallback instead.
export default function TripsIndexLoading() {
  return (
    <div className="min-h-svh">
      <div className="flex h-16 items-center gap-3 px-6">
        <BrandMark variant="compact" className="h-8 w-8 shrink-0" />
        <Skeleton className="h-4 w-28 rounded-md" />
      </div>
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <Skeleton className="h-8 w-72 rounded-md" />
        <Skeleton className="mt-6 h-32 rounded-2xl" />
        <div className="mt-10 space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
