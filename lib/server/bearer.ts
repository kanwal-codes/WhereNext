import { timingSafeEqual } from "node:crypto";

/** True when the request carries `Authorization: Bearer <secret>`. Compared in constant time, and false when no secret is configured. */
export function hasBearer(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
