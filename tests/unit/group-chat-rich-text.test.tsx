import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderRich } from "@/features/group-chat/ui/rich-text";
import { hasAsk } from "@/features/group-chat/domain/message";

const html = (text: string) => renderToStaticMarkup(<p>{renderRich(text)}</p>);

describe("group chat text", () => {
  it("turns an address into a link that opens in a new tab", () => {
    const out = html("see https://www.example.com/rooms/1?a=1 ok");
    expect(out).toContain('href="https://www.example.com/rooms/1?a=1"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("leaves the full stop after an address outside the link", () => {
    const out = html("book https://example.com/x.");
    expect(out).toContain('href="https://example.com/x"');
    expect(out).toContain("</a>.");
  });

  it("does not link a script address", () => {
    expect(html("javascript:alert(1)")).not.toContain("<a ");
  });

  it("colours @Roam", () => {
    expect(html("hey @roam, where?")).toContain("text-coral");
  });

  it("treats a bare mention as no question", () => {
    expect(hasAsk("@Roam ")).toBe(false);
    expect(hasAsk("@Roam")).toBe(false);
    expect(hasAsk("@Roam where to eat")).toBe(true);
    expect(hasAsk("where to eat")).toBe(true);
  });
});
