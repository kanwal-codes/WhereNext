import { describe, expect, it } from "vitest";
import { safeFetch, UnsafeUrlError } from "../../lib/server/safe-fetch";

// These URLs use IP literals, so the guard rejects them before any socket opens.
describe("safeFetch SSRF guard", () => {
  it("rejects the cloud metadata address", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/", { allowHttp: true })).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects loopback", async () => {
    await expect(safeFetch("http://127.0.0.1:8080/", { allowHttp: true })).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(safeFetch("https://[::1]/", {})).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects RFC1918 and CGNAT ranges", async () => {
    for (const host of ["10.0.0.5", "172.16.9.9", "192.168.1.1", "100.100.0.1"]) {
      await expect(safeFetch(`https://${host}/`, {})).rejects.toBeInstanceOf(UnsafeUrlError);
    }
  });

  it("rejects a non-http scheme", async () => {
    await expect(safeFetch("file:///etc/passwd", {})).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(safeFetch("ftp://example.com/x", {})).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects plain http unless allowHttp is set", async () => {
    await expect(safeFetch("http://93.184.216.34/", {})).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});
