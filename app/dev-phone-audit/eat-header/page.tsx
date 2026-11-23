import { notFound } from "next/navigation";
import { EatHeaderOptions } from "./EatHeaderOptions";

// TEMPORARY (Eat results design). A development-only page: it answers 404 in a production build.
export const dynamic = "force-dynamic";

export default function EatHeaderPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EatHeaderOptions />;
}
