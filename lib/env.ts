export function getPublicEnv() {
  // Keep these references static so Next.js replaces them in the browser bundle.
  // This module must stay dependency-free — it's imported by the edge middleware.
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}
