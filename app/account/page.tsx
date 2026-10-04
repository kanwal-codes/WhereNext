import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AccountView } from "@/features/profile/ui/AccountView";

export const metadata = { title: "Account — Where next?" };
import type { TravelerProfile } from "@/packages/contracts/profile";

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const meta = (user.user_metadata ?? {}) as { name?: string; full_name?: string; avatar_url?: string; picture?: string };
  const displayName = meta.name || meta.full_name || user.email?.split("@")[0] || "Traveller";
  const avatarUrl = meta.avatar_url || meta.picture || null;
  const providers = user.identities?.map((i) => i.provider) ?? [];

  // Stats, profile and shared links are nice-to-haves on this page, not its purpose — a query
  // hiccup should zero them out, never take down the page. Both run at once, and one trips query
  // feeds the stats and the shared list (the same rows), instead of a round trip each.
  const [tripsResult, profileResult] = await Promise.all([
    supabase.from("trips").select("id,name,destination,share_slug,owner_id").then((r) => r, () => null),
    supabase.from("profiles").select("data").eq("id", user.id).maybeSingle().then((r) => r, () => null),
  ]);
  const trips = tripsResult?.data ?? [];
  const tripCount = trips.length;
  const destinationCount = new Set(trips.map((t) => t.destination?.split(",")[0]?.trim()).filter(Boolean)).size;
  const profile = (profileResult?.data?.data as TravelerProfile | undefined) ?? {};
  const sharedTrips = trips
    .filter((t) => t.owner_id === user.id && t.share_slug)
    .map((t) => ({ id: t.id as string, name: t.name as string, slug: t.share_slug as string }));

  return (
    <AccountView
      userId={user.id}
      initialName={displayName}
      avatarUrl={avatarUrl}
      email={user.email ?? ""}
      emailVerified={Boolean(user.email_confirmed_at)}
      tripCount={tripCount}
      destinationCount={destinationCount}
      providers={providers}
      profile={profile}
      sharedTrips={sharedTrips}
    />
  );
}
