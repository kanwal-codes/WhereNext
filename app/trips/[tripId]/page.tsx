import { TripWorkspace } from "@/features/workspace/ui/TripWorkspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadTripWorkspace } from "@/features/workspace/application/loadTripWorkspace";

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  let trip = null;
  if (tripId !== "rebuild-preview") { try { const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser(); if (user) trip = (await loadTripWorkspace(supabase, tripId))?.trip ?? null; } catch {} }
  if (tripId !== "rebuild-preview" && !trip) return <main><div className="card"><h1>Trip not found</h1><p>This trip is unavailable or you do not have access.</p></div></main>;
  const destination = trip?.destination ?? "your destination";
  return <main><div className="card"><p>Trip workspace</p><h1>{destination}</h1><p>{trip?.name ?? "The trip is the durable system of record."}</p><p>{trip?.duration_days ?? "—"} days · {trip?.travelers ?? "—"} travelers{trip?.origin ? ` · from ${trip.origin}` : ""}</p></div><TripWorkspace tripId={tripId} trip={trip} /></main>;
}
