import React from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { MessageBlocks, type BlockHandlers } from "./blocks/MessageBlocks";
import { isProxyPhotoUrl, portableProxyPhotoUrl } from "./portable-photo-url";

export type { BlockHandlers };
export { isProxyPhotoUrl, portableProxyPhotoUrl } from "./portable-photo-url";

// Markdown produced by the model. Raw HTML is dropped; only these tags render.
const ALLOWED_ELEMENTS = [
  "p", "br", "strong", "em", "del", "blockquote",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4",
  "a", "code", "pre",
  "table", "thead", "tbody", "tr", "th", "td",
  "img",
];

const components: Components = {
  a({ href, children }) {
    return typeof href === "string" && /^https?:\/\//i.test(href)
      ? (
        <a href={href} target="_blank" rel="noreferrer noopener">
          {children}
        </a>
      )
      : <>{children}</>;
  },
  img({ src, alt }) {
    const portableSrc = portableProxyPhotoUrl(src);
    if (!portableSrc) return null;
    // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy; next/image can't size a remote proxy
    return <img src={portableSrc} alt={alt || "Place photo"} width={640} height={400} loading="lazy" className="chat-photo" />;
  },
};

export function AssistantMessage({ content, blocks, handlers, streaming }: { content: string; blocks?: AssistantBlock[]; handlers?: BlockHandlers; streaming?: boolean }) {
  // sanitizeAssistantContent (the allowedUrls link/image allow-list) only runs once, on the
  // fully-assembled text, right before it's persisted — the raw provider bytes are what's
  // rendered live during streaming. Markdown-parsing that raw text would make an
  // unvetted link or image clickable/visible for the whole streaming window, before the
  // allow-list ever gets a chance to strip it. Plain text during streaming is inert (no <a>,
  // no <img> can come out of it); the real Markdown render only ever sees already-sanitized text.
  if (streaming) {
    return (
      <div className="chat-prose">
        <p style={{ whiteSpace: "pre-wrap" }}>{content}</p>
      </div>
    );
  }
  return (
    <div className="chat-prose">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        components={components}
      >
        {content}
      </Markdown>
      {blocks && blocks.length > 0 && handlers ? <MessageBlocks blocks={blocks} {...handlers} /> : null}
    </div>
  );
}
