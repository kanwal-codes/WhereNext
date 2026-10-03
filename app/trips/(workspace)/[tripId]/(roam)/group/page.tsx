"use client";

import { useDocumentTitle } from "@/lib/use-document-title";

export default function GroupChatPage() {
  const title = useDocumentTitle("Chat");
  return (
    <>
      {title}
      <h1 className="sr-only">Group chat</h1>
    </>
  );
}
