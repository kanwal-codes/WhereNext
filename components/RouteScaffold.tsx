import type { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";

/**
 * Standard padded column + header for a trip sub-route. Individual screens get
 * fully designed layouts in later phases; this keeps every route consistent and
 * legible in the meantime.
 */
export function RouteScaffold({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="mt-8">{children}</div>
    </div>
  );
}
