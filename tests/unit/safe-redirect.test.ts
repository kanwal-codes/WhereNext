import { describe, expect, it } from "vitest";
import { safeRedirect } from "@/lib/client/safe-redirect";

describe("safeRedirect", () => {
  it("keeps internal paths, with queries and hashes", () => {
    expect(safeRedirect("/trips/new", "/x")).toBe("/trips/new");
    expect(safeRedirect("/join/abc123?x=1#y", "/x")).toBe("/join/abc123?x=1#y");
  });

  it("falls back for missing values and other sites", () => {
    expect(safeRedirect(null, "/x")).toBe("/x");
    expect(safeRedirect("", "/x")).toBe("/x");
    expect(safeRedirect("https://evil.com", "/x")).toBe("/x");
    expect(safeRedirect("//evil.com", "/x")).toBe("/x");
    expect(safeRedirect("javascript:alert(1)", "/x")).toBe("/x");
  });

  it("refuses the backslash and control-character tricks browsers read as a second slash", () => {
    expect(safeRedirect("/\\evil.com", "/x")).toBe("/x");
    expect(safeRedirect("/\t/evil.com", "/x")).toBe("/x");
    expect(safeRedirect("/\n/evil.com", "/x")).toBe("/x");
    expect(safeRedirect("/%5Cevil.com", "/x")).toBe("/%5Cevil.com"); // stays on this site: the server decodes it as a path, not an authority
  });
});
