import { redirect } from "next/navigation";
import { createSupabaseServerClient, getSessionUser } from "@/lib/supabase/server";
import { EatHome } from "@/features/eat/ui/EatHome";

export const metadata = { title: "Eat — Where next?" };

/** Eat without a trip: reached from the tile on the home page. */
export default async function EatPage() {
  const user = await getSessionUser(await createSupabaseServerClient()).catch(() => null);
  if (!user) redirect("/sign-in?redirect=%2Feat");
  return <EatHome />;
}
