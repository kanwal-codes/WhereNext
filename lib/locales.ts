/** Languages Roam is offered in (BCP-47) and ISO 3166 countries — names come from Intl, so nothing is translated by hand. */
export const LANGUAGES = "en fr es de it pt nl sv da no fi pl cs el tr ru uk ar he fa hi bn ur pa ta te mr gu id ms th vi fil zh ja ko".split(" ");

export const COUNTRIES = (
  "AL DZ AR AM AU AT AZ BH BD BY BE BO BA BR BG KH CA CL CN CO CR HR CU CY CZ DK DO EC EG SV EE ET FI FR GE DE GH GR GT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KW LV LB LT LU MY MV MT MX MD MA NP NL NZ NI NG MK NO OM PK PA PY PE PH PL PT PR QA RO RU SA RS SG SK SI ZA KR ES LK SE CH TW TZ TH TT TN TR UG UA AE GB US UY UZ VE VN ZW"
).split(" ");

export function displayName(type: "language" | "region", code: string, locale = "en"): string {
  try {
    return new Intl.DisplayNames([locale], { type }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** "fr-CA" → { language: "fr", country: "CA" }, kept only when it is one we offer. */
export function fromBrowserLocale(locale: string | undefined): { language?: string; country?: string } {
  const [lang, region] = (locale ?? "").split("-");
  const language = lang?.toLowerCase();
  const country = region?.toUpperCase();
  return { language: language && LANGUAGES.includes(language) ? language : undefined, country: country && COUNTRIES.includes(country) ? country : undefined };
}
