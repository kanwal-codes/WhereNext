"use client";

import { useEffect } from "react";

const APP = "Where next?";

/**
 * Per-route tab title for the `"use client"` trip routes, which can't `export const metadata`.
 *
 * The App Router re-resolves route metadata after hydration and on every navigation, and that
 * pass rewrites `document.title` back to the nearest `export`ed value (here: the root layout's).
 * A one-shot `document.title = …` in an effect loses that race, and a rendered `<title>` element
 * ends up ordered *after* the metadata one so the browser ignores it. So we set the title and
 * then keep it set: a `MutationObserver` on `<head>` re-applies ours whenever something else
 * changes it. Cheap — it only fires on head mutations, and no-ops once the title already matches.
 *
 *   const titleTag = useDocumentTitle("Getting around");
 *   return (<>{titleTag}<PageBody /></>);
 */
export function useDocumentTitle(title: string | undefined | null) {
  const full = title ? `${title} · ${APP}` : null;

  useEffect(() => {
    if (!full || typeof document === "undefined") return;
    const apply = () => {
      if (document.title !== full) document.title = full;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [full]);

  return full ? <title>{full}</title> : null;
}
