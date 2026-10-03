import { redirect } from "next/navigation";

/** Budget folded into Trip knowledge. Keep old links working. */
export default async function BudgetRedirect({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  redirect(`/trips/${tripId}/knowledge`);
}
