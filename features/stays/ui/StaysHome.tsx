"use client";

import { Reveal } from "@/components/motion-primitives";
import { StaySurface } from "./StaySurface";

/** Stays for someone with no trip: the same page a trip has, with no place filled in (the place sheet opens at once). Nothing is saved to a trip. */
export function StaysHome() {
  return (
    <main className="min-h-dvh bg-background px-4 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
      <h1 className="sr-only">Stays</h1>
      <Reveal y={10}><div className="mx-auto w-full max-w-[40rem]"><StaySurface tripId={null} destination="" /></div></Reveal>
    </main>
  );
}
