import { escapeHtml } from "./email";

/**
 * Hex twins of the app's own oklch tokens (app/globals.css — ink, surface, hairline, muted
 * foreground), for the one surface in the app that can't read a CSS custom property: email
 * clients. Same category as lib/map-colors.ts's hex twins for Mapbox. Computed once from the
 * actual --foreground/--surface/--border/--muted-foreground oklch values, not eyeballed.
 */
export const EMAIL_INK = "#1b1611";
export const EMAIL_SURFACE = "#faf9f7";
export const EMAIL_HAIRLINE = "#e8e6e2";
export const EMAIL_MUTED = "#8f897f";
const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export type EmailButton = { label: string; url: string };

/**
 * The one branded shell every transactional email goes through: the WN mark + wordmark (the
 * same recipe as components/BrandMark.tsx — an ink square, no illustration), the body, an
 * optional primary action (ink pill, matching btn-primary — coral is the app's one accent and
 * stays out of the default action colour, same as everywhere else in the app), a quiet footer.
 * Table-based and inline-styled throughout: the only layout that survives Outlook and Gmail
 * stripping most modern CSS, unlike the rest of the app's stylesheet.
 */
export function emailShell({ bodyHtml, button, preheader }: { bodyHtml: string; button?: EmailButton; preheader?: string }): string {
  const buttonHtml = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px"><tr><td style="border-radius:999px;background-color:${EMAIL_INK}">
<a href="${escapeHtml(button.url)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;font-family:${FONT_STACK}">${escapeHtml(button.label)}</a>
</td></tr></table>`
    : "";
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 16px;background-color:${EMAIL_SURFACE};font-family:${FONT_STACK}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid ${EMAIL_HAIRLINE};border-radius:20px">
<tr><td style="padding:28px 32px 18px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:30px;height:30px;background-color:${EMAIL_INK};border-radius:8px;text-align:center;vertical-align:middle;font-family:${FONT_STACK};font-size:12px;font-weight:700;color:#ffffff">WN</td>
<td style="padding-left:10px;font-size:15px;font-weight:600;color:${EMAIL_INK};font-family:${FONT_STACK}">Where Next</td>
</tr></table>
</td></tr>
<tr><td style="padding:2px 32px 32px;font-size:15px;line-height:1.65;color:${EMAIL_INK};font-family:${FONT_STACK}">
${bodyHtml}${buttonHtml}
</td></tr>
</table>
<p style="margin:18px 0 0;font-size:12px;color:${EMAIL_MUTED};text-align:center;font-family:${FONT_STACK}">Sent by Where Next, because you're on a trip together.</p>
</td></tr></table>
</body>
</html>`;
}

/** A neutral stat callout for one figure — an amount, a count — isolated on its own line so it's
 *  easy to read at a glance and, crucially, easy to select and copy whole: an email can't run a
 *  copy-to-clipboard button, so this is the next best thing. Ink, not coral — a balance is a
 *  fact, not an action, and coral stays reserved for the one thing the reader should do. */
export function emailStat(label: string, value: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:14px 0"><tr><td style="background-color:${EMAIL_SURFACE};border:1px solid ${EMAIL_HAIRLINE};border-radius:16px;padding:18px 22px">
<div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${EMAIL_MUTED};font-family:${FONT_STACK}">${escapeHtml(label)}</div>
<div style="margin-top:4px;font-size:30px;font-weight:600;color:${EMAIL_INK};font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(value)}</div>
</td></tr></table>`;
}
