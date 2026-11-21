import { redirect } from "next/navigation";
import { createSupabaseServerClient, getSessionUser } from "@/lib/supabase/server";
import { FlightsHome } from "@/features/flights/ui/FlightsHome";

export const metadata = { title: "Flights — Where next?" };

/** Flights without a trip: reached from the chip on the home page. */
export default async function FlightsPage() {
  const user = await getSessionUser(await createSupabaseServerClient()).catch(() => null);
  if (!user) redirect("/sign-in?redirect=%2Fflights");
  return <FlightsHome />;
}
