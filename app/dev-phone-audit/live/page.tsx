import { notFound } from "next/navigation";
import { LiveClient } from "./LiveClient";

// TEMPORARY (phone redesign). Development only: 404 in a production build.
export const dynamic = "force-dynamic";

export default async function LiveAuditPage({ searchParams }: { searchParams: Promise<{ theme?: string; scene?: string; edge?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const q = await searchParams;
  return <LiveClient theme={q.theme === "dark" ? "dark" : "light"} scene={q.scene} edge={q.edge === "1"} />;
}
