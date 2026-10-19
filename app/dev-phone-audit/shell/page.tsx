import { notFound } from "next/navigation";
import { ShellClient } from "./ShellClient";

// TEMPORARY (phone redesign). Development only: 404 in a production build.
export const dynamic = "force-dynamic";

export default async function ShellAuditPage({ searchParams }: { searchParams: Promise<{ guest?: string; open?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const q = await searchParams;
  return <ShellClient guest={q.guest === "1"} open={q.open !== "0"} />;
}
