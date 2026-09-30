import { Beer, BedDouble, Bus, Car, Castle, Church, Clock, Coffee, Coins, Compass, GlassWater, HandCoins, Landmark, Languages, Plug, Siren, Smartphone, Ticket, Zap, MapPin, Martini, Moon, PersonStanding, Plane, Ship, ShoppingBag, ShoppingBasket, TicketCheck, TrainFront, TramFront, TreeDeciduous, Utensils, type LucideIcon } from "lucide-react";

export type Glyph = { icon: LucideIcon; label: string };
type Rule = [RegExp, Glyph];

/** What a place or stop actually is, judged from its name. Order matters: the first rule that matches wins. */
const BY_NAME: Rule[] = [
  [/\b(?:cathedral|church|basilica|abbey|chapel|mosque|temple|synagogue|notre[- ]dame|oratoire)\b/i, { icon: Church, label: "Place of worship" }],
  [/\b(?:castle|fort|fortress|palace|chateau|château|citadel)\b/i, { icon: Castle, label: "Castle" }],
  [/\b(?:park|parc|garden|gardens|jardin|trail|hike|hiking|mount|mont|mountain|lake|lac|beach|forest|reserve|island|île|ile|falls|canyon|lookout|summit)\b/i, { icon: TreeDeciduous, label: "Outdoors" }],
  [/\b(?:market|marché|marche|souk|bazaar|food hall)\b/i, { icon: ShoppingBasket, label: "Market" }],
  [/\b(?:shop|shops|shopping|boutique|mall|store|outlet)\b/i, { icon: ShoppingBag, label: "Shopping" }],
  [/\b(?:museum|musée|musee|gallery|galerie|exhibit|exhibition)\b/i, { icon: Landmark, label: "Museum" }],
  [/\b(?:pub|brewery|taproom|beer|tavern)\b/i, { icon: Beer, label: "Pub" }],
  [/\b(?:bar|cocktail|club|lounge|nightclub|speakeasy|rooftop)\b/i, { icon: Martini, label: "Bar" }],
  [/\b(?:cafe|café|coffee|bakery|patisserie|pâtisserie|bagel|espresso|brunch|breakfast)\b/i, { icon: Coffee, label: "Café" }],
  [/\b(?:restaurant|dinner|lunch|bistro|brasserie|diner|eatery|poutine|sushi|pizza|ramen|steakhouse|kitchen|grill|food)\b/i, { icon: Utensils, label: "Food" }],
  [/\b(?:hostel|hotel|inn|lodge|airbnb|check[- ]in|check[- ]out|bags|luggage|drop bags|accommodation)\b/i, { icon: BedDouble, label: "Stay" }],
  [/\b(?:airport|flight|terminal|depart|arrive|arrival)\b/i, { icon: Plane, label: "Flight" }],
  [/\b(?:ferry|boat|cruise)\b/i, { icon: Ship, label: "Boat" }],
  [/\b(?:tram|streetcar)\b/i, { icon: TramFront, label: "Tram" }],
  [/\b(?:bus)\b/i, { icon: Bus, label: "Bus" }],
  [/\b(?:metro|subway|train|rail|station|underground|tube|rer)\b/i, { icon: TrainFront, label: "Train" }],
  [/\b(?:taxi|uber|lyft|drive|driving|car)\b/i, { icon: Car, label: "Car" }],
  [/\b(?:walk|walking|stroll|promenade)\b/i, { icon: PersonStanding, label: "Walk" }],
  [/\b(?:concert|show|theatre|theater|opera|game|match|festival|gig|tickets?)\b/i, { icon: TicketCheck, label: "Event" }],
];

/** The plan's own kind, used when the name says nothing. */
const BY_KIND = {
  food: { icon: Utensils, label: "Food" },
  sight: { icon: Landmark, label: "Sight" },
  activity: { icon: Compass, label: "Activity" },
  nightlife: { icon: Martini, label: "Nightlife" },
  transit: { icon: TrainFront, label: "Getting there" },
  event: { icon: TicketCheck, label: "Event" },
  rest: { icon: Moon, label: "Rest" },
} as const satisfies Record<string, Glyph>;

export type StopKind = keyof typeof BY_KIND;

/** The icon for a stop: what it is by name first, then what kind of stop the plan says it is. */
export function stopGlyph(kind: StopKind | undefined, title: string): Glyph {
  return BY_NAME.find(([re]) => re.test(title))?.[1] ?? BY_KIND[kind ?? "activity"];
}

/** The stand-in shown where a place has no photo: what the place is, from its category or name. */
export function placeGlyph(category: string | null | undefined, name: string): Glyph {
  const text = `${category ?? ""} ${name}`.replace(/_/g, " ");
  return BY_NAME.find(([re]) => re.test(text))?.[1] ?? { icon: MapPin, label: "Place" };
}

const TRANSIT_MODES = new Set<LucideIcon>([Bus, TramFront, TrainFront, Ship, Plane]);

/** A route step's mode, from the step's own words ("TRANSIT bus 208 → Cais Sodré", "WALK to hotel"). */
export function stepGlyph(step: string): Glyph {
  if (/^\s*walk/i.test(step)) return { icon: PersonStanding, label: "Walk" };
  if (/^\s*driv/i.test(step)) return { icon: Car, label: "Drive" };
  return BY_NAME.find(([re, g]) => TRANSIT_MODES.has(g.icon) && re.test(step))?.[1] ?? { icon: TrainFront, label: "Transit" };
}

const BY_FACT: Rule[] = [
  [/\b(?:plug|socket|adapter|outlet type|type [a-z]\b)/i, { icon: Plug, label: "Plug" }],
  [/\b(?:volt|voltage|230v|110v|frequency)\b/i, { icon: Zap, label: "Voltage" }],
  [/\b(?:tip|tipping|gratuity)\b/i, { icon: HandCoins, label: "Tipping" }],
  [/\b(?:currency|cash|card|atm|exchange|money|euro|dollar|pound|yen|rate)\b/i, { icon: Coins, label: "Money" }],
  [/\b(?:emergency|police|ambulance|fire brigade|112|911|999)\b/i, { icon: Siren, label: "Emergency" }],
  [/\b(?:language|speak|english|french|spoken|phrase)\b/i, { icon: Languages, label: "Language" }],
  [/\b(?:tap water|drinking water|water)\b/i, { icon: GlassWater, label: "Water" }],
  [/\b(?:sim|esim|roaming|wifi|wi-fi|data plan|phone)\b/i, { icon: Smartphone, label: "Connectivity" }],
  [/\b(?:metro|transit pass|transit card|ticket|fare|pass)\b/i, { icon: Ticket, label: "Transit" }],
  [/\b(?:time zone|timezone|hours|opening|late|early|shops? close)\b/i, { icon: Clock, label: "Time" }],
];

/** The icon for a practical fact ("Plug type", "Tipping", "Emergency number"), or null when nothing fits. */
export function factGlyph(text: string): Glyph | null {
  return BY_FACT.find(([re]) => re.test(text))?.[1] ?? null;
}
