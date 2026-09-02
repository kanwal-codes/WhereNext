import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssistantMessage, isProxyPhotoUrl } from "../../features/conversation/ui/AssistantMessage";

const render = (content: string) => renderToStaticMarkup(<AssistantMessage content={content} />);
const PROXY = "/api/trips/00000000-0000-0000-0000-000000000000/places/google/photo?name=places%2F1%2Fphotos%2Fp1";

describe("AssistantMessage", () => {
  it("renders GFM tables", () => {
    const html = render("| Place | Type |\n|---|---|\n| Old Port | Historic |");
    expect(html).toContain("<table");
    expect(html).toContain("<td>Old Port</td>");
  });

  it("renders bullet lists and inline styles", () => {
    const html = render("- one\n- two\n- three");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(render("**bold**")).toContain("<strong>bold</strong>");
    expect(render("### Heading")).toContain("<h3>Heading</h3>");
  });

  it("keeps https links and opens them in a new tab", () => {
    const html = render("Read https://example.com/guide for details.");
    expect(html).toContain('href="https://example.com/guide"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noreferrer");
  });

  it("downgrades non-http links to plain text", () => {
    const html = render("[click me](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("click me");
  });

  it("strips raw HTML", () => {
    const html = render("hi <script>alert(1)</script> there");
    expect(html).not.toContain("<script>");
  });

  it("renders the authenticated photo proxy as an image", () => {
    const html = render(`![Museum](${PROXY})`);
    expect(html).toContain("<img");
    expect(html).toContain("/places/google/photo?name=");
  });

  it("blocks non-proxy images", () => {
    expect(render("![x](https://evil.example/x.png)")).not.toContain("<img");
    expect(render("![api](/api/trips/00000000-0000-0000-0000-000000000000/workspace)")).not.toContain("<img");
  });

  it("isProxyPhotoUrl accepts only the photo proxy", () => {
    expect(isProxyPhotoUrl(PROXY)).toBe(true);
    expect(isProxyPhotoUrl(`https://app.example${PROXY}`)).toBe(true);
    expect(isProxyPhotoUrl("/api/trips/00000000-0000-0000-0000-000000000000/workspace")).toBe(false);
    expect(isProxyPhotoUrl("https://evil.example/x.png")).toBe(false);
    expect(isProxyPhotoUrl(undefined)).toBe(false);
  });
});
