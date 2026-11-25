import { redirect } from "next/navigation";
import { createSupabaseServerClient, getSessionUser } from "@/lib/supabase/server";
import { StaysHome } from "@/features/stays/ui/StaysHome";

export const metadata = { title: "Stays · Where next?" };

/** Stays without a trip: reached from the tile on the home page. */
export default async function StaysPage() {
  const user = await getSessionUser(await createSupabaseServerClient()).catch(() => null);
  if (!user) redirect("/sign-in?redirect=%2Fstay");
  return <StaysHome />;
}
