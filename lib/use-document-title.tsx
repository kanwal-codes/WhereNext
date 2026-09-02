"use client";

import { useEffect } from "react";

const APP = "Where next?";

/**
 * Per-route tab title for the `"use client"` trip routes, which can't `export const metadata`.
 * Returns a `<title>` element — React 19 hoists it into `<head>` and it overrides the layout's
 * metadata title (imperative `document.title` alone loses that race). Also mirrors to
 * `document.title` so it's right before the head re-commits. Render the returned node:
 *
 *   const titleTag = useDocumentTitle("Getting around");
 *   return (<>{titleTag}<PageBody /></>);
 */
export function useDocumentTitle(title: string | undefined | null) {
  const full = title ? `${title} · ${APP}` : null;
  useEffect(() => {
    if (full) document.title = full;
  }, [full]);
  return full ? <title>{full}</title> : null;
}
