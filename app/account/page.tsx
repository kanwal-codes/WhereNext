import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AccountView } from "@/features/profile/ui/AccountView";
import type { TravelerProfile } from "@/packages/contracts/profile";

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const meta = (user.user_metadata ?? {}) as { name?: string; full_name?: string; avatar_url?: string; picture?: string };
  const displayName = meta.name || meta.full_name || user.email?.split("@")[0] || "Traveller";
  const avatarUrl = meta.avatar_url || meta.picture || null;
  const providers = user.identities?.map((i) => i.provider) ?? [];

  // Stats, profile and shared links are nice-to-haves on this page, not its
  // purpose — a query hiccup should zero them out, never take down the page.
  let trips: Array<{ destination: string | null }> = [];
  try {
    const result = await supabase.from("trips").select("destination");
    trips = result.data ?? [];
  } catch { /* stats fall back to zero */ }
  const tripCount = trips.length;
  const destinationCount = new Set(trips.map((t) => t.destination?.split(",")[0]?.trim()).filter(Boolean)).size;

  let profile: TravelerProfile = {};
  try {
    const result = await supabase.from("profiles").select("data").eq("id", user.id).maybeSingle();
    profile = (result.data?.data as TravelerProfile | undefined) ?? {};
  } catch { /* form falls back to empty */ }

  let sharedTrips: Array<{ id: string; name: string; slug: string }> = [];
  try {
    const result = await supabase.from("trips").select("id,name,share_slug").eq("owner_id", user.id).not("share_slug", "is", null);
    sharedTrips = (result.data ?? []).map((t) => ({ id: t.id as string, name: t.name as string, slug: t.share_slug as string }));
  } catch { /* list falls back to empty */ }

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
