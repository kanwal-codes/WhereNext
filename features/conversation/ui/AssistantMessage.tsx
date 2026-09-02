import React from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { MessageBlocks, type BlockHandlers } from "./blocks/MessageBlocks";

export type { BlockHandlers };

// Same shape enforced by the server photo proxy: /api/trips/<uuid>/places/google/photo?name=...
const PROXY_PHOTO_URL = /^(?:https?:\/\/[^/\s]+)?\/api\/trips\/[0-9a-f-]{36}\/places\/google\/photo\?name=.+/i;

export function isProxyPhotoUrl(src: unknown): src is string {
  return typeof src === "string" && PROXY_PHOTO_URL.test(src);
}

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
    if (!isProxyPhotoUrl(src)) return null;
    // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy; next/image can't size a remote proxy
    return <img src={src} alt={alt || "Place photo"} width={640} height={400} loading="lazy" className="chat-photo" />;
  },
};

export function AssistantMessage({ content, blocks, handlers }: { content: string; blocks?: AssistantBlock[]; handlers?: BlockHandlers }) {
  return (
    <div className="chat-markdown">
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
