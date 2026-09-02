import { withProviderTimeout } from "../request-signal";

export type ActivityResult = { name: string; description: string; url?: string; price?: string; imageUrl?: string };

export async function activities(location: { latitude: number; longitude: number }, signal?: AbortSignal): Promise<ActivityResult[]> {
  const clientId = process.env.AMADEUS_CLIENT_ID;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Amadeus credentials are not configured");
  const tokenResponse = await fetch("https://test.api.amadeus.com/v1/security/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }), signal: withProviderTimeout(signal) });
  if (!tokenResponse.ok) throw new Error(`Amadeus authentication failed: ${tokenResponse.status}`);
  const token = (await tokenResponse.json() as { access_token?: string }).access_token;
  if (!token) throw new Error("Amadeus token was not returned");
  const url = new URL("https://test.api.amadeus.com/v1/shopping/activities");
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("radius", "20");
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: withProviderTimeout(signal) });
  if (!response.ok) throw new Error(`Amadeus activities failed: ${response.status}`);
  const body = await response.json() as { data?: Array<{ name?: string; shortDescription?: string; bookingLink?: string; price?: { amount?: string; currencyCode?: string }; pictures?: string[] }> };
  return (body.data ?? []).flatMap((item) => item.name ? [{ name: item.name, description: item.shortDescription ?? "", url: item.bookingLink, price: item.price?.amount && item.price.currencyCode ? `${item.price.amount} ${item.price.currencyCode}` : undefined, imageUrl: item.pictures?.[0] }] : []).slice(0, 6);
}
