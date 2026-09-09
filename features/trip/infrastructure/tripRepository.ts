import { tripDurationDays, type CreateTripInput, type Trip } from "../domain/trip";
import { mergePreferences } from "@/packages/contracts/preferences";
import { createConversationRepository } from "@/features/conversation/infrastructure/conversationRepository";
import type { SupabaseClient } from "@supabase/supabase-js";

const COLUMNS = "id,name,destination,origin,duration_days,start_date,end_date,travelers,preferences,hero_photo_name";

function automaticTripName(input: CreateTripInput): string {
  if (input.name !== "Untitled trip") return input.name;
  const destination = input.destination?.split(",")[0].trim();
  if (destination) return `${destination} trip`;
  return `New trip · ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date())}`;
}

/** A short opener + a few starter chips so a brand-new trip's chat isn't a blank page. */
function seedOpener(input: CreateTripInput) {
  const place = input.destination?.split(",")[0].trim() || "your trip";
  const draft = !input.destination;
  return {
    content: draft ? "Let’s make this trip yours. Where are you thinking about going? You can also skip that for now and start with a feeling, a season, or a kind of trip." : `I can help you plan ${place}. Tell me what you’re after, or start with one of these.`,
    blocks: [
      {
        type: "actions",
        items: draft ? [{ label: "I’m not sure yet", prompt: "I’m not sure about the destination yet. Help me work out what kind of trip I want." }] : [
          { label: "Things to do", prompt: `What are the best things to do in ${place}?` },
          { label: "Where to stay", prompt: `Which area should I stay in for ${place}?` },
          { label: "Build a day plan", prompt: `Draft a rough day-by-day plan for ${place}.` },
        ],
      },
    ],
  };
}

export function createTripRepository(supabase: SupabaseClient) { return {
  async create(userId: string, input: CreateTripInput): Promise<Trip> {
    // A retry of the same attempt (the first request actually succeeded but the client never
    // saw the response) must return the trip already created, not insert a second blank one.
    // Checked here rather than left to a plain upsert because creation cascades into
    // trip_members/trip_preferences/the opener message — those must not re-run on a retry either.
    if (input.idempotencyKey) {
      const existing = await supabase.from("trips").select(COLUMNS).eq("owner_id", userId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return existing.data;
    }
    const tripId = crypto.randomUUID();
    // When we have a real date pair, the length is derived from it; otherwise use the stated length.
    const durationDays = tripDurationDays(input.startDate, input.endDate) ?? input.durationDays ?? null;
    const { error } = await supabase.from("trips").insert({ id: tripId, owner_id: userId, name: automaticTripName(input), destination: input.destination ?? null, origin: input.origin ?? null, duration_days: durationDays, start_date: input.startDate ?? null, end_date: input.endDate ?? null, travelers: input.travelerCount ?? null, idempotency_key: input.idempotencyKey ?? null });
    if (error) throw error;
    const member = await supabase.from("trip_members").insert({ trip_id: tripId, user_id: userId, role: "owner" });
    if (member.error) throw member.error;
    // Seed this trip's preferences from the traveller's cross-trip profile. A
    // missing profile or a read failure must never block trip creation.
    const profileData = await supabase.from("profiles").select("data").eq("id", userId).maybeSingle()
      .then((r) => (r.data?.data ?? {}) as Record<string, unknown>, () => ({}));
    const seeded = mergePreferences(profileData, (input.preferences ?? {}) as Record<string, unknown>);
    const preferences = await supabase.from("trip_preferences").insert({ trip_id: tripId, data: seeded });
    if (preferences.error) throw preferences.error;

    // A seed-message failure must never fail trip creation.
    const opener = seedOpener(input);
    await createConversationRepository(supabase)
      .append(tripId, userId, { role: "assistant", content: opener.content, idempotencyKey: "opener", metadata: { blocks: opener.blocks } })
      .catch(() => undefined);

    const created = await supabase.from("trips").select(COLUMNS).eq("id", tripId).single();
    if (created.error) throw created.error;
    return created.data;
  },
  async get(id: string): Promise<Trip | null> {
    const result = await supabase.from("trips").select(COLUMNS).eq("id", id).maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }
}; }
