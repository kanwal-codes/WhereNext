import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NearbyStays } from "@/features/stays/ui/NearbyStays";

const ORDERS = ["nearby", "price", "rating"] as const;
const KINDS = ["All", "Hotel", "Motel", "Hostel / dorm", "Apartment-style"] as const;

export default async function StayAlternativesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ location?: string; checkin?: string; checkout?: string; order?: string; kind?: string }>;
}) {
  const { tripId } = await params;
  const query = await searchParams;
  const location = query.location ?? "";
  const initialOrder = (ORDERS as readonly string[]).includes(query.order ?? "") ? (query.order as (typeof ORDERS)[number]) : "nearby";
  const initialKind = (KINDS as readonly string[]).includes(query.kind ?? "") ? (query.kind as (typeof KINDS)[number]) : "All";
  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href={`/trips/${tripId}/stay`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back to stays</Link>
      <div className="mt-8 max-w-2xl">
        <p className="eyebrow text-coral">Find your fit</p>
        <h1 className="mt-2 font-display text-4xl leading-tight">Places to stay around {location || "your destination"}.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Compare nearby hotels, motels, hostels, and apartment-style stays by what matters to you.</p>
      </div>
      <div className="mt-8">
        <NearbyStays tripId={tripId} currentHotelId="" location={location} checkin={query.checkin} checkout={query.checkout} mode="full" initialOrder={initialOrder} initialKind={initialKind} />
      </div>
    </main>
  );
}
