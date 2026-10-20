import { useEffect, useRef, useState } from "react";
import { notifyToast } from "@/lib/application/toast";
import { countryFromPlace, displayName, fromBrowserLocale } from "@/lib/locales";
import type { TravelerProfile } from "@/packages/contracts/profile";

/** The profile fields on the account page, as they are being edited. `touch` marks the page as having unsaved changes. */
export function useAccountForm({ initialName, email, profile, touch }: { initialName: string; email: string; profile: TravelerProfile; touch: () => void }) {
  const [name, setName] = useState(initialName);
  const [emailDraft, setEmailDraft] = useState(email);
  const [airport, setAirport] = useState(profile.homeAirport ?? "");
  const [airportText, setAirportText] = useState(profile.homeAirport ?? "");
  const [city, setCity] = useState(profile.homeCity ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [language, setLanguage] = useState(profile.language ?? "");
  const [country, setCountry] = useState(profile.country ?? "");
  // Once the traveller picks a country themselves, typing a city no longer changes it.
  const countryChosen = useRef(Boolean(profile.country));
  const changeCity = (value: string) => {
    setCity(value);
    // A city that names its country sets the home country, until the traveller sets it by hand.
    const named = countryFromPlace(value);
    if (named && !countryChosen.current) setCountry(named);
    touch();
  };
  const [detected, setDetected] = useState<{ language?: string; country?: string }>({});
  useEffect(() => setDetected(fromBrowserLocale(navigator.language)), []);
  // A home city saved without a country: the city already says which, so fill it in and keep it.
  useEffect(() => {
    const named = !profile.country ? countryFromPlace(profile.homeCity) : undefined;
    if (!named) return;
    setCountry(named);
    void fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ country: named }) }).then((r) => {
      if (r.ok) notifyToast(`Home country set to ${displayName("region", named)}, from your home city.`, "success");
    });
  }, [profile.country, profile.homeCity]);
  const [notif, setNotif] = useState({ trips: true, prices: true, collab: true, weekly: false, product: false, ...profile.notifications });

  return { name, setName, emailDraft, setEmailDraft, airport, setAirport, airportText, setAirportText, city, changeCity, language, setLanguage, country, setCountry, countryChosen, bio, setBio, detected, notif, setNotif };
}
