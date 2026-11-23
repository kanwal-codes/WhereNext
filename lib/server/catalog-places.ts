import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPlaceRepository, type CatalogVerifier } from "@/features/places/infrastructure/placeRepository";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";

/** A new catalog row comes from Google, keyed by the id the client asked for. Any other provider is refused: nothing else saves places. */
const verifyWithGoogle: CatalogVerifier = async (place) => {
  if (place.provider !== "google-places") return null;
  const found = await new GooglePlacesProvider().catalogPlace(place.providerId);
  return found ? { ...found, providerId: place.providerId } : null;
};

/** The place repository every save route uses: the user's client for the trip link, the service role for the shared catalog. */
export function createCatalogPlaceRepository(supabase: SupabaseClient) {
  return createPlaceRepository(supabase, createSupabaseAdminClient(), verifyWithGoogle);
}
