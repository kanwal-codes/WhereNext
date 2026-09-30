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

// While text is still arriving it has not been through the link/image allow-list, so nothing clickable or
// visible may come out of it: links render as their plain text and images not at all. Everything else (paragraphs,
// lists, emphasis) renders as Markdown right away, so the reply no longer re-flows when it finishes.
const streamingComponents: Components = {
  a({ children }) {
    return <>{children}</>;
  },
  img() {
    return null;
  },
};

export function AssistantMessage({ content, blocks, handlers, streaming, live }: { content: string; blocks?: AssistantBlock[]; handlers?: BlockHandlers; streaming?: boolean; live?: boolean }) {
  if (streaming) {
    return (
      <div className="chat-prose">
        <Markdown remarkPlugins={[remarkGfm]} skipHtml allowedElements={ALLOWED_ELEMENTS} unwrapDisallowed components={streamingComponents}>
          {content}
        </Markdown>
      </div>
    );
  }
  // The reply text is prose; the cards after it are not — they sit beside it, outside the prose
  // wrapper, so its list, table and link styles never reach into a card.
  return (
    <div>
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
      </div>
      {blocks && blocks.length > 0 && handlers ? <MessageBlocks blocks={blocks} {...handlers} replyText={content} live={live} /> : null}
    </div>
  );
}
