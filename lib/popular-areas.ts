/**
 * Where people actually go inside a place too big to search as one (a country, a state or province, a famous region). They are the first rows of the
 * "Where in <place>?" sheet, so narrowing a trip to "Portugal" is one tap and needs no typing; anything not here is found by searching. Keys are
 * lower case; values are cities and sub-regions in the order people usually ask for them. Pure data.
 */
const POPULAR_AREAS: Record<string, string[]> = {
  // Europe
  portugal: ["Lisbon", "Porto", "Algarve", "Sintra", "Madeira", "Azores"],
  spain: ["Barcelona", "Madrid", "Seville", "Valencia", "Granada", "Ibiza", "Mallorca"],
  france: ["Paris", "Nice", "Lyon", "Marseille", "Bordeaux", "Provence"],
  italy: ["Rome", "Florence", "Venice", "Milan", "Naples", "Amalfi Coast"],
  germany: ["Berlin", "Munich", "Hamburg", "Cologne", "Frankfurt", "Dresden"],
  "united kingdom": ["London", "Edinburgh", "Manchester", "Bath", "Oxford", "Cotswolds"],
  uk: ["London", "Edinburgh", "Manchester", "Bath", "Oxford", "Cotswolds"],
  england: ["London", "Manchester", "Bath", "Oxford", "Liverpool", "Cotswolds"],
  scotland: ["Edinburgh", "Glasgow", "Isle of Skye", "Inverness", "St Andrews"],
  ireland: ["Dublin", "Galway", "Cork", "Killarney", "Dingle"],
  netherlands: ["Amsterdam", "Rotterdam", "Utrecht", "The Hague"],
  greece: ["Athens", "Santorini", "Mykonos", "Crete", "Rhodes", "Thessaloniki"],
  turkey: ["Istanbul", "Cappadocia", "Antalya", "Bodrum", "Izmir"],
  croatia: ["Dubrovnik", "Split", "Hvar", "Zagreb", "Zadar"],
  switzerland: ["Zurich", "Geneva", "Lucerne", "Interlaken", "Zermatt"],
  austria: ["Vienna", "Salzburg", "Innsbruck", "Hallstatt"],
  tuscany: ["Florence", "Siena", "Pisa", "Lucca", "San Gimignano"],
  andalusia: ["Seville", "Granada", "Málaga", "Córdoba", "Marbella"],
  // Africa and the Middle East
  morocco: ["Marrakech", "Fes", "Casablanca", "Chefchaouen", "Essaouira"],
  egypt: ["Cairo", "Luxor", "Aswan", "Sharm El Sheikh", "Hurghada"],
  "south africa": ["Cape Town", "Johannesburg", "Durban", "Kruger National Park", "Stellenbosch"],
  "united arab emirates": ["Dubai", "Abu Dhabi", "Sharjah"],
  uae: ["Dubai", "Abu Dhabi", "Sharjah"],
  // Asia
  india: ["Delhi", "Mumbai", "Jaipur", "Goa", "Agra", "Kerala", "Bengaluru"],
  rajasthan: ["Jaipur", "Udaipur", "Jodhpur", "Jaisalmer", "Pushkar"],
  kerala: ["Kochi", "Munnar", "Alleppey", "Varkala", "Kovalam"],
  thailand: ["Bangkok", "Chiang Mai", "Phuket", "Krabi", "Koh Samui"],
  vietnam: ["Hanoi", "Ho Chi Minh City", "Da Nang", "Hoi An", "Ha Long Bay"],
  indonesia: ["Bali", "Jakarta", "Yogyakarta", "Lombok", "Ubud"],
  japan: ["Tokyo", "Kyoto", "Osaka", "Hokkaido", "Hiroshima", "Okinawa"],
  "south korea": ["Seoul", "Busan", "Jeju", "Gyeongju"],
  china: ["Beijing", "Shanghai", "Chengdu", "Xi'an", "Guilin", "Hong Kong"],
  // Oceania
  australia: ["Sydney", "Melbourne", "Brisbane", "Perth", "Cairns", "Gold Coast"],
  "new zealand": ["Auckland", "Queenstown", "Wellington", "Rotorua", "Christchurch"],
  // The Americas
  "united states": ["New York City", "Los Angeles", "San Francisco", "Chicago", "Miami", "Las Vegas"],
  usa: ["New York City", "Los Angeles", "San Francisco", "Chicago", "Miami", "Las Vegas"],
  california: ["Los Angeles", "San Francisco", "San Diego", "Palm Springs", "Santa Barbara"],
  florida: ["Miami", "Orlando", "Key West", "Tampa", "Fort Lauderdale"],
  texas: ["Austin", "Houston", "Dallas", "San Antonio"],
  hawaii: ["Honolulu", "Maui", "Kauai", "Big Island"],
  canada: ["Toronto", "Vancouver", "Montreal", "Banff", "Quebec City", "Niagara Falls"],
  ontario: ["Toronto", "Niagara Falls", "Ottawa", "Prince Edward County", "Muskoka"],
  quebec: ["Montreal", "Quebec City", "Mont-Tremblant", "Gaspé"],
  "british columbia": ["Vancouver", "Victoria", "Whistler", "Kelowna", "Tofino"],
  alberta: ["Banff", "Calgary", "Jasper", "Lake Louise", "Edmonton"],
  mexico: ["Mexico City", "Tulum", "Cancún", "Oaxaca", "Playa del Carmen", "Puerto Vallarta"],
  brazil: ["Rio de Janeiro", "São Paulo", "Salvador", "Florianópolis", "Iguazu Falls"],
  argentina: ["Buenos Aires", "Mendoza", "Patagonia", "Bariloche", "Salta"],
  peru: ["Cusco", "Lima", "Machu Picchu", "Arequipa", "Sacred Valley"],
  colombia: ["Bogotá", "Medellín", "Cartagena", "Santa Marta"],
};

const key = (name: string) => name.trim().toLowerCase();

/** The usual places inside `name`, or none when it is not one of the big ones listed. */
export function popularAreasFor(name: string | null | undefined): string[] {
  return name ? POPULAR_AREAS[key(name)] ?? [] : [];
}

/** True for a place that has well-known places inside it. */
export const hasPopularAreas = (name: string | null | undefined): boolean => popularAreasFor(name).length > 0;
