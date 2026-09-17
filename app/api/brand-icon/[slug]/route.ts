import { NextResponse } from "next/server";
import { cached } from "@/lib/server/ttl-cache";

/**
 * Same-origin favicon proxy for the handful of event/ticket providers we surface, so their
 * real marks can be shown without a cross-origin <img> (CSP) and without shipping brand
 * assets. Domains are a fixed allow-list — no user input reaches the fetch.
 */
const DOMAIN: Record<string, string> = {
  ticketmaster: "ticketmaster.com",
  eventbrite: "eventbrite.com",
  eventbriteapi: "eventbrite.com",
};

const DAY = 86_400_000;

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const domain = DOMAIN[slug.toLowerCase()];
  if (!domain) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  try {
    const icon = await cached(`brand-icon:${domain}`, 30 * DAY, async () => {
      const res = await fetch(`https://icons.duckduckgo.com/ip3/${domain}.ico`, {
        signal: AbortSignal.timeout(4000),
        headers: { accept: "image/*" },
      });
      if (!res.ok) throw new Error(`favicon ${res.status}`);
      const type = res.headers.get("content-type") ?? "image/x-icon";
      if (!type.toLowerCase().startsWith("image/")) throw new Error("not an image");
      const buf = Buffer.from(await res.arrayBuffer());
      return { b64: buf.toString("base64"), type };
    });
    return new Response(Buffer.from(icon.b64, "base64"), {
      headers: { "content-type": icon.type, "cache-control": "public, max-age=604800, immutable" },
    });
  } catch {
    return NextResponse.json({ error: "icon unavailable" }, { status: 502 });
  }
}
