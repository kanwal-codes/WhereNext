import { NewTripForm } from "@/features/trip-setup/ui/NewTripForm";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewTripPage() {
  let authenticated = false;
  try { const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser(); authenticated = Boolean(user); } catch { /* show the auth prompt when auth is unavailable */ }
  return <main><h1>Start a trip</h1>{authenticated ? <NewTripForm /> : <div className="card"><p>Sign in or create an account before starting a trip.</p><p><Link href="/sign-in">Sign in</Link> · <Link href="/sign-up">Create an account</Link></p></div>}</main>;
}
