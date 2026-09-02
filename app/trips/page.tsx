import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TripsPage() {
  let trips: { id: string; name: string; destination: string }[] = [];
  let message = "";
  try { const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) message = "Sign in to see your trips."; else { const result = await supabase.from("trips").select("id,name,destination").order("updated_at", { ascending: false }); if (result.error) throw result.error; trips = result.data ?? []; } } catch { message = "Connect Supabase to load trips."; }
  return <main><p>Next Place to Be</p><h1>Your trips</h1><nav><Link href="/trips/new">Create a trip</Link> <Link href="/account">Account</Link></nav>{message ? <div className="card"><p>{message}</p>{message.includes("Sign in") && <p><Link href="/sign-in">Sign in</Link> · <Link href="/sign-up">Create an account</Link></p>}</div> : trips.length === 0 ? <div className="card"><p>No trips yet.</p><Link href="/trips/new">Start planning</Link></div> : <div>{trips.map((trip) => <div className="card" key={trip.id}><Link href={`/trips/${trip.id}`}><h2>{trip.name}</h2></Link><p>{trip.destination}</p></div>)}</div>}</main>;
}
