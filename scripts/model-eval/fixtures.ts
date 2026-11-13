import type { RetrievedEvidence } from "../../lib/application/retrieve";
import { evidence, place } from "../../tests/support/fixture-evidence";

/**
 * Reply scenarios. The venues are INVENTED (nothing from Google is stored here), with the fields a real turn carries: category, rating,
 * review count, address, opening hours and whether it is open now. A model that names a place outside this list, quotes a number that is
 * not in it, or gives one place another's rating or hours is wrong, and the scorer can say so without a human reading the reply.
 */
export type Scenario = {
  id: string;
  query: string;
  lang: "en" | "es" | "fr";
  intent: string;
  focus: string;
  evidence: RetrievedEvidence;
  dislikes?: string[];
  /** Names the reply must not recommend (a stated dislike). */
  forbidden?: string[];
  /** A scenario where the right answer is to say little, because there is little. */
  thin?: boolean;
  /** Capitalised phrases that are fine without being in the evidence (the city, a neighbourhood the prompt names). */
  okPhrases?: string[];
};

const H = (open: string) => [`Monday: ${open}`, `Tuesday: ${open}`, `Wednesday: ${open}`, `Thursday: ${open}`, `Friday: ${open}`, `Saturday: ${open}`, `Sunday: ${open}`];
const P = (name: string, category: string, rating: number, count: number, address: string, hours?: string, openNow?: boolean) =>
  place(name, { category, rating, userRatingCount: count, address, ...(hours ? { openingHours: H(hours), openNow } : {}) } as never);

const CLUBS = [
  P("Marea Alta Club", "night_club", 4.4, 2310, "Carrer del Far 12, Platja Nova", "11:30 PM – 6:00 AM", true),
  P("Sol Dorado Beach Club", "restaurant", 4.5, 5120, "Passeig de la Mar 4, Platja Nova", "11:00 AM – 8:00 PM", false),
  P("La Cúpula", "night_club", 4.1, 880, "Plaça Major 3, Vila Vella", "10:00 PM – 5:00 AM", true),
  P("Bar Faro", "bar", 4.7, 1460, "Carrer del Port 9, Vila Vella", "6:00 PM – 2:00 AM", true),
  P("Hotel Estrella Rooftop", "lodging", 4.2, 640, "Avinguda del Sol 20, Platja Nova"),
  P("Noche Negra", "night_club", 3.8, 410, "Carrer Nou 7, Vila Vella"),
];
const RAMEN = [
  P("Kiri Ramen", "ramen_restaurant", 4.6, 1890, "88 College St, Little Italy", "11:30 AM – 10:00 PM", true),
  P("Tonkotsu House", "ramen_restaurant", 4.3, 760, "210 Queen St W, Entertainment District", "12:00 PM – 9:30 PM", true),
  P("Nori & Noodle", "japanese_restaurant", 4.4, 530, "14 Baldwin St, Kensington Market", "11:00 AM – 8:00 PM", true),
  P("Shio Bar", "ramen_restaurant", 4.8, 240, "5 Ossington Ave, Ossington", "5:00 PM – 11:00 PM", false),
  P("Mitsu Izakaya", "japanese_restaurant", 4.2, 1330, "120 Dundas St W, Downtown", "5:30 PM – 12:00 AM", false),
  P("Bowl & Broth", "restaurant", 3.9, 410, "300 Yonge St, Downtown", "11:00 AM – 9:00 PM", true),
];
const MUSEUMS = [
  P("Museu do Azulejo Velho", "museum", 4.6, 7340, "Rua da Madre de Deus 4, Beato", "10:00 AM – 6:00 PM", true),
  P("Galeria Luz", "art_gallery", 4.4, 980, "Rua do Século 55, Bairro Alto", "11:00 AM – 7:00 PM", true),
  P("Museu dos Descobrimentos", "museum", 4.5, 12_500, "Avenida da Índia 20, Belém", "9:30 AM – 5:30 PM", true),
  P("Casa da Moeda Antiga", "museum", 4.0, 1620, "Praça do Comércio 8, Baixa", "10:00 AM – 5:00 PM", true),
  P("Centro de Arte Moderna Sul", "art_gallery", 4.3, 3050, "Rua Nova 11, Chiado", "10:00 AM – 8:00 PM", true),
  P("Palácio das Flores", "tourist_attraction", 4.7, 15_800, "Largo das Flores 1, Sintra"),
];
const VEGAN = [P("Verde Vivo", "vegan_restaurant", 4.6, 310, "12 High St, Millbrook", "9:00 AM – 4:00 PM", true), P("The Green Spoon", "vegetarian_restaurant", 4.2, 150, "3 Mill Lane, Millbrook", "5:00 PM – 9:00 PM", false)];
const SEAFOOD_MIX = [
  P("Casa do Peixe", "seafood_restaurant", 4.6, 2800, "Rua das Gaivotas 3, Alfama", "12:00 PM – 10:30 PM", true),
  P("Taberna Brasa", "portuguese_restaurant", 4.5, 1900, "Rua do Forno 14, Alfama", "1:00 PM – 11:00 PM", true),
  P("Marisqueira do Cais", "seafood_restaurant", 4.4, 3300, "Cais do Sodré 7, Cais do Sodré", "12:00 PM – 11:00 PM", true),
  P("Pastelaria Doce Sol", "bakery", 4.7, 4100, "Rua Augusta 90, Baixa", "7:00 AM – 7:00 PM", true),
  P("O Cantinho Verde", "portuguese_restaurant", 4.3, 870, "Rua da Rosa 22, Bairro Alto", "6:00 PM – 11:00 PM", false),
];

