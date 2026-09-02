import { redirect } from "next/navigation";

/** Transport merged into "Getting around" (/map). Keep old links working. */
export default async function TransportRedirect({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  redirect(`/trips/${tripId}/map`);
}
