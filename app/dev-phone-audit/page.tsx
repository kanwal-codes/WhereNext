import { notFound } from "next/navigation";
import { AuditClient } from "./AuditClient";

// TEMPORARY (phone redesign). A development-only page: it answers 404 in a production build.
export const dynamic = "force-dynamic";

export default async function PhoneAuditPage({ searchParams }: { searchParams: Promise<{ theme?: string; scene?: string; edge?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const q = await searchParams;
  return <AuditClient theme={q.theme === "dark" ? "dark" : "light"} scene={q.scene} edge={q.edge === "1"} />;
}
