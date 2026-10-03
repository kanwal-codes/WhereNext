import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, PartyPopper, UserPlus } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { StatusScreen } from "@/components/StatusScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { invalidate } from "@/lib/server/ttl-cache";

export const dynamic = "force-dynamic";

function JoinCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm">
          <BrandMark variant="compact" />
          <BrandMark variant="text" />
        </Link>
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-soft">{children}</div>
      </div>
    </main>
  );
}

function DeadInvite({ reason }: { reason: string }) {
  return (
    <StatusScreen
      mark="error"
      eyebrow="Invite"
      title="This invite can’t be used."
      actions={<Link href="/trips" className="btn-secondary">Go to your trips</Link>}
    >
      {reason}
    </StatusScreen>
  );
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Looked up with the admin client (bypasses RLS — nobody has a trip_members row for this trip
  // yet) so a dead link says so immediately, and a live one can be shown with real trip/inviter
  // context, instead of making every visitor sign in first just to learn the link was already
  // used. This is display-only: the actual join still runs through accept_trip_invite below,
  // which re-checks everything itself under RLS.
  const admin = createSupabaseAdminClient();
  const invite = await admin
    .from("trip_invites")
    .select("trip_id, email, accepted_at, expires_at, created_by, trips(name, destination)")
    .eq("token", token)
    .maybeSingle()
    .then((r) => r.data, () => null);

  if (!invite) return <DeadInvite reason="This link doesn’t exist. Ask whoever sent it for a fresh one." />;
  // A generic (no addressed email) link is meant to be reused by every friend who has it — only
  // an invite sent to one specific email is single-use. See accept_trip_invite's own comment.
  if (invite.email && invite.accepted_at) return <DeadInvite reason="This link has already been used. Ask for a fresh one if you still need to join." />;
  if (new Date(invite.expires_at) < new Date()) return <DeadInvite reason="This link has expired. Ask for a fresh one." />;

  const trip = invite.trips as unknown as { name: string; destination: string | null } | null;
  const tripName = trip?.name || "a trip";
  const inviter = await admin.auth.admin.getUserById(invite.created_by).then((r) => r.data.user, () => null);
  const inviterMeta = (inviter?.user_metadata ?? {}) as { name?: string; full_name?: string };
  const inviterName = inviterMeta.name || inviterMeta.full_name || inviter?.email?.split("@")[0] || "Someone";

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const redirectTarget = encodeURIComponent(`/join/${token}`);
    return (
      <JoinCard>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-coral/15" aria-hidden="true">
          <PartyPopper className="h-5 w-5 text-coral" />
        </span>
        <h1 className="mt-4 font-display text-xl leading-snug">
          {inviterName} invited you to help plan <span className="text-coral">{tripName}</span>
        </h1>
        {trip?.destination && <p className="mt-1.5 text-sm text-muted-foreground">{trip.destination}</p>}
        <p className="mt-4 text-sm text-muted-foreground">
          You’ll need a free Where next? account to join — it takes a few seconds, and you’ll land right in the group chat.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <Link href={`/sign-up?redirect=${redirectTarget}`} className="btn-primary inline-flex items-center justify-center gap-1.5">
            <UserPlus className="h-4 w-4" /> Create an account
          </Link>
          <Link href={`/sign-in?redirect=${redirectTarget}`} className="btn-secondary inline-flex items-center justify-center gap-1.5">
            I already have an account <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </JoinCard>
    );
  }

  const { data: tripId, error } = await supabase.rpc("accept_trip_invite", { p_token: token });
  // `error` is the RPC call itself failing (outage, permissions) — retryable, and not the same
  // as the RPC succeeding and reporting no trip (an actually expired/used/invalid token, e.g. a
  // race with someone else redeeming it between the preview lookup above and this call).
  if (error) {
    return (
      <JoinCard>
        <h1 className="font-display text-xl">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">We couldn’t process this invite right now. Try the link again in a moment.</p>
        <Link href={`/join/${token}`} className="link-underline mt-6 inline-block text-sm font-medium">
          Try again
        </Link>
      </JoinCard>
    );
  }
  if (!tripId) return <DeadInvite reason="It may have expired or already been used. Ask for a fresh link." />;

  // The RPC inserts the new member row directly in Postgres — it never goes through the
  // members routes' own cache invalidation, so without this a just-joined member stays
  // invisible in the member list, and unaddressable by name in Roam group replies, for up
  // to the cache's TTL.
  await Promise.all([invalidate(`members:${tripId}`), invalidate(`member-identities:${tripId}`)]);

  // `joined=1` lets the group chat surface show a one-time welcome moment instead of dropping
  // the new member into the thread with zero acknowledgment that anything happened.
  redirect(`/trips/${tripId}/group?joined=1`);
}
