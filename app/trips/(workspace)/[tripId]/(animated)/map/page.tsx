"use client";

import { useEffect, useState } from "react";
import { useTripData } from "@/components/TripDataProvider";
import { MapSurface } from "@/features/maps/ui/MapSurface";
import type { TransportPreset } from "@/features/transport/ui/TransportSurface";
import { useDocumentTitle } from "@/lib/use-document-title";

type Start = { preset?: TransportPreset; day?: number };

/** Getting around is the one page that is the map itself: no page header, the controls float over it. */
export default function MapPage() {
  const { tripId } = useTripData();
  const [tab, setTab] = useState<"trip" | "browse">("trip");
  // A link from a Roam chat reply: `?browse=1&from=…&to=…` opens Browse with that search run, `?day=2` opens that day.
  const [start, setStart] = useState<Start>();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const from = q.get("from")?.trim();
    const to = q.get("to")?.trim();
    const day = Number(q.get("day"));
    if (q.get("browse") && from && to) {
      setStart({ preset: { from, to, modes: q.get("modes")?.split(",").filter(Boolean) ?? [], nonce: Date.now() } });
      setTab("browse");
    } else if (Number.isInteger(day) && day > 0) setStart({ day });
    if (q.size) window.history.replaceState(null, "", window.location.pathname);
    setReady(true);
  }, []);
  const titleTag = useDocumentTitle("Getting around");
  return (
    <>
      {titleTag}
      {ready && <MapSurface tripId={tripId} tab={tab} onTab={setTab} start={start} />}
    </>
  );
}
