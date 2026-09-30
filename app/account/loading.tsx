import { Skeleton } from "@/components/Skeleton";

// `AccountPage` awaits an auth check and two queries before it can render; this gives the
// navigation an immediate fallback in the page's own shape instead of a frozen screen.
export default function AccountLoading() {
  return (
    <div className="min-h-svh">
      <div className="mx-auto w-full max-w-6xl px-5 pt-6 sm:px-8">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="mt-16 flex items-center gap-5">
          <Skeleton className="size-20 rounded-full" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-56 rounded-md" />
            <Skeleton className="h-4 w-40 rounded-md" />
          </div>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
