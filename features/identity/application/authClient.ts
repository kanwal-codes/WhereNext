import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function signIn(email: string, password: string) { return createSupabaseBrowserClient().auth.signInWithPassword({ email, password }); }
export function signUp(email: string, password: string, redirectTo: string) { return createSupabaseBrowserClient().auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } }); }
export function resetPassword(email: string, redirectTo: string) { return createSupabaseBrowserClient().auth.resetPasswordForEmail(email, { redirectTo }); }
export function signOut() { return createSupabaseBrowserClient().auth.signOut(); }
export function updatePassword(password: string) { return createSupabaseBrowserClient().auth.updateUser({ password }); }
