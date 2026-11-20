"use client";

import { Reveal } from "@/components/motion-primitives";
import { FlightsSurface } from "./FlightsSurface";

/** Flights for someone with no trip: the same page a trip has, with its own header row. Nothing here is saved to a trip. */
export function FlightsHome() {
  return (
    <main className="min-h-dvh bg-background px-4 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
      <h1 className="sr-only">Flights</h1>
      <Reveal y={10}><div className="mx-auto w-full max-w-[40rem]"><FlightsSurface tripId={null} /></div></Reveal>
    </main>
  );
}
