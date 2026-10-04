import { describe, expect, it } from "vitest";
import { describeAuthError } from "@/features/identity/application/saveErrors";

describe("describeAuthError", () => {
  it.each([
    [{ code: "email_exists", status: 422, message: "A user with this email address has already been registered" }, "exists"],
    [{ message: "User already registered" }, "exists"],
    [{ code: "invalid_credentials", status: 400, message: "Invalid login credentials" }, "wrong-password"],
    [{ code: "email_not_confirmed", status: 400, message: "Email not confirmed" }, "unconfirmed"],
    [{ code: "weak_password", status: 422, message: "Password should contain letters and digits" }, "weak"],
    [{ code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" }, "rate"],
    [{ status: 429, message: "Too many requests" }, "rate"],
    [{ code: "email_address_invalid", status: 400, message: "Email address \"a@b\" is invalid" }, "bad-email"],
    [{ code: "validation_failed", status: 422, message: "Unable to validate email address: invalid format" }, "bad-email"],
    [{ code: "session_not_found", status: 403, message: "Session from session_id claim in JWT does not exist" }, "session"],
    [{ message: "Auth session missing!" }, "session"],
    [{ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }, "network"],
    [{ code: "something_new", status: 500, message: "boom" }, "other"],
    [null, "other"],
  ])("%j → %s", (error, kind) => {
    expect(describeAuthError(error).kind).toBe(kind);
  });

  it("never shows raw provider text", () => {
    expect(describeAuthError({ code: "email_exists", message: "A user with this email address has already been registered" }).message).not.toMatch(/registered/);
  });
});
