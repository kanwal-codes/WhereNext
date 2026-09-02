"use client";

import { useEffect } from "react";

const APP = "Next Place to Be";

/** Client-side page title for the "use client" trip routes, which can't export metadata. */
export function useDocumentTitle(title: string | undefined | null) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · ${APP}`;
  }, [title]);
}