const src = (title: string, url: string, content: string) => ({ title, url, content });

export const SCENARIOS: Scenario[] = [
  { id: "nightlife-en", query: "ibiza clubs", lang: "en", intent: "nightlife", focus: "Ibiza, Spain", evidence: evidence({ places: CLUBS }), okPhrases: ["Ibiza"] },
  { id: "nightlife-es", query: "las mejores discotecas de Ibiza", lang: "es", intent: "nightlife", focus: "Ibiza, Spain", evidence: evidence({ places: CLUBS }), okPhrases: ["Ibiza"] },
  { id: "ramen-en", query: "best ramen in toronto", lang: "en", intent: "food", focus: "Toronto, Ontario, Canada", evidence: evidence({ places: RAMEN }), okPhrases: ["Toronto"] },
  { id: "ramen-fr", query: "les meilleurs ramen à Toronto", lang: "fr", intent: "food", focus: "Toronto, Ontario, Canada", evidence: evidence({ places: RAMEN }), okPhrases: ["Toronto"] },
  { id: "museums-en", query: "which museums are worth it in lisbon", lang: "en", intent: "history_culture", focus: "Lisbon, Portugal", evidence: evidence({ places: MUSEUMS }), okPhrases: ["Lisbon"] },
  { id: "thin-vegan", query: "vegan restaurants in millbrook", lang: "en", intent: "food", focus: "Millbrook", evidence: evidence({ places: VEGAN }), thin: true, okPhrases: ["Millbrook"] },
  { id: "dislike-seafood", query: "where should we eat in alfama tonight", lang: "en", intent: "food", focus: "Alfama, Lisbon, Portugal", evidence: evidence({ places: SEAFOOD_MIX }), dislikes: ["seafood"], forbidden: ["Casa do Peixe", "Marisqueira do Cais"], okPhrases: ["Alfama", "Lisbon"] },
  { id: "events-en", query: "anything on while we're in toronto", lang: "en", intent: "events", focus: "Toronto, Ontario, Canada",
    evidence: evidence({ events: [
      { title: "Night Owls Live", url: "https://tickets.example/night-owls", date: "2026-12-19 20:00", venue: "Rivoli Hall", source: "ticketmaster", startDate: "2026-12-19", relToTrip: "in", offsetDays: 0 },
      { title: "Winter Lights Market", url: "https://tickets.example/winter-lights", date: "2026-12-20 11:00", venue: "Harbour Square", source: "eventbrite", startDate: "2026-12-20", relToTrip: "in", offsetDays: 0 },
      { title: "Holiday Pops Concert", url: "https://tickets.example/pops", date: "2026-12-21 15:00", venue: "Grand Theatre", source: "ticketmaster", startDate: "2026-12-21", relToTrip: "in", offsetDays: 0 },
    ] as never }), okPhrases: ["Toronto"] },
  { id: "safety-web", query: "is it safe to walk around alfama at night", lang: "en", intent: "discovery", focus: "Alfama, Lisbon, Portugal",
    evidence: evidence({ sources: [
      src("Lisbon safety guide", "https://guide.example/lisbon-safety", "Alfama is generally safe at night, but pickpockets work the crowded tram 28 route. The steep, poorly lit alleys are easy to get lost in. Taxi from the Fado houses costs about 6 euros."),
      src("Travel forum: Alfama after dark", "https://forum.example/alfama-night", "Locals say stick to the main lanes after midnight. Violent crime is rare."),
    ] }), okPhrases: ["Alfama", "Lisbon"] },
  { id: "tipping-web", query: "do i need to tip in japan", lang: "en", intent: "discovery", focus: "Japan",
    evidence: evidence({ sources: [src("Tipping in Japan", "https://guide.example/japan-tipping", "Tipping is not expected in Japan and can cause confusion. Service is included. High-end ryokan may add a 10 to 15 percent service charge to the bill.")] }), okPhrases: ["Japan"] },
];

