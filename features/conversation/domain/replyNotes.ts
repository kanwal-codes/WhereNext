/** Human names for the providers RETRIEVE may report as unavailable. */
const PROVIDER_LABEL: Record<string, string> = {
  liteapi: "hotel rates",
  duffel: "flight fares",
  ticketmaster: "events",
  eventbrite: "events",
  "google-routes": "transit",
  "transit-app": "transit",
  mapbox: "directions",
  openweather: "the weather",
  tavily: "the web",
  "google-places": "places",
};

export const unavailableLabels = (names?: string[]) => Array.from(new Set((names ?? []).map((name) => PROVIDER_LABEL[name] ?? name)));

/** "www.example.com/path" → "example.com": which site a source is, at a glance. */
export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
