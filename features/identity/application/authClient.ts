import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function signIn(email: string, password: string) { return createSupabaseBrowserClient().auth.signInWithPassword({ email, password }); }
export function signUp(email: string, password: string, redirectTo: string) { return createSupabaseBrowserClient().auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } }); }
export function resetPassword(email: string, redirectTo: string) { return createSupabaseBrowserClient().auth.resetPasswordForEmail(email, { redirectTo }); }
export function signInWithGoogle(redirectTo: string) {
  return createSupabaseBrowserClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
}
export function signOut() { return createSupabaseBrowserClient().auth.signOut(); }
export function updatePassword(password: string) { return createSupabaseBrowserClient().auth.updateUser({ password }); }
export function updateName(name: string) { return createSupabaseBrowserClient().auth.updateUser({ data: { name } }); }
/** Triggers Supabase's own confirmation-email flow — the address only changes once the user clicks it. */
export function updateEmail(email: string) { return createSupabaseBrowserClient().auth.updateUser({ email }); }

/**
 * Upload a new profile photo to the `avatars` bucket (public read, write restricted to the
 * user's own folder by storage policy — see migration 0019) and point the account at it.
 * Same `avatar_url` key Google OAuth already sets, so this cleanly overrides that default.
 */
export async function uploadAvatar(userId: string, file: File) {
  const supabase = createSupabaseBrowserClient();
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const upload = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
  if (upload.error) return { error: upload.error };
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const { error } = await supabase.auth.updateUser({ data: { avatar_url: data.publicUrl } });
  return { error, url: data.publicUrl };
}

/** Unlink the Google identity from this account (requires another way to sign in — email/password). */
export async function disconnectGoogle() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) return { error };
  const google = data?.identities.find((i) => i.provider === "google");
  if (!google) return { error: null };
  return supabase.auth.unlinkIdentity(google);
}