/** Day-writer cases: [title, id, category, kind]. */
export type DayCase = { id: string; traveller: string; request: string; days: Array<{ number: number; city?: string; candidates: Array<[string, string, string, string, boolean?]>; events?: string[]; must?: string }> };
export const DAY_CASES: DayCase[] = [
  { id: "three-days", traveller: "solo, first trip, likes food and art, moderate pace", request: "Plan my first 3 days", days: [
    { number: 1, candidates: [["Art Gallery Norte", "d1", "museum", "Museums"], ["Mercado Velho", "d2", "market", "Markets"], ["Cozinha Thai Lua", "d3", "thai_restaurant", "Thai food"], ["Museu Central", "d4", "museum", "Museums"], ["Tacos del Sol", "d5", "mexican_restaurant", "Tacos"], ["Rua das Cores", "d6", "tourist_attraction", "Street art"]] },
    { number: 2, candidates: [["Torre Alta", "d7", "tourist_attraction", "Skyline views"], ["Ferry das Ilhas", "d8", "ferry_terminal", "Waterfront"], ["Mercado do Rio", "d9", "market", "Markets"], ["Bairro da Destilaria", "d10", "tourist_attraction", "Historic districts"], ["Bar Raiz", "d11", "bar", "Bars"], ["Parque da Olaria", "d12", "park", "Parks"]] },
    { number: 3, candidates: [["Cataratas Tours", "d13", "tour_operator", "Day trip", true], ["Passeio Atrás das Quedas", "d14", "tourist_attraction", "Day trip", true], ["Roda Gigante Falls", "d15", "amusement", "Day trip", true], ["Zona Turística Falls", "d16", "tourist_attraction", "Day trip", true]] },
  ] },
  { id: "relaxed-family", traveller: "family with two kids (6 and 9), relaxed pace, no late nights", request: "Plan 2 relaxed days with the kids", days: [
    { number: 1, candidates: [["Aquário Grande", "f1", "aquarium", "Family"], ["Parque dos Patos", "f2", "park", "Parks"], ["Gelados da Praça", "f3", "ice_cream_shop", "Treats"], ["Discoteca Eclipse", "f4", "night_club", "Nightlife"], ["Museu da Ciência Viva", "f5", "museum", "Family"]] },
    { number: 2, candidates: [["Jardim Zoológico Vale", "f6", "zoo", "Family"], ["Pizzaria Bambino", "f7", "pizza_restaurant", "Casual food"], ["Teleférico da Baía", "f8", "tourist_attraction", "Views"]] },
  ] },
  { id: "thin-and-empty", traveller: "couple, slow pace", request: "Plan 3 days", days: [
    { number: 1, candidates: [["Castelo Pequeno", "t1", "tourist_attraction", "Sights"], ["Café da Torre", "t2", "cafe", "Cafes"]] },
    { number: 2, candidates: [["Igreja Velha", "t3", "church", "Sights"]] },
    { number: 3, candidates: [] },
  ] },
  { id: "booked-event", traveller: "friends, moderate pace, here for a hockey game", request: "Plan my 2 days around the game", days: [
    { number: 1, candidates: [["Hall da Fama", "e1", "museum", "Museums"], ["Churrasqueira Central", "e2", "restaurant", "Food"], ["Passeio da Baía", "e3", "tourist_attraction", "Waterfront"]] },
    { number: 2, candidates: [["Mercado Norte", "e4", "market", "Markets"], ["Café Rio", "e5", "cafe", "Cafes"], ["Galeria Praça", "e6", "art_gallery", "Art"]], events: ["Maple Leafs v Lightning | 19:30 | Arena Central"], must: "Maple Leafs v Lightning at Arena Central, 19:30" },
  ] },
];
