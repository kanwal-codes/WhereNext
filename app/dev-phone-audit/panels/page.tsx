import { notFound } from "next/navigation";
import { PanelsClient } from "./PanelsClient";

// TEMPORARY (phone redesign). Development only: 404 in a production build.
export const dynamic = "force-dynamic";

export default async function PanelsAuditPage({ searchParams }: { searchParams: Promise<{ open?: string; theme?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const q = await searchParams;
  return <PanelsClient open={q.open ?? "weather"} theme={q.theme === "dark" ? "dark" : "light"} />;
}
