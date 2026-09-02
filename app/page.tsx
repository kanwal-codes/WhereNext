import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Landing } from "@/components/Landing";

export default async function HomePage() {
  let authed = false;
  try {
    const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
    authed = Boolean(user);
  } catch {
    /* Supabase unavailable — show the public landing. */
  }
  if (authed) redirect("/trips");
  return <Landing />;
}
