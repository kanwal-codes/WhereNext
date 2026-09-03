import { lookup } from "node:dns/promises";
import net from "node:net";
import { withProviderTimeout } from "@/packages/providers/request-signal";

/**
 * SSRF-guarded fetch for user-supplied URLs (trip import). Security boundary —
 * do not simplify:
 *  - https only (http allowed only with `allowHttp`, still IP-checked)
 *  - every resolved address must be a public unicast IP (no loopback, private,
 *    link-local, CGNAT, ULA, unspecified, multicast)
 *  - redirects followed manually, re-resolved and re-checked at every hop
 *  - response body streamed with a hard byte cap
 *
 * ponytail: re-resolves per redirect, but a DNS rebind between this check and
 * the kernel's connect() is out of scope — mitigating that needs a pinned-IP
 * agent. Acceptable for pulling a public itinerary page.
 */

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function assertPublicIp(ip: string): void {
  const v = net.isIP(ip);
  if (v === 0) throw new UnsafeUrlError(`unresolvable address: ${ip}`);

  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    const bad =
      a === 0 || a === 10 || a === 127 || // this-net, private, loopback
      (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
      (a === 169 && b === 254) || // link-local
      (a === 172 && b >= 16 && b <= 31) || // private 172.16/12
      (a === 192 && b === 168) || // private
      (a === 192 && b === 0) || // 192.0.0/24 + 192.0.2/24 (TEST-NET)
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224; // multicast + reserved + 255.255.255.255
    if (bad) throw new UnsafeUrlError(`non-public IPv4: ${ip}`);
    return;
  }

  // IPv6
  const low = ip.toLowerCase();
  if (low === "::" || low === "::1") throw new UnsafeUrlError(`non-public IPv6: ${ip}`);
  if (low.startsWith("fe80") || low.startsWith("fc") || low.startsWith("fd")) throw new UnsafeUrlError(`non-public IPv6: ${ip}`); // link-local + ULA
  if (low.startsWith("ff")) throw new UnsafeUrlError(`multicast IPv6: ${ip}`);
  // IPv4-mapped ::ffff:a.b.c.d — check the embedded v4
  const mapped = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) assertPublicIp(mapped[1]);
}

async function assertHostResolvesPublic(hostname: string): Promise<void> {
  // A bare IP literal in the URL: check it directly (DNS won't be consulted).
  if (net.isIP(hostname)) {
    assertPublicIp(hostname);
    return;
  }
  const records = await lookup(hostname, { all: true }).catch(() => {
    throw new UnsafeUrlError(`cannot resolve host: ${hostname}`);
  });
  if (!records.length) throw new UnsafeUrlError(`cannot resolve host: ${hostname}`);
  for (const { address } of records) assertPublicIp(address);
}

function assertAllowedUrl(url: URL, allowHttp: boolean): void {
  if (url.protocol === "https:") return;
  if (url.protocol === "http:" && allowHttp) return;
  throw new UnsafeUrlError(`unsupported scheme: ${url.protocol}`);
}

export type SafeFetchOptions = { allowHttp?: boolean; signal?: AbortSignal };

/** Fetch `rawUrl` with SSRF checks at every hop. Returns the final Response (body not yet read). */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<Response> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("not a valid URL");
  }

  const signal = withProviderTimeout(opts.signal, TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertAllowedUrl(url, opts.allowHttp ?? false);
    await assertHostResolvesPublic(url.hostname);

    const response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { "user-agent": "WhereNextBot/1.0 (+trip import)", accept: "text/html,application/xhtml+xml" },
    });

    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      const next = new URL(response.headers.get("location")!, url);
      url = next;
      continue;
    }
    return response;
  }
  throw new UnsafeUrlError("too many redirects");
}

/** Read a Response body as text with a hard byte cap. */
export async function readCapped(response: Response, maxBytes = MAX_BYTES): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}
