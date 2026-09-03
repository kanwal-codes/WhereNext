import { logger } from "@/lib/server/logger";

type SendArgs = { to: string; subject: string; html: string; text: string };

/**
 * Transactional email via Resend's REST API (no SDK — one endpoint). A no-op that
 * logs a warning when RESEND_API_KEY / EMAIL_FROM are unset, so a missing config
 * degrades to "share the link by hand" rather than a 500. Returns whether it sent.
 */
export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    logger.warn({ to, subject }, "email skipped — RESEND_API_KEY / EMAIL_FROM not configured");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!res.ok) {
      logger.error({ status: res.status, body: await res.text().catch(() => "") }, "resend send failed");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, "resend send threw");
    return false;
  }
}
