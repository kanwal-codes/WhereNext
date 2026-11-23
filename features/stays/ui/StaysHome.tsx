"use client";

import { useEffect, useState } from "react";
import { Reveal } from "@/components/motion-primitives";
import { cachedGet } from "@/lib/client/cached-get";
import { StaySurface } from "./StaySurface";

/**
 * Stays for someone with no trip: the same page a trip has. The place field starts empty and the search sheet opens at once; behind it the page shows stays
 * around your home city (profile, then where the request comes from), or asks for a place when neither is known. Nothing is saved to a trip.
 */
export function StaysHome() {
  const [home, setHome] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    cachedGet("/api/flights/home").then((r) => (r.ok ? r.json() : null)).then((b: { place: string | null } | null) => { if (live) setHome(b?.place ?? null); }, () => { if (live) setHome(null); });
    return () => { live = false; };
  }, []);
  return (
    <main className="min-h-dvh bg-background px-4 pb-10 sm:px-8">
      <h1 className="sr-only">Stays</h1>
      <Reveal y={10}><div className="mx-auto w-full max-w-[40rem]">{home === undefined ? null : <StaySurface tripId={null} destination={home ?? ""} />}</div></Reveal>
    </main>
  );
}
