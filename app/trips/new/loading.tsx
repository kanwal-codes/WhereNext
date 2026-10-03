import { Skeleton } from "@/components/Skeleton";

// The new-trip page: back link, headline, the card. (Without this, opening it showed the trips-home skeleton.)
export default function NewTripLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-16 pb-20 sm:px-8" aria-busy="true">
      <Skeleton className="h-4 w-20 rounded-md" />
      <Skeleton className="mt-10 h-10 w-3/4 rounded-xl" />
      <Skeleton className="mt-3 h-10 w-1/2 rounded-xl" />
      <Skeleton className="mt-5 h-4 w-4/5 rounded-md" />
      <Skeleton className="mt-10 h-72 rounded-3xl" />
    </div>
  );
}
