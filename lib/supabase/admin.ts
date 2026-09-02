import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
export function createSupabaseAdminClient() { const env = getPublicEnv(); const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!env.NEXT_PUBLIC_SUPABASE_URL || !key) throw new Error("Supabase admin is not configured."); return createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } }); }
