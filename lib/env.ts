export function getPublicEnv() {
  // Keep these references static so Next.js replaces them in the browser bundle.
  // This module must stay dependency-free — it's imported by the edge middleware.
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    // Not a secret — it's meant to sit in a public outbound affiliate URL. Unset until the
    // GetYourGuide affiliate signup is done; features gate on it being present.
    NEXT_PUBLIC_GETYOURGUIDE_PARTNER_ID: process.env.NEXT_PUBLIC_GETYOURGUIDE_PARTNER_ID,
  };
}
