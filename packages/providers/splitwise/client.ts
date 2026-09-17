import { z } from "zod";
import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";
import { roundMoney } from "@/lib/currency";

const AUTH_BASE = "https://www.splitwise.com";
const API = "https://secure.splitwise.com/api/v3.0";

function oauthCredentials() {
  const clientId = process.env.SPLITWISE_CLIENT_ID;
  const clientSecret = process.env.SPLITWISE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("SPLITWISE_CLIENT_ID/SPLITWISE_CLIENT_SECRET are not configured");
  return { clientId, clientSecret };
}

/** Where to send the user to authorize this app. `state` is an opaque CSRF token the caller
 *  must generate, store server-side, and verify on the callback. */
export function getAuthorizeUrl(redirectUri: string, state: string): string {
  const { clientId } = oauthCredentials();
  const params = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: redirectUri, state });
  return `${AUTH_BASE}/oauth/authorize?${params}`;
}

export type SplitwiseToken = { accessToken: string; refreshToken: string | null; expiresAt: string | null };

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
});

async function parseTokenResponse(response: Response, action: string): Promise<SplitwiseToken> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Splitwise ${action} failed: ${response.status} ${JSON.stringify(body)}`);
  const parsed = tokenResponseSchema.parse(body);
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    expiresAt: parsed.expires_in ? new Date(Date.now() + parsed.expires_in * 1000).toISOString() : null,
  };
}

/** Exchange the authorization code from the callback for an access (and maybe refresh) token. */
export async function exchangeCode(code: string, redirectUri: string, signal?: AbortSignal): Promise<SplitwiseToken> {
  const { clientId, clientSecret } = oauthCredentials();
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri });
  const response = await guardedFetch("splitwise", `${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: withProviderTimeout(signal),
  });
  return parseTokenResponse(response, "token exchange");
}

/** Splitwise's OAuth2 tokens may or may not expire depending on the app's own settings — this
 *  is only exercised for accounts that were actually issued a refresh token. */
export async function refreshAccessToken(refreshToken: string, signal?: AbortSignal): Promise<SplitwiseToken> {
  const { clientId, clientSecret } = oauthCredentials();
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken });
  const response = await guardedFetch("splitwise", `${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: withProviderTimeout(signal),
  });
  return parseTokenResponse(response, "token refresh");
}

const AUTH_HEADERS = (accessToken: string) => ({ authorization: `Bearer ${accessToken}`, accept: "application/json" });

async function api<T>(accessToken: string, path: string, init: Parameters<typeof fetch>[1] | undefined, signal: AbortSignal | undefined): Promise<T> {
  const response = await guardedFetch("splitwise", `${API}${path}`, {
    ...init,
    headers: { ...AUTH_HEADERS(accessToken), ...(init?.headers ?? {}) },
    signal: withProviderTimeout(signal),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Splitwise API ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  return body as T;
}

export type SplitwiseUser = { id: number; firstName: string; lastName: string; email: string };

export async function getCurrentUser(accessToken: string, signal?: AbortSignal): Promise<SplitwiseUser> {
  const body = await api<{ user: { id: number; first_name: string; last_name: string; email: string } }>(accessToken, "/get_current_user", undefined, signal);
  return { id: body.user.id, firstName: body.user.first_name, lastName: body.user.last_name, email: body.user.email };
}

/** One Splitwise group per trip, created lazily on the trip's first expense. Members beyond
 *  the connecting user are added by email — Splitwise merges/invites as appropriate on its side. */
export async function createGroup(accessToken: string, name: string, memberEmails: string[], signal?: AbortSignal): Promise<number> {
  const params = new URLSearchParams({ name, group_type: "trip" });
  memberEmails.forEach((email, i) => params.set(`users__${i}__email`, email));
  const body = await api<{ group: { id: number } }>(accessToken, "/create_group", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  }, signal);
  return body.group.id;
}

export type SplitwiseDebt = { fromUserId: number; toUserId: number; amount: string; currency: string };

/** Simplified pairwise debts for the group — "who owes whom" after netting, not the raw
 *  per-expense ledger. */
export async function getGroupBalances(accessToken: string, groupId: number, signal?: AbortSignal): Promise<SplitwiseDebt[]> {
  const body = await api<{ group: { simplified_debts: Array<{ from: number; to: number; amount: string; currency_code: string }> } }>(
    accessToken,
    `/get_group/${groupId}`,
    undefined,
    signal,
  );
  return body.group.simplified_debts.map((d) => ({ fromUserId: d.from, toUserId: d.to, amount: d.amount, currency: d.currency_code }));
}

export type SplitwiseExpense = { id: number; description: string; cost: string; currency: string };

/** Split equally among every current group member — the only split style this app's UI offers;
 *  Splitwise itself supports uneven shares, but nothing here composes that yet. */
export async function createExpense(accessToken: string, groupId: number, description: string, cost: number, currency: string, signal?: AbortSignal): Promise<SplitwiseExpense> {
  const params = new URLSearchParams({
    // roundMoney first — plain `.toFixed(2)` on a 3+-decimal amount can round the wrong way
    // (e.g. `(1.005).toFixed(2)` is "1.00", not "1.01" — see roundMoney's own doc comment).
    // The caller (the expenses route) already rounds before this, but a raw amount reaching
    // here directly must still come out correct, not just whatever toFixed happens to do.
    cost: roundMoney(cost).toFixed(2),
    description,
    currency_code: currency,
    group_id: String(groupId),
    split_equally: "true",
  });
  const body = await api<{ expenses: Array<{ id: number; description: string; cost: string; currency_code: string }> }>(accessToken, "/create_expense", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  }, signal);
  const created = body.expenses[0];
  if (!created) throw new Error("Splitwise create_expense returned no expense");
  return { id: created.id, description: created.description, cost: created.cost, currency: created.currency_code };
}
