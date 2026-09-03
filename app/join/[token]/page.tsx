import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-sm px-5 py-20 text-center">
        <h1 className="font-display text-2xl">You’ve been invited to a trip</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to join the plan.</p>
        <Link href={`/sign-in?redirect=${encodeURIComponent(`/join/${token}`)}`} className="btn-primary mt-6 inline-flex">
          Sign in to continue
        </Link>
      </main>
    );
  }

  const { data: tripId, error } = await supabase.rpc("accept_trip_invite", { p_token: token });
  if (error || !tripId) {
    return (
      <main className="mx-auto max-w-sm px-5 py-20 text-center">
        <h1 className="font-display text-2xl">This invite can’t be used</h1>
        <p className="mt-2 text-sm text-muted-foreground">It may have expired or already been used. Ask the trip owner for a fresh link.</p>
        <Link href="/trips" className="link-underline mt-6 inline-block text-sm font-medium">Go to your trips</Link>
      </main>
    );
  }

  redirect(`/trips/${tripId}`);
}
