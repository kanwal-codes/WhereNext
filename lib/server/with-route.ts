import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { runWithContext } from "@/lib/server/request-context";
import { logger } from "@/lib/server/logger";

type RouteParams = Record<string, string | string[] | undefined>;
type RouteCtx<P extends RouteParams> = { params: Promise<P> };
type RouteHandler<P extends RouteParams = RouteParams> = (
  request: Request,
  ctx: RouteCtx<P>,
) => Response | Promise<Response>;

const QUIET_ROUTES = new Set(["/api/health"]);

/** Typographic apostrophes in the message a person will read ("couldn't" → "couldn’t"), applied once here so no route has to remember. */
const curl = (text: string) => text.replace(/(\p{L})'(\p{L})/gu, "$1’$2");

/** An error response's `error` text, with curly apostrophes. Successful and non-JSON responses pass through untouched and unread. */
async function polishError(response: Response): Promise<Response> {
  if (response.status < 400 || !response.headers.get("content-type")?.includes("application/json")) return response;
  try {
    const body = (await response.clone().json()) as { error?: unknown };
    if (typeof body?.error !== "string" || !body.error.includes("'")) return response;
    const headers = new Headers(response.headers);
    headers.delete("content-length"); // the text changed length
    return new NextResponse(JSON.stringify({ ...body, error: curl(body.error) }), { status: response.status, headers });
  } catch {
    return response;
  }
}

/**
 * Wraps a route handler with a per-request context (requestId + route + tripId),
 * one structured access-log line, and a catch-all that logs the stack for any
 * error the handler didn't turn into its own Response.
 *
 *   export const GET = withRoute(async (request, { params }) => { ... });
 *
 * Keep the handler's own try/catch (domain 400/404/409/503). This only adds the
 * envelope. Node runtime only — do not use in `middleware.ts` or edge routes.
 */
export function withRoute<P extends RouteParams = RouteParams>(handler: RouteHandler<P>): RouteHandler<P> {
  return async (request, ctx) => {
    const requestId = crypto.randomUUID();
    const { pathname } = new URL(request.url);
    const params = (await Promise.resolve(ctx?.params ?? {}).catch(() => ({}))) as P;
    const tripId = typeof params.tripId === "string" ? params.tripId : undefined;
    const forwardedCtx = { params: Promise.resolve(params) };

    return runWithContext({ requestId, route: pathname, method: request.method, tripId }, async () => {
      const started = performance.now();
      try {
        const response = await polishError(await handler(request, forwardedCtx));
        const durationMs = Math.round(performance.now() - started);
        if (!QUIET_ROUTES.has(pathname)) {
          const line = { status: response.status, durationMs };
          if (response.status >= 500) logger.error(line, "route 5xx");
          else if (response.status >= 400) logger.warn(line, "route 4xx");
          else logger.info(line, "route ok");
        }
        response.headers.set("x-request-id", requestId);
        return response;
      } catch (err) {
        const durationMs = Math.round(performance.now() - started);
        logger.error({ err, durationMs }, "unhandled route error");
        return NextResponse.json({ error: "Something went wrong. Try again in a moment." }, { status: 500, headers: { "x-request-id": requestId } });
      }
    });
  };
}

/**
 * Log an unexpected error, then return the user-facing JSON. Use in a route's own
 * catch tail in place of a bare `NextResponse.json({ error }, { status })`:
 *
 *   catch (error) { return tripAuthResponse(error) ?? fail(error, "Stays are unavailable right now"); }
 */
export function fail(error: unknown, message: string, status = 503): NextResponse {
  logger.error({ err: error }, message);
  return NextResponse.json({ error: message }, { status });
}

/**
 * JSON with a fingerprint of itself, for a route the client re-reads often and that usually hasn't changed
 * (each chat's history: refetched on every mount, and every 30 s while the group chat is open as a safety
 * net for a dropped realtime socket). The browser revalidates with `if-none-match` and gets an empty 304
 * instead of the whole history again — ~120 KB a poll, ~14 MB an hour with the chat open.
 * Private: this is one member's view of the trip, never a shared cache's to hold.
 */
export function jsonRevalidated(request: Request, data: unknown): Response {
  const body = JSON.stringify(data);
  const etag = `W/"${createHash("sha1").update(body).digest("base64url")}"`;
  const headers = { etag, "cache-control": "private, no-cache" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { ...headers, "content-type": "application/json" } });
}
