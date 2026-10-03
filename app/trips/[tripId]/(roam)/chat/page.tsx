"use client";

import { useDocumentTitle } from "@/lib/use-document-title";

export default function ChatPage() {
  const title = useDocumentTitle("Roam");
  // The conversation is full-bleed with no visible page title, so screen readers (and the e2e
  // suite) still get the one top-level heading every route has.
  return (
    <>
      {title}
      <h1 className="sr-only">Conversation</h1>
    </>
  );
}
