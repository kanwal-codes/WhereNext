import { describe, expect, it } from "vitest";
import { fileProblem, isOwnFile, safeFileName, sizeLabel } from "../../lib/reservation-files";

describe("fileProblem", () => {
  it("accepts a PDF and a phone photo", () => {
    expect(fileProblem({ name: "t.pdf", size: 200_000, type: "application/pdf" })).toBeNull();
    expect(fileProblem({ name: "t.heic", size: 4_000_000, type: "image/heic" })).toBeNull();
  });
  it("rejects other types, empty and oversized files, and too many", () => {
    expect(fileProblem({ name: "t.exe", size: 10, type: "application/x-msdownload" })).toMatch(/PDF or a photo/);
    expect(fileProblem({ name: "t.pdf", size: 0, type: "application/pdf" })).toMatch(/empty/);
    expect(fileProblem({ name: "t.pdf", size: 11 * 1024 * 1024, type: "application/pdf" })).toMatch(/10 MB/);
    expect(fileProblem({ name: "t.pdf", size: 1, type: "application/pdf" }, 10)).toMatch(/up to 10/);
  });
});

describe("safeFileName and isOwnFile", () => {
  it("strips folders and odd characters", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("Flight ticket (TAP) #1.pdf")).toBe("Flight-ticket-TAP-1.pdf");
    expect(safeFileName("///")).toBe("file");
  });
  it("only accepts a path inside the reservation's own folder", () => {
    expect(isOwnFile("t1/r1/abc-ticket.pdf", "t1", "r1")).toBe(true);
    expect(isOwnFile("t1/r2/abc.pdf", "t1", "r1")).toBe(false);
    expect(isOwnFile("t1/r1/../r2/abc.pdf", "t1", "r1")).toBe(false);
    expect(isOwnFile("t1/r1/sub/abc.pdf", "t1", "r1")).toBe(false);
  });
  it("labels sizes", () => {
    expect(sizeLabel(2048)).toBe("2 KB");
    expect(sizeLabel(3.5 * 1024 * 1024)).toBe("3.5 MB");
  });
});
