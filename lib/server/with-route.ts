import { NextResponse } from "next/server";
import { runWithContext, setContext } from "@/lib/server/request-context";
import { logger } from "@/lib/server/logger";

type RouteParams = Record<string, string | string[] | undefined>;
type RouteCtx<P extends RouteParams> = { params: Promise<P> };
type RouteHandler<P extends RouteParams = RouteParams> = (
  request: Request,
  ctx: RouteCtx<P>,
) => Response | Promise<Response>;

const QUIET_ROUTES = new Set(["/api/health"]);

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
        const response = await handler(request, forwardedCtx);
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

/** Attach identity to the live request context once auth resolves (called from requireTripMember paths as needed). */
export function tagContext(partial: { tripId?: string; userId?: string }): void {
  setContext(partial);
}
